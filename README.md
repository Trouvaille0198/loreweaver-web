# Loreweaver Web

The **browser client** for [Loreweaver](https://github.com/1A7432/loreweaver) — the self-hosted AI
gamemaster engine. A fork of the [Loreweaver Studio](https://github.com/1A7432/loreweaver-studio)
frontend (MIT) with the Tauri/Rust shell removed and the transport replaced: the browser speaks the
engine's open wire protocol (2.3) over **WebSocket** (`loreweaver-protocol`'s browser-safe
`WsClient`) instead of an Iroh p2p ticket — a browser cannot run Iroh QUIC.

It gives you the full play surface in a tab: markdown narrative log with colour-coded dice, live
character / party / variables panels, module panels (tier-1 blocks; tier-2 executable panels
degrade to their declared fallback, exactly as the terminal client does), media sharing, the
three-layer audio mixer, and the keeper screens (rooms & invites, model, module, rules, skills,
character). What it does **not** have: the studio (card/pack workbench — it needs native
file/process access) and one-click local hosting (it cannot spawn a server process).

## How it connects

```
your browser ──ws(s)://host:port──► loreweaver server running `python -m app --web`
                    │
              join {key} ──► keystore auth ──► room session (same SessionCore as Iroh/TUI)
```

Ask your Keeper for the **server URL** (`ws://host:port`) and an **invite key** — not a ticket.
No account, no p2p, no port forwarding on the browser side; the server must be reachable over
HTTP/WebSocket (LAN IP, or a public host / reverse proxy — see `docs/deploy.md` in the engine).

## Run it

### 1. The server (`--web` mode)

```bash
# from the loreweaver engine checkout
python -m app --web --host 0.0.0.0 --port 8787 --static-dir ../loreweaver-web/dist
```

`--web` serves the WebSocket endpoint **and** this client's built `dist/` on the same port (one
origin, no CORS). Omit `--static-dir` to serve WS only (a reverse proxy can host the client).
Keys live in `keys.toml` (`--tui-key add` mints invite keys; a keeper key is auto-minted on first
run). No API key needed to taste it: the offline demo Keeper runs the sample adventure.

### 2. Docker (recommended deployment)

The image builds **both** repos — this client plus the engine checkout — because `--web` is a
fork feature not necessarily on the published upstream:

```bash
docker compose up --build        # uses ../loreweaver as the engine context
# or plain docker:
docker build --build-context engine=../loreweaver -t loreweaver-web .
docker run --rm -p 8787:8787 -v "$PWD/data:/data" loreweaver-web
```

Then open `http://<host>:8787/` — the SPA loads, the keeper key is printed on first start, and
players join with minted invite keys. Campaign data, keys and media live in **`./data` on the
host** (a bind mount, not a named volume): scp a module straight into `./data/`, back it up with
a plain `tar`, read `keys.toml` — no `docker exec` required. Point the model at a provider with
`TRPG_LLM__*` environment variables (see the engine's `.env.example`).

### 3. Development

```bash
bun install
bun run dev          # vite dev server; connect it to a `--web` server without statics
bun run test         # vitest — all offline, jsdom
bun run typecheck
bun run i18n:lint    # en/zh parity, no hardcoded user-facing strings
bun run build        # production bundle → dist/
```

## What differs from Studio / the TUI

| Capability               | Web                                  | Studio (desktop)  | TUI             |
| ------------------------ | ------------------------------------ | ----------------- | --------------- |
| Transport                | WebSocket                            | Iroh p2p (Rust)   | Iroh + WS       |
| One-click local hosting  | —                                    | ✅                | ✅              |
| Card / pack studio       | —                                    | ✅                | —               |
| Tier-2 executable panels | fallback blocks                      | ✅                | fallback blocks |
| Media upload / audio     | ✅ (WebCrypto hash, in-memory cache) | ✅ (native cache) | ✅              |

## Layout notes

- `src/lib/transport.ts` — the seam: Tauri `invoke` (dead in the browser) vs
  `src/lib/webTransport.ts` (the `WsClient`). Everything else is transport-agnostic.
- `src/features/play/` — the whole play UI, reused from Studio unchanged except the
  `isTauri()` gates that hid media/audio/avatar paths from the browser.
- `src/lib/media.ts`, `src/features/play/panels/assets.ts` — the browser halves of the
  content-addressed media channel (sha256 via WebCrypto; bytes cached in memory by hash).

## License

MIT — see [LICENSE](LICENSE). Derived from [loreweaver-studio](https://github.com/1A7432/loreweaver-studio)
(MIT, © 2026 1A7432).
