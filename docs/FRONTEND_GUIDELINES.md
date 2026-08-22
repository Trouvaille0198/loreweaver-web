# Loreweaver 前端实现规范

本文定义 Loreweaver Web 的页面、组件、样式、主题和交互实现合同。视觉取舍与产品气质先参考 [DESIGN_LANGUAGE.md](./DESIGN_LANGUAGE.md)，本文负责把这些判断落实为可复用的代码。

任何界面修改都同时遵守两份文档：

- `DESIGN_LANGUAGE.md` 回答“应该呈现什么层级、气质和交互”。
- `FRONTEND_GUIDELINES.md` 回答“代码放在哪里、应该复用什么、如何验证”。

## 1. 实现顺序

遇到新页面或新交互时，按以下顺序判断：

1. 明确用户当前要完成的任务，以及页面唯一的主要动作。
2. 选择页面原型：连接页、牌桌、设置工作区、普通管理页或浮层。
3. 使用现有页面外壳和 UI 组件组合结构。
4. 只在业务确有独特语义时增加 feature 组件和样式。
5. 使用语义令牌完成所有颜色、间距、圆角、阴影和动效。
6. 补齐 loading、disabled、empty、error、success 与键盘状态。
7. 检查五套主题、桌面与手机布局，再运行自动化检查。

不要从“画一张新卡片”或“写一组新 CSS”开始。先确定信息架构与组件归属。

## 2. 文件职责

| 位置                                 | 职责                    | 可以包含                                   | 不应包含                           |
| ------------------------------------ | ----------------------- | ------------------------------------------ | ---------------------------------- |
| `src/lib/themes.ts`                  | 主题原始色板            | 五套主题的 `--lw-*` 值、主题元数据         | 组件选择器、页面布局               |
| `src/design-system.css`              | 全局设计系统            | 语义令牌、UI 原语、跨页面外壳              | 只服务单个业务页面的选择器         |
| `src/components/ui/`                 | 无业务状态的 React 原语 | Button、Field、Surface、Notice、EmptyState | 请求、路由、协议状态、业务翻译拼装 |
| `src/features/<feature>/components/` | 可复用业务组件          | 同一 feature 内复用的组合组件              | 全局基础控件的复制实现             |
| `src/features/<feature>/screens/`    | 页面编排                | 数据读取、业务状态、页面组件组合           | 通用按钮、字段、卡片样式定义       |
| `src/styles.css`                     | 牌桌业务样式            | 叙事日志、协议区块、面板与牌桌布局         | 可由 UI 原语表达的按钮或卡片样式   |
| `src/i18n/locales/`                  | 用户可见文案            | 中英文键值                                 | 只存在于 JSX 的界面字符串          |

### 2.1 新代码放置判断

```text
是否包含业务数据或业务行为？
├─ 否：两个以上页面会使用吗？
│  ├─ 是 → src/components/ui 或 design-system.css
│  └─ 否 → 先用现有原语组合，不急于创建组件
└─ 是：同一 feature 内会重复吗？
   ├─ 是 → features/<feature>/components
   └─ 否 → 留在对应 screen，由 screen 负责组合
```

只有当一个模式拥有稳定的语义、API 和至少两个合理使用点时，才提升为通用组件。不要把每个 JSX 片段都包装成组件。

## 3. 设计令牌

组件只能读取语义令牌，不直接写固定主题色或随意数值。

- 表面：`--surface-canvas`、`--surface-1`、`--surface-2`、`--surface-inset`、`--surface-hover`
- 边界：`--line-subtle`、`--line-default`、`--line-strong`
- 文本：`--text-primary`、`--text-secondary`、`--text-tertiary`、`--text-accent`
- 间距：`--space-1` 到 `--space-12`
- 圆角：`--radius-sm`、`--radius-md`、`--radius-lg`、`--radius-xl`、`--radius-pill`
- 控件高度：`--control-sm`、`--control-md`、`--control-lg`
- 阴影与焦点：`--shadow-sm`、`--shadow-md`、`--shadow-lg`、`--focus-ring`
- 动效：`--motion-fast`、`--motion-base`、`--ease-out`
- 字体：`--font-story`、`--font-ui`、`--font-mono`

状态色使用 `--lw-success`、`--lw-fail`、`--lw-fumble` 等主题原始语义，不以具体颜色命名变量。

```css
/* 符合规范：结构和值都由设计系统控制 */
.model-summary {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5);
  color: var(--text-primary);
  background: var(--surface-inset);
  border: 1px solid var(--line-subtle);
  border-radius: var(--radius-md);
}

/* 不符合规范：固定颜色、任意间距、与主题绑定 */
[data-theme="paperwhite"] .model-summary {
  padding: 18px;
  color: #222;
  background: #faf8f0;
}
```

