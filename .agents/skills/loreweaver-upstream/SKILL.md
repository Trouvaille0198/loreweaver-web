---
name: loreweaver-upstream
description: 持续跟踪 loreweaver-studio（和 loreweaver 引擎）上游更新——拉取最近提交、评估可移植性、把值得的改动移植到 loreweaver-web 客户端并部署。用于"看看上游最近有没有新东西/新修复可以拿过来"。
---

# Loreweaver Upstream Watch

Loreweaver 生态有三个仓库，关系是：**引擎**（`1A7432/loreweaver`，Python 服务端）是唯一真相；**Studio**（`1A7432/loreweaver-studio`，Tauri 桌面客户端）是推荐客户端，包含 play UI 与卡牌/内容包工坊；**我们自己的 `Trouvaille0198/loreweaver-web`** 是从 Studio 的 **play UI** fork 出来的浏览器版（删掉了 `features/studio` 工坊和 Tauri/Rust 侧，只留 play 体验，用 `loreweaver-protocol` npm 包走 WebSocket）。**上游每次改动，都可能有一半值得搬进我们的 web 客户端。**

## 三个仓库的关系速查

| 仓库 | 角色 | 对我们 web 的关联 |
|---|---|---|
| `1A7432/loreweaver` | 引擎（Python 服务端） | 服务端行为、协议、`--web` 静态托管。**引擎改动决定服务端能力**，通过 Docker 镜像带过去 |
| `1A7432/loreweaver-studio` | 桌面客户端（Tauri + React） | **play UI 的源头**——`src/features/play/` 下的修复/功能大多可以直接搬 |
| `Trouvaille0198/loreweaver-web` | 我们的浏览器客户端 | fork 自 studio play UI；`loreweaver-protocol` 从 npm 消费 |

**判断可移植性的第一刀**：改动在 studio 的 `src/features/play/`（或 `src/lib/`、`src/store/`、`src/i18n/`、`src/styles.css` 中 play 相关部分）→ **可移植**；在 `features/studio/`、Tauri Rust 侧、`panel://` 桥、本地托管 → **不适用**（web 没有这些）。

## 检查流程（每次"看看上游更新"时执行）

### 1. 拉取上游最近提交

```bash
# Studio 上游（注意：本地 web 仓库的 origin 是自己的 fork，上游要单独加 remote 或 clone）
cd /tmp && rm -rf lw-studio-upstream && \
git clone --depth 60 https://github.com/1A7432/loreweaver-studio.git lw-studio-upstream && \
cd lw-studio-upstream && git log --oneline --date=iso --pretty="%h %ad %s" | head -30

# 引擎上游（我们的 loreweaver fork 就是从它 fork 的，可直接 fetch）
cd /home/melon/self-pro/loreweaver && \
git fetch https://github.com/1A7432/loreweaver.git main && \
git log --oneline FETCH_HEAD --date=iso --pretty="%h %ad %s" | head -20
```

> 也可以在 web 仓库里加 upstream remote 后 `git fetch`，但 web 是 fork 自 **studio 的 play UI 子集**，目录结构已变（删了 studio），直接 diff 会噪声很大。**studio 改动用"看提交信息 + 单文件对比"**，不要整仓库 diff。

### 2. 逐个提交评估"有无可以采取的地方"

对每条提交，看提交信息（上游写得很规范：`fix(play)/feat(play)/fix(pack)/chore` 前缀 + 一两句为什么），然后：

- **`fix(play)` / `feat(play)`** → 打开 `git show <hash>`，看是否涉及以下文件：
  - `src/features/play/**`（屏幕、面板、骰子、日志、输入框）
  - `src/lib/*`（transport、media、persistStorage、themes）
  - `src/store/*`（connection、session、media、audio、panels、admin）
  - `src/i18n/locales/{en,zh}.json`
  - `src/styles.css`
  - **命中即列入移植候选**（除非明确依赖 Tauri/Rust：`invoke(`、`@tauri-apps`、`panel://`、`hostLocal` 桌面托管）
