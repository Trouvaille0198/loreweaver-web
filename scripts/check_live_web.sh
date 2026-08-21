#!/usr/bin/env bash
# Live-connect smoke gate (web ↔ engine): start a REAL `--web` engine from the
# sibling checkout, dial it with the REAL `loreweaver-protocol` WsClient, and
# require a clean protocol-2 join handshake. This is the web-repo half of the
# cross-repo contract — the vendored conformance tables pin the formats, this
# pins that the two processes still talk.
#
#   bash scripts/check_live_web.sh
#
# Engine repo: $TRPG_ENGINE_REPO, default ../loreweaver (sibling checkout).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE_REPO="${TRPG_ENGINE_REPO:-$ROOT/../loreweaver}"
PORT="${LIVE_WEB_PORT:-8799}"
WORK="$(mktemp -d)"
SERVER_PID=""
cleanup() {
  # Kill the server's whole process group (the subshell PID is not python's).
  if [ -n "$SERVER_PID" ]; then
    kill -- "-$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

if [ ! -d "$ENGINE_REPO" ]; then
  echo "engine repo not found at $ENGINE_REPO (set TRPG_ENGINE_REPO)" >&2
  exit 1
fi

# A stale server from a previous run would answer our join with ITS keys — a
# confusing bad_key. Refuse to run over one.
if pgrep -f "python .* -m app --web .*--port $PORT" >/dev/null 2>&1; then
  echo "a --web server is already listening on port $PORT — stop it first (or set LIVE_WEB_PORT)" >&2
  exit 1
fi

echo "engine: $ENGINE_REPO"
echo "starting --web on port $PORT…"

# Prefer the engine's own venv; fall back to whatever `python` is on PATH.
if [ -x "$ENGINE_REPO/.venv/bin/python" ]; then
  PY="$ENGINE_REPO/.venv/bin/python"
else
  PY="python"
fi

(
  cd "$ENGINE_REPO"
  # setsid: own process group, so the trap can kill python itself.
  exec setsid env LANG=C "$PY" -m app --web --host 127.0.0.1 --port "$PORT" \
    --keys "$WORK/keys.toml" --static-dir "$ROOT/dist" >"$WORK/server.log" 2>&1
) &
SERVER_PID=$!

# Wait for the port, then read the auto-minted keeper key out of the log.
for _ in $(seq 1 30); do
  if grep -q "Keeper key\|守秘人 key" "$WORK/server.log" 2>/dev/null; then
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "server died on startup:" >&2
    cat "$WORK/server.log" >&2
    exit 1
  fi
  sleep 0.5
done

KEY="$(grep -E "Keeper key|守秘人 key" "$WORK/server.log" | grep -oE "[A-Za-z0-9_-]{20,}" | head -1)"
if [ -z "$KEY" ]; then
  echo "no keeper key in server log:" >&2
  cat "$WORK/server.log" >&2
  exit 1
fi

echo "dialing ws://127.0.0.1:$PORT with the auto-minted keeper key…"
(
  cd "$ROOT"
  bun scripts/live_join.ts "ws://127.0.0.1:$PORT/" "$KEY" "roundtrip"
)