如果现有令牌无法表达需求，先判断这是全局语义还是单页例外。全局语义补充到设计系统；单页例外仍应由相邻令牌组合，不创建以具体颜色或页面名称命名的全局变量。

每个 `var()` 引用的令牌必须在有效作用域内定义；允许缺省的值必须提供回退值，例如 `var(--optional-space, var(--space-5))`。无效的自定义属性会使整条声明在计算阶段失效，间距、尺寸等关键声明不能依赖未定义令牌。

## 4. UI 组件合同

### 4.1 组件选择

| 需求                       | 使用                        | 不要使用                    |
| -------------------------- | --------------------------- | --------------------------- |
| 触发动作                   | `Button`                    | 裸 `<button>` 加临时 class  |
| 页面跳转或外部链接         | 语义正确的 `<a>` / 路由链接 | 用按钮模拟链接              |
| 标签、说明、错误组成的字段 | `Field`                     | placeholder 代替标签        |
| 可命名的信息组             | `Surface` + `SectionHeader` | 任意 `div.card`             |
| 操作反馈                   | `Notice`                    | 普通段落临时染色            |
| 空列表或无结果             | `EmptyState`                | 添加欢迎语或产品导语填空    |
| 管理页面外壳               | `ScreenShell`               | 每页单独实现返回与错误区    |
| 设置类导航                 | `SettingsWorkspace`         | 每个设置页自己写侧栏或 tabs |

### 4.2 Button

所有业务动作使用 `Button`。变体按语义选择：

- `primary`：页面或当前任务唯一的主要提交动作。
- `secondary`：普通、可逆且需要清晰可见的操作。
- `quiet`：返回、取消、折叠、复制等低强调操作。
- `danger`：删除、重置和不可逆操作。
- `success`：确实代表启动或完成的正向动作。

尺寸使用 `sm`、`md`、`lg`、`icon`。异步提交使用 `loading`，组件负责同步 `disabled` 与 `aria-busy`。

```tsx
<Button variant="primary" loading={isConnecting} onClick={connect}>
  {t("connect.submit")}
</Button>
```

协议驱动的内容无法直接实例化 React 组件时，使用 `primary-button`、`ghost-button`、`choice-button`、`icon-button` 语义类。这些类由 `design-system.css` 映射到同一套令牌，不在业务样式中复制按钮视觉。

### 4.3 Field

表单字段使用 `Field` 建立标签、说明与错误关系。控件必须接收组件提供的 `id`、`describedBy` 和 `invalid`。

```tsx
<Field label={t("connect.serverUrl")} error={connectionError}>
  {({ id, describedBy, invalid }) => (
    <input
      id={id}
      value={serverUrl}
      placeholder={t("connect.serverUrlPlaceholder")}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      onChange={(event) => setServerUrl(event.target.value)}
    />
  )}
</Field>
```

字段错误由用户输入或提交结果驱动，不在用户尚未操作时抢先显示。说明只解释格式、影响、限制或恢复方式。

### 4.4 Surface 与 SectionHeader

独立内容组使用 `Surface`。`default` 用于普通卡片，`subtle` 用于内嵌区域，`accent` 用于当前主要对象，`danger` 用于高风险区域。标题、说明和操作组合使用 `SectionHeader`。

```tsx
const titleId = "appearance-heading"

<Surface tone="default" labelledBy={titleId}>
  <SectionHeader titleId={titleId} title={t("play.settings.appearanceSection")} />
  <div className="appearance-options">{options}</div>
</Surface>
```

`description` 不是必填装饰。标题已经能说明内容时直接省略。

### 4.5 Notice 与 EmptyState

操作反馈使用 `Notice`，根据结果选择 `info`、`success`、`warning`、`danger`。错误使用 `role="alert"`，非阻塞结果使用 `role="status"`。空列表使用 `EmptyState`，只显示已有业务文案，不增加宣传语或无关导语。

## 5. 页面组合

### 5.1 ScreenShell

管理页统一通过 `ScreenShell` 提供返回、标题、忙碌状态、错误提示和内容宽度。

- 普通管理页正文宽度不超过 `920px`。
- 复杂双栏工作区使用 `wide`，正文不超过 `1200px`。
- 页面错误交给外壳展示，字段错误留在字段附近。
- 页面标题只出现一次，并能在页面切换后接收焦点。

### 5.2 SettingsWorkspace

设置页面由 `SettingsWorkspace` 组合分组导航和正文。导航条目按用户任务组织，不按接口、store 或文件名组织。

