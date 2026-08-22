# Loreweaver 前端界面规范

本规范约束页面、组件、主题和交互的实现方式。目标是让同一类元素拥有同一套视觉语义、代码入口和行为合同。

## 文件职责

- `src/lib/themes.ts`：只保存五套主题的原始色板，并把 `--lw-*` 写入根节点。
- `src/design-system.css`：保存语义令牌、通用组件和跨页面布局规则。
- `src/components/ui/`：保存可复用 React 组件，不包含业务状态。
- `src/styles.css`：保存叙事日志、牌桌面板、协议区块等业务专属样式。
- `src/features/`：组合 UI 组件并处理业务逻辑，不复制通用控件样式。

## 设计令牌

组件只能读取语义令牌，不直接写固定主题色。

- 表面：`--surface-canvas`、`--surface-1`、`--surface-2`、`--surface-inset`、`--surface-hover`
- 边界：`--line-subtle`、`--line-default`、`--line-strong`
- 文本：`--text-primary`、`--text-secondary`、`--text-tertiary`、`--text-accent`
- 间距：`--space-1` 到 `--space-12`，页面与组件只使用这一组尺度
- 圆角：`--radius-sm`、`--radius-md`、`--radius-lg`、`--radius-xl`、`--radius-pill`
- 控件高度：`--control-sm`、`--control-md`、`--control-lg`
- 阴影与焦点：`--shadow-sm`、`--shadow-md`、`--shadow-lg`、`--focus-ring`

状态色使用 `--lw-success`、`--lw-fail`、`--lw-fumble` 等主题原始语义，不以具体颜色命名变量。

## 通用组件

### Button

所有业务动作使用 `Button`。变体按语义选择：

- `primary`：页面唯一的主要提交动作
- `secondary`：普通操作
- `quiet`：返回、取消、折叠等低强调操作
- `danger`：删除或不可逆操作
- `success`：明确表示启动、完成等正向动作

尺寸使用 `sm`、`md`、`lg`、`icon`。禁用状态通过原生 `disabled` 表达；异步提交使用 `loading`，组件负责同步 `disabled` 与 `aria-busy`。

协议驱动的按钮可能无法直接实例化 React 组件，使用 `primary-button`、`ghost-button`、`choice-button`、`icon-button` 语义类；这些类由 `design-system.css` 映射到同一套令牌。

### Field

表单字段使用 `Field` 生成标签、说明和错误关系。控件必须接收组件提供的 `id`、`describedBy` 和 `invalid`。不要用占位符代替标签。

### Surface 与 SectionHeader

独立内容组使用 `Surface`。`default` 用于普通卡片，`subtle` 用于内嵌区域，`accent` 用于当前主要对象，`danger` 用于高风险区域。标题、说明和操作组合使用 `SectionHeader`。

### Notice 与 EmptyState

操作反馈使用 `Notice`，根据结果选择 `info`、`success`、`warning`、`danger`。错误使用 `role="alert"`，非阻塞结果使用 `role="status"`。空列表使用 `EmptyState`，只显示已有业务文案，不增加宣传语或无关导语。

## 页面结构

- 管理页统一通过 `ScreenShell` 提供返回、标题、忙碌状态、错误提示和内容宽度。
- 设置类页面统一通过 `SettingsWorkspace` 组合分组导航和正文，不自行实现另一套侧栏、移动页签或键盘逻辑。
- 普通管理页正文宽度不超过 `920px`，复杂双栏页不超过 `1200px`。
- 页面一级间距使用 `--space-6`，卡片内部使用 `--space-4` 或 `--space-5`。
- 同级内容用网格或 `gap` 管理间距，不给相邻子项叠加上下外边距。
- 同一页面只保留一个主要按钮；次要动作降低视觉权重。

## 主题

五套主题必须共享相同的组件 CSS。主题适配遵守以下规则：

- 不根据主题名写分支样式。
- 不在组件中写十六进制颜色、`rgb()` 固定色或面向某一主题的覆盖。
- 浅色与深色主题都从 `--lw-bg`、`--lw-fg` 和语义色派生表面、边界与阴影。
- 状态不能只靠颜色表达；同时提供文字、图标、形状或 `aria` 状态。
- 新组件至少检查 `lamplight`、`paperwhite`，并确认其余主题无固定色泄漏。

## 交互

- 所有交互元素使用原生 `button`、`a`、`input`、`select` 等语义元素。
- 焦点必须可见。页面切换后，焦点进入页面标题；弹层关闭后，焦点返回触发器。
- 页签支持方向键、`Home`、`End`，并维护 `aria-selected`、`tabIndex`、`aria-controls`。
- 点击目标在触屏宽度下不小于 `44px`。
- 悬停只作为补充，任何功能不能依赖悬停触发。
- 动画使用 `--motion-fast` 或 `--motion-base`，并服从 `prefers-reduced-motion`。
- 破坏性操作必须提供明确确认；确认文案使用已有业务翻译，不临时拼接界面文字。

## 响应式

- `760px` 是主要单列断点，`560px` 用于紧凑手机布局。
- 桌面侧栏在手机上转为横向可滚动页签或底部抽屉。
- 表格允许横向滚动，不压缩到无法阅读；关键文本允许换行。
- 手机输入字号不小于 `16px`，避免移动浏览器自动缩放。
- 使用动态视口单位和安全区变量处理移动浏览器工具栏与底部手势区。

## 开发检查

提交界面改动前执行：

```bash
bun run typecheck
bun run lint
bun run i18n:lint
bun run test
bun run build
```

浏览器验收至少覆盖桌面与手机宽度、键盘操作、`lamplight` 与 `paperwhite`、空状态、禁用状态和错误状态。

生产构建通过 `vite.config.ts` 的 `build.rolldownOptions.output.codeSplitting` 管理稳定依赖分组。新增大型依赖时先检查产物分块，不通过提高警告阈值掩盖主包体积。
