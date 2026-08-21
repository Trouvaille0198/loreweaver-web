# 开发工作流铁律

> **记录于 2026-08-21（用户明确要求，最高优先级约束）。**
> 违反这条规则曾让线上代码不可追溯（见下方"为什么"），以后任何代码改动都必须走本流程。

## 规则

1. **所有代码修改，一律在本源码 repo `~/repos/loreweaver-web`（本目录）进行。**
2. **禁止**直接在部署目录 `~/apps/loreweaver-web` 里改代码（`src/`、`docker-compose.yml`、新增文件都不行）。
3. **禁止** `docker exec` 进容器改文件、禁止在容器里直接编辑代码。
4. 改好后，先提交、再部署到 docker 看效果：

```bash
# 1) 在本 repo 提交
cd ~/repos/loreweaver-web
git add -A && git commit -m "<描述改动>"

# 2) 推送到 origin（推荐——部署目录靠 pull 同步，两处才能一致）
git push

# 3) 部署目录拉取 + 重建镜像 + 重启容器
cd ~/apps/loreweaver-web
git pull && docker compose up --build -d
```

## 为什么

2026-08-21 排查发现：部署目录 `~/apps/loreweaver-web` 是一个独立的 git checkout，长期被当作开发场所直接改代码，结果：

- 它领先 `origin/main` **27 个提交**，还挂着 **15 个未提交改动 + 3 个未跟踪文件**；
- 正在运行的 docker 镜像 `loreweaver-web:local` 是它 **16:26 的脏快照**（只含当时已存在的部分改动，17:02 又有 8 个文件改动没进镜像）；
- 本地小改动（`serve_both.py`、`InviteKeysPanel.tsx` 等）只存在于部署目录，repo 里根本没有，极易丢失。

本 repo 当时停在 `origin/main`（`6f4c701`），比线上落后一大截，代码无法追溯。

## 待办（遗留债）

- [ ] 把部署目录领先的 27 个提交合回本 repo
- [ ] 评估部署目录的未提交改动（含 `serve_both.py`、`InviteKeysPanel.tsx`）并合回本 repo
- [ ] 清理部署目录工作区，让它恢复为"只 pull + 重建"的纯运行副本