```tsx
type Section = "appearance" | "language" | "connection"

const groups: readonly SettingsNavGroup<Section>[] = [
  {
    items: [
      {
        key: "appearance",
        label: t("play.settings.appearanceSection"),
        icon: "appearance",
      },
      { key: "language", label: t("lang.label"), icon: "language" },
      {
        key: "connection",
        label: t("play.settings.serverSection"),
        icon: "connection",
      },
    ],
  },
]

<SettingsWorkspace
  ariaLabel={t("play.menu.settings")}
  active={activeSection}
  groups={groups}
  idPrefix="settings"
  onSelect={setActiveSection}
>
  {renderSection(activeSection)}
</SettingsWorkspace>
```

每个设置区域使用一至三个有真实语义的 `Surface`。即时生效的设置不添加“保存”按钮；需要远端提交的设置必须有明确提交、进行中和失败状态。

### 5.3 布局规则

- 页面一级间距使用 `--space-6`，卡片内部使用 `--space-4` 或 `--space-5`。
- 同级内容用 grid/flex 的 `gap` 管理，不给相邻子项叠加上下外边距。
- 同一页面只保留一个最醒目的按钮；次要动作降低视觉权重。
- 双栏只用于需要并行比较或持续参照的内容，不为填满宽屏强行分栏。
- 表格用于比较，列表用于扫读，卡片用于独立操作；三者不因视觉偏好互相替代。
- 危险操作与日常设置分开，放入 `danger` Surface 或明确的危险区域。

## 6. CSS 规则

### 6.1 命名

- `ui-*` 只属于全局 UI 原语，例如 `ui-button`、`ui-field-error`。
- 业务 class 使用领域语义，例如 `settings-theme-grid`、`model-provider-row`。
- 状态使用 `is-*`，例如 `is-selected`、`is-collapsed`。
- 变体使用 `block--variant`，并由组件 prop 控制。
- 不使用颜色命名，例如 `yellow-button`、`gray-card`。
- 不使用纯视觉位置命名，例如 `left-box`、`top-text`。

### 6.2 选择器与所有权

- 组件样式以一个稳定根 class 为边界，避免依赖深层 DOM 顺序。
- 除全局基础排版外，不对 `button`、`input`、`section` 等标签做业务级全局覆盖。
- 不使用 `!important` 解决优先级竞争；先缩短选择器并明确样式所有权。
- JavaScript 不查询视觉 class 来判断业务状态；状态来自 React 数据或可访问属性。
- 浮层层级使用统一 z-index 语义，不在页面中追加任意大数。
- 内联 style 只用于运行时数值，例如用户设置的列宽；可枚举视觉变体使用 class 或组件 prop。

### 6.3 布局

- 优先使用正常文档流、grid 和 flex；绝对定位只用于图标、装饰或真正叠层。
- 父容器负责子项间距，子组件不假设自己与前后元素的距离。
- 卡片和业务组件根节点默认不设置外部 `margin`；同级节奏由父级 `gap` 唯一控制。
- 使用 `minmax(0, 1fr)` 和 `min-width: 0` 防止 grid/flex 子项撑破页面。
- 可滚动区域必须拥有明确边界，不能让页面和内层同时争夺同一方向滚动。
- 文本截断只用于用户仍能通过标题属性、展开或详情查看完整内容的场景。

## 7. 主题合同

五套主题共享相同组件 CSS：

- 不根据主题名写分支样式。
- 不在组件中写十六进制颜色、固定 `rgb()` 或面向单一主题的覆盖。
- 浅色与深色主题都从 `--lw-bg`、`--lw-fg` 和语义色派生表面、边界与阴影。
- 状态不能只靠颜色表达，同时提供文字、图标、形状或 `aria` 状态。
- 新组件至少逐项检查 Lamplight 与 Paperwhite，并确认 Amber、DF-16、Phosphor 无固定色泄漏。
- `color-scheme`、原生表单控件和滚动条必须与当前主题保持可读。

需要调整某个主题时，先检查原始色板是否表达错误，再检查语义令牌推导。不要在页面组件中增加主题补丁。

## 8. 交互与可访问性

- 所有交互使用原生 `button`、`a`、`input`、`select` 等语义元素。
- 焦点必须可见。页面切换后焦点进入页面标题；弹层关闭后返回触发器。
- 页签支持方向键、`Home`、`End`，并维护 `aria-selected`、`tabIndex`、`aria-controls`。
- 点击目标在触屏宽度下不小于 `44px`。
- 悬停只作为补充，任何功能不能依赖 hover。
- 动画使用 `--motion-fast` 或 `--motion-base`，并服从 `prefers-reduced-motion`。
- 异步动作开始后阻止重复提交，并在原动作附近展示结果。
- 破坏性操作必须提供与风险相称的确认；高风险对象要求输入名称确认。
- 图标按钮必须有可访问名称；装饰图标使用 `aria-hidden="true"`。
- Escape 关闭最高层浮层，关闭按钮始终可见且可聚焦。

