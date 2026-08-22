# syntax=docker/dockerfile:1
# Loreweaver web deployment — the browser client (this repo) plus the
# loreweaver server, in one image.
#
# The ENGINE comes from local source as the BuildKit named context `engine`
# (default `../loreweaver` — the sibling checkout). It must be local, not a
# `pip install git+…`: the `--web` serving mode this image runs is a fork
# feature that has not necessarily reached the published upstream.
#
# Build:
#   docker build --build-context engine=../loreweaver -t loreweaver-web .
# (docker compose v2.17+ wires the same context via `additional_contexts`.)

FROM oven/bun:1 AS web
WORKDIR /src
COPY . /src
RUN bun install --frozen-lockfile && bun run build

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 \
    TRPG_DATA_DIR=/data \
    TRPG_WEB_STATIC_DIR=/srv/web-dist
WORKDIR /srv
# The engine checkout (with its .git, so setuptools-scm can version it) is
# mounted from the `engine` named context — hence `COPY --from=engine`, not
# `COPY .`. A directory named context exposes its contents at the context
# ROOT, so the repo lands under /repo with `COPY --from=engine / /repo`.
# `vector` extra = sqlite-vec (RAG search); iroh rides the base deps as a
# py3-none wheel. No compiler needed for either.
COPY --from=engine / /repo
RUN pip install --no-cache-dir "/repo[vector]" && rm -rf /repo
# The combined runner is bind-mounted from the web checkout, while its
# web-only engine extension lives in the sibling engine checkout.
COPY --from=engine /module_admin.py /srv/module_admin.py
# Campaign data, keys, media — the one volume that survives container death.
VOLUME /data
EXPOSE 8787
# NOT under /app: a directory named `app` at the container root would shadow
# the installed `app` py-module via PEP 420 namespace packaging, breaking
# `python -m app` entirely.
COPY --from=web /src/dist /srv/web-dist
# The web transport: WS + the built SPA on one port (no Iroh, no p2p ticket —
# browsers connect over WebSocket with an invite key).
CMD ["python", "-m", "app", "--web", "--host", "0.0.0.0", "--port", "8787", \
     "--static-dir", "/srv/web-dist", "--keys", "/data/keys.toml"]
