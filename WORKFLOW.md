# 开发工作流铁律

> **记录于 2026-08-21（用户明确要求，最高优先级约束），2026-08-24 更新为"无部署目录"模式。**
> 违反这条规则曾让线上代码不可追溯（见下方"为什么"），以后任何代码改动都必须走本流程。

## 规则

1. **所有代码修改，一律在本源码 repo `~/repos/loreweaver-web`（本目录）进行。**
2. **不存在部署目录**：`~/apps/loreweaver-web`、`~/apps/loreweaver` 已于 2026-08-24 删除（残留 root 文件在 `~/apps/.loreweaver-*-trash`）。开发、数据、部署全在本 repo（数据在 `./data`，已被 `.gitignore` 排除）。
3. **禁止** `docker exec` 进容器改文件、禁止在容器里直接编辑代码。
4. 引擎代码在 `~/repos/loreweaver`（另一 repo）；镜像构建时通过 compose 的 `engine` 上下文（`${ENGINE_CONTEXT:-/home/melon/repos/loreweaver}`）直接从该 repo 打入，无需同步任何其他目录。
5. 改好后，提交、推送、直接在 repo 里部署：

```bash
# 1) 在本 repo 提交
cd ~/repos/loreweaver-web
git add -A && git commit -m "<描述改动>"

# 2) 推送到 origin（保持可追溯）
git push

# 3) 直接在 repo 里重建镜像 + 重启容器
docker compose up --build -d
```

> 只改了引擎（`~/repos/loreweaver`）时：在该 repo 提交推送后，直接 `cd ~/repos/loreweaver-web && docker compose up --build -d` 即可，无需任何 pull。

## 为什么

2026-08-21 排查发现：当时存在部署目录 `~/apps/loreweaver-web`（独立 git checkout），长期被当作开发场所直接改代码，结果：

- 它领先 `origin/main` **27 个提交**，还挂着 **15 个未提交改动 + 3 个未跟踪文件**；
- 正在运行的 docker 镜像 `loreweaver-web:local` 是它 **16:26 的脏快照**（只含当时已存在的部分改动，17:02 又有 8 个文件改动没进镜像）；
- 本地小改动（`serve_both.py`、`InviteKeysPanel.tsx` 等）只存在于部署目录，repo 里根本没有，极易丢失。

本 repo 当时停在 `origin/main`（`6f4c701`），比线上落后一大截，代码无法追溯。

2026-08-24 根治：废除"双 checkout"模式——数据目录迁回本 repo（`./data`），compose 的引擎上下文指向 `~/repos/loreweaver` 源码 repo，部署目录整体删除。现在线上跑的就是 repo 的代码，不存在第二份可漂移的副本。
