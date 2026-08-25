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
# BuildKit cache mounts: the dependency download cache and node_modules live
# OUTSIDE the image layers, so a --no-cache rebuild re-runs install/build but
# reuses cached downloads instead of hitting the network for every dependency.
# node_modules is not part of the final image anyway (only dist/ is copied on),
# so keeping it out of the layers loses nothing.
RUN --mount=type=cache,target=/bun-cache,id=web-bun \
    --mount=type=cache,target=/src/node_modules,id=web-modules \
    BUN_INSTALL_CACHE_DIR=/bun-cache bun install --frozen-lockfile && bun run build

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 \
    TRPG_DATA_DIR=/data \
    TRPG_WEB_STATIC_DIR=/srv/web-dist
WORKDIR /srv
# ---- 依赖层：只复制 pyproject.toml，引擎代码改动不触发依赖重装 ----
# 从 pyproject.toml 提取 dependencies + `vector` extra 先装好（tomllib 是
# Python 3.11+ 内置）。该层只在依赖清单变化时重建；pip 用 BuildKit 持久
# cache mount 缓存 wheel，即使 `--no-cache` 全量重建也不重新下载。
COPY --from=engine /pyproject.toml /tmp/engine-deps/pyproject.toml
RUN --mount=type=cache,target=/root/.cache/pip,id=engine-pip \
    pip install $(python3 -c "import tomllib; d = tomllib.load(open('/tmp/engine-deps/pyproject.toml','rb'))['project']; print(' '.join(d['dependencies'] + d['optional-dependencies'].get('vector', [])))") \
    && rm -rf /tmp/engine-deps
# ---- 引擎代码层：引擎每有新提交只重建这一层（约 10s）----
# The engine checkout (with its .git, so setuptools-scm can version it) is
# mounted from the `engine` named context — hence `COPY --from=engine`, not
# `COPY .`. A directory named context exposes its contents at the context
# ROOT, so the repo lands under /repo with `COPY --from=engine / /repo`.
# `--no-deps`：依赖已在上一层装好，这里只安装引擎本体代码。
COPY --from=engine / /repo
# pip 的 wheel 缓存走 cache mount（id=engine-pip，与依赖层共享），--no-cache
# 重建时仍复用已下载的 wheel；cache mount 永远不进镜像层。
RUN --mount=type=cache,target=/root/.cache/pip,id=engine-pip \
    pip install --no-deps "/repo[vector]" && rm -rf /repo
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