- **`fix(pack)` / 工坊相关** → web 没有 `features/studio`，但 pack 安装/面板模板（`panels/templates.ts`、`Tier1Blocks`）web 有 → 看具体文件再定
- **协议/依赖** → `chore(deps): loreweaver-protocol X.Y.Z` → 检查 web 的 `package.json` 是否落后，落后则升级 + 跑测试（协议 major.minor 要跟引擎同步，见引擎 AGENTS.md）
- **`docs:` / `chore:` 纯文档/清理** → 一般跳过，除非提到 play 行为变化

### 3. 移植候选怎么落地

```bash
cd /home/melon/self-pro/loreweaver-web
# 1) 把上游对应文件复制过来（只复制 play 相关文件，逐一核对）
#    studio 和 web 的目录结构在 play 部分基本一致（web 删了 studio、改了少量导入路径），
#    直接 cp 后跑测试看哪里坏，比手工 merge 快
cp /tmp/lw-studio-upstream/src/features/play/screens/CharacterScreen.tsx \
   src/features/play/screens/CharacterScreen.tsx
# 2) i18n 同步：上游改了 en/zh.json 的 key 也要带上（i18n 测试会强制 en/zh 同 key 集）
# 3) 测试 + 全套校验
export PATH="$HOME/.bun/bin:$PATH"
bun run typecheck && bun run lint && bun run i18n:lint
node node_modules/vitest/vitest.mjs run     # 注意：用 node 跑，bun 的 test runner 在本机 jsdom 加载有问题
bun run build
# 4) 提交 + 推送 + 部署（loreweaver-ops skill 的流程）
git add -A && git commit -m "sync(upstream): <一句话说明搬了什么>" && git push origin main
ssh -i ~/.ssh/id_github melon@154.64.255.99 'cd ~/apps/loreweaver-web && git pull --ff-only && docker compose up --build -d'
```

### 4. 引擎侧改动（服务端能力）

引擎的提交影响服务端行为（回合、规则、命令、协议）。web 客户端一般**无需改代码**，只需在 VPS 上重建引擎镜像：

```bash
ssh -i ~/.ssh/id_github melon@154.64.255.99 \
  'cd ~/apps/loreweaver && git pull && cd ~/apps/loreweaver-web && docker compose up --build -d'
```

但若引擎**协议版本**变了（`docs/protocol.md` 大版本/小版本），web 的 `loreweaver-protocol` npm 依赖要跟着升（见步骤 2 的"协议/依赖"行）。

## 已知移植对照（2026-08-21 检查）

| 上游提交 | 内容 | 结论 |
|---|---|---|
| `95a2618` fix(play): 规则封顶的 0 损失要显示 | `diceDetail.ts` 的 MEANINGFUL_ZERO_KEYS | ✅ 已包含（fork 时间点在上游修复之后） |
| `bf40386` fix(play): 属性粘贴不崩 + 本地托管重连 | `CharacterScreen` type="text" + hostLocal 重连 | ✅ 已包含（前一半）；hostLocal 是 Tauri 专属，web 不适用 |

**经验**：web fork 时间点（2026-08-21 上午）恰好在上游当天两次修复之后，所以最近这批都自带。**以后上游每有 `fix(play)`/`feat(play)`，按上述流程走一遍。**

## 注意事项

- 上游提交信息里常带 `Claude-Session:` 链接，不用管。
- Studio 有 `bun run roundtrip` 跨仓库门禁（协议一致性），web 没有——**web 用 `loreweaver-protocol` npm 包 + 测试保障**，别试图在 web 里复刻 studio 的工坊功能（删掉是有意的，见引擎 AGENTS.md：UI 方向是协议客户端）。
- 上游大版本升级（协议 major 变化）时，先读引擎 `docs/protocol.md` 和 web `PROTOCOL_NOTES.md`，再决定是否跟。
- 别把 studio 的 Tauri/Rust 代码或 `features/studio` 搬进 web——那些依赖 `invoke`/本地文件系统，浏览器跑不了。
