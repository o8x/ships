# 11. GUI 与布局规范

> Index: [docs/PRD.md](../PRD.md)

**字体**

- 无衬线：`--font-sans`（系统字体栈，含 PingFang SC）。
- 等宽：`--font-mono`（SF Mono 等），用于数值 / 地址 / 代码。

**颜色（`src/renderer/styles/constants.css`）**

| 变量 | 浅色 | 深色 |
| --- | --- | --- |
| `--color-bg` | `#f4f5f8` | `#0e1116` |
| `--color-surface` | `#ffffff` | `#161a21` |
| `--color-surface-2` | `#eef0f4` | `#1d222b` |
| `--color-surface-3` | `#e3e6ec` | `#262c37` |
| `--color-control` | `#ffffff`（与卡片同为白色） | `#1d222b` |
| `--color-border` | `rgba(15,18,25,.1)` | `rgba(255,255,255,.1)` |
| `--color-border-strong` | `rgba(15,18,25,.18)` | `rgba(255,255,255,.18)` |
| `--color-fg` | `#101217` | `#f3f5f9` |
| `--color-fg-muted` | `#687083` | `#9aa3b5` |
| `--color-accent` | 由设置决定（默认 `#2e6bfc`） | 同左 |
| `--color-danger` | `#dc3d43` | `#ff6369` |
| `--color-success` | `#1f8a4c` | `#4ade80` |

- JSON 语法色：`--color-json-key/str/num/bool/null`（深浅各一套）。
- **控件底色**：浅色模式输入框 / 按钮 / 分段控件 / 下拉触发器 / 开关 / 芯片等使用 `--color-control`（`#ffffff`），与卡片同为白色、靠边框区分，不再使用灰色 `--color-surface-2`；深色模式为 `#1d222b`。Liquid Glass 下 `--color-control` 取 `--glass-surface-2`，保持半透明。
- **强调色派生令牌**（`constants.css` 的 `:root`，随 `--color-accent` 实时变化）：`--color-accent-soft`（12% 透明底）、`--color-accent-soft-2`（20%）、`--color-accent-line`（48% 描边）、`--focus-ring`（2px / 14% 焦点环）。均只使用 `color-mix(…, transparent)`，保证 Liquid Glass 下仍能透出原生材质。
- **强调色使用范围**：`--color-accent` 用于 TAB 选中（含底色 / 描边）、分区标题的左侧色条、输入框 / 下拉 / 卡片悬浮描边与焦点环、分段控件选中、开关、色板、图标按钮悬浮、普通按钮悬浮描边与文字、文件管理选中行（底色 + 左侧色条）、分隔线悬浮、进度条、JSON 编辑器聚焦描边等；设置左侧导航选中仅使用强调色文字 + 淡强调色底（无左侧边框线）；卡片 / 输入框的**常态**底色仍保持中性色，避免整体过度着色。
- **标题层级**：工具页由 `app.js` 渲染 `.tool-head`（标题 + 说明）；设置窗口的页面标题由 `settings.html` 顶部 `#settings-title` 承担，分区内容**不再重复同名标题**（如「日志」「导入 / 导出」），避免双层标题。
- **清晰度**：`theme.js` 按 `window.devicePixelRatio` 在 `<html>` 上设置 `data-dpr`（≥2 为 `2`，否则 `1`，并在 `resize` / 分辨率变化时更新）。仅当 `data-dpr="2"` 时，卡片 / 输入框 / 分段 / 下拉 / 右键菜单等使用 **0.5px 发丝线**、浅色卡片带轻微投影；非 HiDPI 下**不使用**这些效果。图标 / 图片：内联 SVG 统一 `shape-rendering: geometricPrecision`（平滑缩放不糊），位图（如品牌图标 `<img>`）用 `image-rendering: -webkit-optimize-contrast` 提升重采样锐度。**TAB 图标渲染时会把 `fill` / `stroke` 非 `none` 的颜色统一为 `currentColor`**，因此用户替换进来、写死 `#000` 等颜色的 SVG 也会跟随选中 / 悬停 / 主题变色。
- 强调色由设置写入 `:root` 的 `--color-accent`；TAB 选中、开关、按钮等统一引用。
- **Liquid Glass / 毛玻璃配色**：`[data-vibrancy='on']`（浅色）与 `[data-vibrancy='on'][data-theme='dark']`（深色）在 `constants.css` 中把 `--color-bg` 覆盖为 `transparent`，并把 `--color-surface/-2/-3` 调成**极淡的半透明白**（`0.08 / 0.12 / 0.22`）：卡片 / 输入框几乎不填色、仅留描边与极淡一层，让原生玻璃的 blur 与折射直接透出（贴近系统 Liquid Glass 应用）；同时**加深文字**（浅色 `--color-fg` 近黑、`--color-fg-muted` 黑 58%；深色反之）保证可读性，并把 `--color-border` / `--color-border-strong` 提到 16% / 28%（深色 18% / 32%）。强调色派生令牌在玻璃下提高透明度（soft 16%、soft-2 26%、line 58%），仍只叠加 `transparent`；头栏 / 底栏 / 顶部强调色线在玻璃下保持透明或半透明，不引入不透明填充。弹层 `select-menu` 额外用 `--color-surface-3` 提高辨识度。属性由主面板 `app.js` 设置，设置窗口不设置（保持不透明）。材质明暗由主进程 `nativeTheme.themeSource`（取 `settings.theme`）控制。

