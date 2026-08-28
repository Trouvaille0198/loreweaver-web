---
name: loreweaver-frontend-style
description: Audit, restructure, and implement Loreweaver Web pages and components for information hierarchy, layout, spacing, interactions, responsive behavior, media previews, and visual consistency. Use for UI optimization and especially requests to redesign, refactor, rearrange, modernize, or create a parallel page route; validate the result in Docker on port 8787.
---

# Loreweaver 前端设计与重构

用于 Loreweaver Web 的信息架构、页面布局、响应式、交互和视觉一致性修改。目标是让页面符合仓库设计语言，并在真实 Docker 页面上完成桌面端和移动端验收。

## 前置配置

先读取 skill 配置：

```bash
python3 -m json.tool ./.agents/skills/loreweaver-frontend-style/config.json
```

首次使用时：

```bash
cp ./.agents/skills/loreweaver-frontend-style/config_example.json \
  ./.agents/skills/loreweaver-frontend-style/config.json
```

配置字段、获取方式和格式要求见 `config_example.json` 的 `_help`。`config.json` 只保存本机路径和测试参数，不提交到 git。

## 必须先读的规范

在修改任何页面、组件、CSS 或交互前，完整阅读：

- `docs/DESIGN_LANGUAGE.md`
- `docs/FRONTEND_GUIDELINES.md`

重点落实：语义令牌、父级 `gap`、Surface 层级、Button 变体、760px 移动端断点、页面无横向溢出、明确的局部滚动边界、键盘焦点和浮层关闭行为。

## 任务模式

- 普通样式或交互优化：按本文工作流程完成目标区域的完整审查。
- 页面重构、重新排布、现代化设计、并行页面路由：必须完整阅读 [页面重构方法](references/page-restructure.md)，先重建信息层级，再实现视觉与交互。

页面重构必须同时改变页面解剖（对象概览 hero、导航形态、主栏/辅助栏坐标系统、跨文件信息归属中至少两项）和页面内重复组件的视觉形态，并用前后缩略图并排检验。只调整颜色、圆角、间距、按钮变体，在同一条纵向堆叠里重新分卡，或把原结构复制到另一条路由，都不构成页面重构。

## 工作流程

1. 先检查工作区状态，保留用户已有的未提交修改；不要为了“整理干净”而回滚无关变更。
2. 明确页面的主要任务、内容优先级和信息分组，先查找已有 UI 原语、设计令牌和相邻页面的实现，再决定是否需要新组件或新 CSS。
3. 对目标页面做完整审查：首屏、所有卡片、长文本、列表、图片、按钮、空/加载/错误状态，以及桌面和移动布局。不要只修用户指出的第一个元素。重构任务在动手前先截基线截图（桌面 + 移动），并按方法文档第 2 节自检方案是否命中足够的解剖要素；改名或删控件前先 grep 测试断言。
4. 实现修改时优先修复结构和共享规则，再处理局部样式。页面根节点负责同级间距，避免用随机外边距把相邻元素逐个推开。
5. 启动或重建 Docker 页面后，使用配置中的 8787 端口做真实浏览器验证；不要擅自打开 1420 或其他替代端口。
6. 通过自动化检查和浏览器检查后，报告实际检查过的页面、视口、交互和结果；没有实测的内容不得声称已验证。重构任务报告时附前后结构对比。

## 不可违反的视觉和交互规则

- 不使用左侧或底部装饰色条、无语义渐变、发光边框、奖励式动效或其他“AI 样式”按钮装饰。
- 操作按钮使用 `Button` 或既有语义类，并按 `primary`、`secondary`、`quiet`、`danger`、`success` 的真实语义选择变体；一个区域只保留一个主要动作。
- 颜色、间距、圆角、阴影和动效只使用有效的语义令牌。每个 `var()` 必须引用已定义令牌；不能使用未定义的 `--space-*` 等变量。
- 同级卡片和列表由父级 `grid`/`flex` 的 `gap` 控制；卡片之间不能贴在一起，也不能靠子项随机 `margin` 修补。
- 卡片只表达真实的信息分组，避免卡片套卡片、重复边框和为了填空白而增加的装饰区。
- 长内容必须有明确边界的内部滚动容器，页面滚动和内部滚动不能无意中同时争夺同一方向；滚动条要可发现且不遮挡内容。
- 文本不得无理由省略。需要完整识别的名称、标题和关键内容必须换行、扩展或进入可查看完整内容的详情。
- 图片型媒体应提供可访问的预览/放大入口；预览浮层必须支持关闭按钮、遮罩关闭和 `Escape`，并处理焦点与 `aria` 语义。
- 手机端按配置中的视口检查，布局应收敛为合理单列，`scrollWidth` 不得大于 `clientWidth`，触摸目标不小于 44px，输入字号不小于 16px。
- 长文档页面（尤其模组详情）在 760px 以下必须进入页面级文档滚动范围，不能被固定视口高度的应用壳裁切；页面级滚动与包内设定/KP 技能等有意设置的局部滚动要分别验证边界。
- 用户可见文案必须进入 `src/i18n/locales/en.json` 和 `src/i18n/locales/zh.json`，不能把新字符串硬编码到 JSX。

## 浏览器验收

优先使用 `browser-chrome` skill 连接 Chrome CDP，并验证 Docker 的 8787 页面。至少检查：

- 桌面视口：卡片间距、列数、内容是否被裁切、图片预览、按钮层级和首屏信息层级。
- 移动视口：390px 宽度下无横向溢出、卡片间距、文字换行、页面级滚动、内部滚动、触摸目标和图片预览；长文档必须满足 `document.documentElement.scrollHeight > innerHeight`，并能滚到页面底部。
- 需要 keeper 权限的页面：使用 keeper 登录覆盖权限可见内容、危险操作和管理区域；没有凭据时明确说明未覆盖。
- 长列表和长 Markdown：确认内部滚动容器确实有 `scrollHeight > clientHeight`，并能滚到末尾。
- 浮层：点击/键盘打开，关闭按钮、遮罩和 `Escape` 均可关闭，关闭后焦点行为合理。

## 检查与部署策略

先读取目标仓库的 `AGENTS.md`，它决定允许执行的检查和部署命令。当前仓库使用以下检查与部署方式：

```bash
git diff --check
docker compose up -d --build
```

不要运行或编写 test、lint、typecheck。不要用其他构建命令替代 Docker 构建。命令失败时继续定位根因，不把失败简单归因于环境。

## 完成标准

只有同时满足以下条件才可以报告完成：

- 目标页面所有相关区域都已审查，不只修了用户举例的局部。
- 重构任务：页面解剖与重复组件形态都有可辨识的变化，并通过前后缩略图对比与测试断言预检。
- 样式符合两份设计文档，没有无效令牌、装饰色条、无意义卡片或无解释的文本截断。
- 桌面端和移动端均完成真实浏览器检查；移动端无页面级横向溢出。
- 图片、长内容、按钮、浮层和键盘交互达到对应验收要求。
- 仓库允许的检查和 Docker 构建通过，或明确列出仍然存在的失败和未覆盖项。
- 不执行 commit、push、删除或回滚等额外操作，除非用户明确要求。