## 9. 响应式合同

- `1200px`：复杂网格减少列数。
- `920px`：双栏内容收敛，设置侧栏缩窄。
- `760px`：主要单列断点；设置侧栏转横向页签。
- `560px`：连接页和紧凑手机布局。

实现要求：

- 桌面侧栏在手机上转为横向可滚动页签或底部抽屉，不直接消失。
- 表格在自身容器横向滚动，不压缩到无法阅读，也不撑宽整个页面。
- 手机输入字号不小于 `16px`。
- 使用动态视口单位和安全区变量处理浏览器工具栏与底部手势区。
- 固定输入坞、抽屉和 sticky 标题不得遮挡错误提示或最后一项内容。
- 页面 `scrollWidth` 与 `clientWidth` 一致；只有明确的局部容器允许横向滚动。

不要通过 JavaScript 读取窗口宽度来决定纯布局。优先使用 CSS media/container query；只有行为本身不同才进入 React 状态。

## 10. 文案与国际化

- 用户可见文案必须进入 `src/i18n/locales/en.json` 与 `zh.json`。
- 页面标题和区域标题使用稳定名词；按钮使用明确动作动词。
- 说明文字只解释影响、格式、限制、例外或恢复方式。
- 不添加与任务无关的欢迎语、导语、格言和产品宣传。
- 不用副标题重复标题含义。
- 插值、复数和动态值由 i18n 参数处理，不在 JSX 中拼接半句翻译。
- `aria-label`、错误、toast、空状态同样属于用户可见文案。

## 11. UI 修改流程

### 11.1 开发前

- 在 [DESIGN_LANGUAGE.md](./DESIGN_LANGUAGE.md) 中选择最接近的页面原型。
- 写出主要任务、主要动作、内容分组和全部状态。
- 搜索 `src/components/ui/` 与同 feature 组件，确认没有可复用实现。
- 确认新增文案的中英文键。

### 11.2 开发中

- 先完成语义 HTML 与组件组合，再添加业务 class。
- 先完成 Lamplight，再立即检查 Paperwhite，避免把主题问题拖到最后。
- 同时实现键盘、loading、empty 和 error，不把它们当作收尾装饰。
- 手机布局与桌面布局在同一组件和数据结构中表达。

### 11.3 提交前

执行：

```bash
bun run typecheck
bun run lint
bun run i18n:lint
bun run test
bun run build
```

浏览器验收至少覆盖：

- 桌面宽度与 390px 左右手机宽度。
- 纯键盘操作与清晰焦点。
- Lamplight、Paperwhite，以及其余三套主题的快速巡检。
- loading、disabled、empty、error、success。
- 长文本、长英文单词、中文、URL 和密钥。
- `prefers-reduced-motion`。
- 页面级横向溢出与局部滚动。

生产构建通过 `vite.config.ts` 的 `build.rolldownOptions.output.codeSplitting` 管理稳定依赖分组。新增大型依赖时先检查产物分块，不通过提高警告阈值掩盖主包体积。

## 12. 完成定义

一项界面修改只有在以下条件全部满足时才算完成：

- 信息层级符合设计语言，页面主要任务在五秒内可识别。
- 通用按钮、字段、内容面、反馈和页面外壳没有重复实现。
- 颜色、间距、圆角、阴影、控件高度和动效全部来自令牌。
- 五套主题不需要页面级主题分支。
- 桌面与手机都能完成同一任务，页面没有意外横向滚动。
- 键盘、焦点、可访问名称和状态播报完整。
- 文案进入 i18n，且没有无关导语或重复说明。
- 自动化检查通过，浏览器状态矩阵完成。
- 新增通用模式时，同步补充设计文档、组件合同或源码参照。

## 13. 评审清单

评审 UI 代码时按以下优先级检查：

1. 用户任务和信息架构是否正确。
2. 是否复用了正确的页面外壳和 UI 原语。
3. 主题与响应式是否来自同一套结构。
4. 交互状态和可访问性是否完整。
5. CSS 是否由令牌、稳定 class 与父级 `gap` 组成。
6. 文案是否必要、准确并完整国际化。
7. 视觉细节是否符合 [DESIGN_LANGUAGE.md](./DESIGN_LANGUAGE.md) 的强调色、排版和表面层级规则。

当文档与实现不一致时，先依据用户任务和设计语言做出判断，再在同一次修改中校准实现与文档，不能让两者长期分叉。