**尺寸与圆角**

| 名称 | 值 |
| --- | --- |
| 悬浮面板尺寸 | 400 × 500 |
| 窗口模式主窗口尺寸 | 固定 640 × 480（不可缩放；`vessel.mainWindow`） |
| 设置窗口尺寸 | 800 × 600 |
| 更新窗口尺寸 | 380 × 150（`vessel.updateWindow`） |
| `--tabbar-height` | 46px |
| `--footer-height` | 34px |
| `--term-header-height` | 22px（终端窗口头栏最小高度，刚好放下自绘小红绿灯；实际为 `max(22px, --term-header-font-size + 6px)`） |
| `--term-header-font-size` | 13px（终端窗口头栏字号 = **终端字号 + 1**，`terminal.js` 的 `applyFontSize()` 改写；独立文件窗口为 **文件字号 + 1**） |
| `--term-padding-y` | 0px（终端内容上下留白；左右为 0 / 左 2px，见 §3.9-4） |
| `--file-font-size` | 12px（文件管理基础字号；终端窗口里由 `terminal.js` 跟随终端字号改写；**独立文件窗口固定 14px**，见 §8.6） |
| `--traffic-size` / `--traffic-glyph-size` | 9px / 6px（头栏自绘小红绿灯的圆点直径与悬浮符号尺寸） |
| `--traffic-close` / `--traffic-minimize` / `--traffic-zoom` / `--traffic-inactive` | `#ff5f57` / `#febc2e` / `#28c840` / 失焦灰（浅色 `rgba(0,0,0,.18)`、深色 `rgba(255,255,255,.28)`） |
| `--radius-window` | 10px |
| `--radius-card` | 6px |
| `--radius-control` | 6px |
| `--radius-control-sm` | 4px（紧凑控件，如终端窗口头栏的 SSH 下拉） |
| `--radius-xs` | 2px |
| 间距 `--space-1..5` | 4 / 8 / 12 / 16 / 20px |
| `--space-card-gap` | 12px（卡片 / 输入框 / 设置分区之间的统一间距；`gap-card` / `mb-card` / `mt-card`） |
| `--control-width` | 120px（下拉框默认宽度；二维码纠错等级 L / M / Q / H 分段控件同宽） |

**组件**

