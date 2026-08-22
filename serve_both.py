"""serve_both.py — run the WebSocket (browser) and Iroh p2p transports on ONE SessionCore.

The stock CLI keeps `--serve` (Iroh p2p) and `--web` (WebSocket + SPA static) as mutually
exclusive modes, but the engine is built for both at once: `TuiServer` and `IrohServer`
both drive the same `SessionCore` / `RoomHub`, so browser players (WS) and desktop players
(p2p via the TUI client or Loreweaver Studio) sit at the SAME live table — same room,
same turn lock, same AI-KP session, same invite keys.

This runner wires both listeners the way `app._serve_web` / `app._serve_iroh` do
individually, on one core:

  - WebSocket listener on `--host:--port` (+ the built SPA from `--static-dir`, if given);
  - Iroh p2p endpoint with a persisted secret key next to the keystore
    (`<keys>.with_name("iroh-secret.key")`), so the NodeId / shareable ticket is STABLE
    across restarts; the ticket is printed + written to `<keys>.with_name("iroh-ticket.txt")`.

If the Iroh endpoint cannot come online (relay unreachable, startup timeout), the server
DEGRADES to WebSocket-only with a warning — the browser UI never dies because of p2p.

SIGTERM (docker stop / supervisor stop) cancels both serve loops and closes cleanly so the
SQLite store is closed instead of hard-killed.
"""

from __future__ import annotations

import argparse
import asyncio
import signal
import sys
from pathlib import Path

from app import (
    Settings,
    Keystore,
    _announce_iroh_ticket,
    _announce_web_url,
    _bootstrap_keystore,
    _uses_demo_llm,
    build_web_server,
    get_i18n,
    seed_dice,
)
from module_admin import install_module_admin


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Loreweaver: WebSocket + Iroh p2p on one core")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--static-dir", dest="static_dir", default="")
    parser.add_argument("--keys", default="/data/keys.toml")
    args = parser.parse_args(argv)

    settings = Settings()
    i18n = get_i18n(settings.locale)
    keystore = Keystore.load(args.keys)
    _bootstrap_keystore(keystore, i18n, args.keys)
    core = build_web_server(
        settings,
        keystore,
        host=args.host,
        port=args.port,
        static_dir=args.static_dir,
    )
    core.admin = install_module_admin(core.admin)
    if _uses_demo_llm(core.services):
        print(i18n.t("cli.offline_demo_notice"), file=sys.stderr)
    seed_dice(0)

    started = False
    try:
        started = asyncio.run(_serve_both(core, i18n, args.keys))
    except KeyboardInterrupt:
        started = True
    finally:
        core.services.store.close()
    return 0 if started else 1


async def _serve_both(core, i18n, keys_path: str) -> bool:
    from net.iroh_server import IrohServer

    # 1) WebSocket listener (+ optional SPA static host) — exactly `--web`.
    try:
        await core.start()
    except Exception as exc:  # bind failure, etc.
        print(i18n.t("tui.web.failed", error=str(exc)), file=sys.stderr)
        return False
    scheme = "wss" if core.services.settings.tui.tls_cert_path else "ws"
    _announce_web_url(i18n, f"{scheme}://{core.host}:{core.port}/", core.static_dir)

    # 2) Iroh p2p listener on the SAME core — exactly `--serve`. Degrade to WS-only on failure.
    secret_path = Path(keys_path).with_name("iroh-secret.key")
    iroh = IrohServer(core, secret_path=secret_path)
    p2p_ok = False
    try:
        ticket = await asyncio.wait_for(iroh.start(), timeout=45)
        # Publish the shareable ticket to every welcome frame (net.session
        # `welcome_frame(..., p2p_ticket=...)`) so the web client can surface
        # it in the settings screen for desktop players.
        core.p2p_ticket = ticket
        _announce_iroh_ticket(i18n, ticket, keys_path)
        p2p_ok = True
    except ImportError:
        print(i18n.t("tui.serve.iroh.missing"), file=sys.stderr)
    except Exception as exc:  # relay unreachable, startup timeout, etc.
        print(i18n.t("tui.serve.iroh.failed", error=str(exc)), file=sys.stderr)

    loop = asyncio.get_running_loop()
    ws_task = asyncio.ensure_future(core.serve())
    iroh_task = asyncio.ensure_future(iroh.serve()) if p2p_ok else None
    stop = asyncio.Event()

    def _stop() -> None:
        stop.set()

    handler_installed = True
    try:
        loop.add_signal_handler(signal.SIGTERM, _stop)
    except NotImplementedError:  # not available on Windows
        handler_installed = False

    # Run until SIGTERM (stop event) OR one of the serve loops dies on its own.
    watch = [asyncio.ensure_future(stop.wait()), ws_task]
    if iroh_task is not None:
        watch.append(iroh_task)
    try:
        await asyncio.wait(watch, return_when=asyncio.FIRST_COMPLETED)
    finally:
        if handler_installed:
            try:
                loop.remove_signal_handler(signal.SIGTERM)
            except (NotImplementedError, ValueError):
                pass
        ws_task.cancel()
        if iroh_task is not None:
            iroh_task.cancel()
        await asyncio.gather(*watch, return_exceptions=True)
        await iroh.close()
        await core.close()
    return True


if __name__ == "__main__":
    raise SystemExit(main())