- 输入 `field`、按钮 `btn` / `btn-accent`、图标按钮 `icon-btn`、结果行 `row-card`、TAB `tab` / `tab-active`、开关 `switch`、分段控件 `segment`、色块 `swatch`。
- **分组手风琴** `accordion` / `accordion-item` / `accordion-header`（含 `.accordion-chevron` / `.accordion-name` / `.accordion-count`）/ `accordion-body`：用于 SSH 管理（设置页与主界面工具）按分组折叠展示，**默认全部展开**，点击标题切换、`.accordion-item.collapsed` 时旋转箭头（-90°）并隐藏 `.accordion-body`。
- **2FA 验证码卡片**（2FA 工具）：顶部为单行 `field` 输入框 + `btn-accent`「添加」按钮；卡片为 `rounded-card` + `border-border` + `bg-surface` 的纵向布局 —— 第一行为**绿色盾牌图标**（`shield`，`--color-success`）+ 标题（`text-[15px]`）+ 副标题（`items-baseline`、超出省略）、右侧**复制** / **删除**图标按钮，第二行为**逐位验证码数字块**（`h-11 w-8`、`text-[22px]` 等宽、每 3/4 位一组留一道间隙）+ 右侧倒计时秒数，底行为 1px 进度条（`rounded-pill`，剩余 ≤5 秒由强调色变 `--color-danger`）；复制成功就地显示 ✓ 反馈，删除走**就地二次确认**（`text-danger` 文案 + ✓ / ✕ 图标按钮）。样式复用中性卡片色，强调色仅用于进度条；卡片内元素纵向间距统一为 `--space-card-gap`（当前 12px，`gap-card`）；输入区与卡片列表也使用同一间距。
- **更新窗口组件**：`.update-shell`（整窗拖拽区 + 纵向布局）/ `.update-title` / `.update-message`（提示消息，12px / 行高 1.6 / 自动换行）/ `.update-progress` + `.update-progress-fill`（强调色进度条，`transition: width 0.15s linear`）/ `.update-status` / `.update-actions`（`no-drag`，右对齐按钮，提示框按钮共用同一样式）。
- **卡片 / 输入框间距统一 12px**：唯一来源是 `constants.css` 的 `--space-card-gap`（默认 12px）；`.section`（`gap` / `margin-bottom`）、窗口模式工具网格、手风琴、设置卡片、工具列表与输入区块均使用它（Tailwind 暴露为 `gap-card` / `mb-card` / `mt-card`），不再散落 10 / 12 / 16px 的卡片间距；编码转换（6 个连续输入框、二维码 / Data Matrix 分区与标题）与进制转换的 4 个进制输入框使用更紧凑的 8px 间距。
- **统一标题（滚动联动）**：每个工具的标题由 `app.js` 渲染在内容区上方的固定 `#tool-head-host` 中（标题取 `tools.<id>`、说明取 `toolDesc.<id>`），**永远固定在顶部、不随内容滚动**。常态标题 17px / 700、说明 11px。**仅当内容实际可滚动时**才启用收起行为：内容在最顶部时，先收起标题并**保持内容不动**（滚动输入在收起动画约 190ms 内被锁定），标题缩为 13px / 650、说明变为 10px 并**与标题同一行**（超出省略）；动画完成后继续滚动才滚动内容，标题始终独占一行、内容不会滚到标题下面。滚回顶部后自动恢复（在顶部继续向上滚也会先展开标题）；JSON 等内部滚动区实际产生滚动时同样收起，回到其顶部恢复；内容未填满、无法滚动时（如短 JSON / Hash / 2FA / 剪贴板）滚动不会收起标题。切换 TAB 时内容区自动滚动回顶部并恢复常态。
- **内容填充（fill）**：工具注册项可设 `fill: true`（当前为 JSON 格式化）；`app.js` 给 `#content` 加 `.tool-fill`，使内容区变为纵向 flex、`.tool-body` 占满剩余高度，JSON 编辑器 / 结构树用 `flex: 1` 铺满剩余高度与整行宽度（不再固定 180px），下方状态行保持贴底；窗口模式下的多列网格也由该规则覆盖为单列纵向布局（并重置 `align-items: stretch`，避免从网格的 `start` 继承导致编辑器宽度塌缩）。
- 自绘控件：下拉框默认**宽 120px**（`--control-width`），菜单宽度与触发器一致；二维码纠错等级 L / M / Q / H 分段控件同样为 **120px** 且按钮均分；下拉触发器只有可见的 120px 区域可点击（外层不使用 `<label>` 转发点击）（`select-trigger` / `select-menu` / `select-option`（`ShipsUI.createSelect`，替代系统 `<select>`；`.select-trigger.select-compact` 是头栏尺寸变体 —— 内边距 6px / 圆角取更紧凑的 `--radius-control-sm`（4px，比常规控件的 8px 小），字号与高度由 `#term-actions` 规则按头栏字号推导；终端窗口的下拉菜单同样与触发器同宽（120px）、条目高度与下拉本体一致，用于终端窗口头栏里的 SSH 主机下拉；支持 `{ header: true, label }` 形式的分组小标题 `select-group-title`（不可点、`pointer-events: none`，用于 SSH 下拉在两组之间区分，终端窗口内更紧凑））；**终端窗口自绘小红绿灯** `.traffic-light`（`.traffic-close` / `.traffic-minimize` / `.traffic-zoom`，9px 圆点 + 悬浮符号，见 §3.9-2）；悬浮提示 `ships-tip`（`ShipsUI.initTooltips`，元素加 `data-tip`，时间戳工具的偏移输入框用 `data-tip` 说明表达式语法；点击 / 窗口失焦 / 页面隐藏 / 滚动时立即隐藏，避免目标被移除后提示滞留）；JSON 覆盖式高亮编辑器 `json-editor` 与结构树 `json-tree`。
- 输入校验态：普通输入框加 `.invalid` 时描红（`border-color: var(--color-danger)`），时间戳工具的两个偏移输入框即用它表示偏移表达式非法；`.field:disabled` 半透明 + `not-allowed` 光标（IP 工具网络测试在 ICMP / ARP / 扫描主机下禁用端口输入）。
- 分段控件：`ShipsUI.segmented(options, value, onSelect, { className })` 支持选项 `disabled`（置灰不可点选，`.segment button:disabled` 透明 0.4）、`tip`（悬浮提示，配合 `data-tip`）与 `setOptions()`（原地重建，用于跟随状态变化）；`.segment-compact` 为单行多段变体（内边距 4px / 6px），设置 → 网络测试的类型切换即用它。
- 文件管理路径行图标（分离为独立窗口 / 刷新 / 家目录）与列表头操作常驻显示，不做悬浮显隐。
- 内嵌终端：设置 → 网络测试使用 **xterm.js**（`@xterm/xterm` + `@xterm/addon-fit`，从 `node_modules` 直接以 `<script>` / `<link>` 加载，配合 `FitAddon` + `ResizeObserver` 自适应），高度随面板伸缩（最小 200px），配色读取 `constants.css` 的 CSS 变量（`--color-bg` / `--color-fg` / `--color-accent`）；后端是 `src/main/scripts/pty-bridge.py` 创建的真实 PTY（Python 标准库，无 node-pty 原生依赖），因此终端可交互（键盘输入直通 PTY，支持 `clear` / Ctrl-C / sudo 提示）。
- 视觉点缀：不使用 emoji；SSH 探测结果直接使用 `assets/icons` 中的品牌彩色图标（Ubuntu/Fedora/Arch/CentOS/… 及 Windows），macOS 用灰色 command 图标；IP 归属地展示彩色国旗。
- **动效**：TAB 选中、分段控件、下拉菜单、开关、JSON 视图切换均有过渡 / 入场动画；工具与设置分区内容进入时带 `ships-fade-up`，下拉菜单与 TAB 选中带 `ships-pop`（详见 `styles/tailwind.css` 的 Motion 段）；文件管理的上传 / 下载进度用 `.fm-progress-fill` 宽度过渡。
- 图标按钮与 TAB 一律通过 `data-tip` 提供悬浮说明。

**平台差异**

- 仅针对 macOS 优化（托盘定位、iTerm、登录项）；非 macOS 平台 Dock 隐藏与登录项自动跳过，托盘能力依赖 Electron 默认实现。

**主题**

- 支持浅色 / 深色 / 跟随系统；由 `data-theme` 属性与 CSS 变量驱动；跟随系统时监听 `prefers-color-scheme` 与主进程 `theme:changed`。
- 语言：`zh` / `en`，由渲染层 i18n 字典（`scripts/i18n.js`）提供；工具 / 设置分区用 `i18n.extend` 扩展自己的文案，**同命名空间按深合并**（多个文件扩展 `settingsPage` 等不会互相覆盖），键缺失时回退到 `zh`，再缺失则原样显示键名。

---
