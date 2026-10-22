# 8. 主界面布局

> Index: [docs/PRD.md](../PRD.md)

### 8.1 主界面（窗口模式 / 悬浮模式）

主界面有两种模式，共用 `index.html`，由 `<html data-window-mode="window|float">` 切换外观（见 §3.2）。

**窗口模式（默认）**

- **标准窗口（不置顶）**：`titleBarStyle: 'hiddenInset'` + **系统红绿灯**（`trafficLightPosition {14,16}`）、不占 Dock；**普通窗口层级**（`alwaysOnTop: false`，不会永远浮在其它应用之上）；**固定 640 × 480、不可缩放**（`resizable: false`，`vessel.mainWindow`），仅位置可拖动。
- **桌面归属**：窗口绑定到显示时所在的桌面，打开期间切换桌面不跟随；关闭（隐藏）后从其它桌面点托盘时，先 `setVisibleOnAllWorkspaces(true)`、显示聚焦后再 `false` 绑定当前桌面，因此在新桌面打开而不是回到旧桌面。
- **只记忆位置（panel 式当前桌面显示）**：`main-window.json` 只存 `{ x, y }`，不记录桌面 / 屏幕 / 尺寸；显示时应用到当前鼠标所在屏幕并夹回工作区，无记录则居中。显示前先加入所有桌面，`show()` / `focus()` 后约 60ms 再 `false` 绑定当前桌面，避免 `show` / 激活时被系统拉回旧桌面。**拖动时水平磁性吸附**：窗口中心与屏幕工作区的**垂直中线**（x 方向）对齐（±10px）时吸附到正中并轻微「卡」一下，拖动超过 26px 才脱开（`CENTER_SNAP.xThreshold` / `xRelease`，仅改 x；与终端窗口同一行为）。
- **布局适配**：顶部栏 `#tabbar` 左侧留出 **80px** 给系统红绿灯；**整条顶部栏可拖动窗口**——`#tabbar` / `#tablist` 均为 `-webkit-app-region: drag`（TAB 区虽铺满右侧，但其空白处也可拖动），仅真正的 **TAB 按钮**（`#tablist .tab`）为 `no-drag` 保证可点击；内容区加宽（`padding: 16px 20px`），工具内容 `#content > .tool-body` 用 `repeat(auto-fit, minmax(320px, 1fr))` 网格（固定 640 宽下为单列，窗口更宽时自动分栏）；面板圆角取消（`#panel border-radius:0`）。**图钉（固定悬浮）按钮隐藏**（仅悬浮模式有意义）；**Liquid Glass / 毛玻璃与悬浮模式一样生效**（开启时窗口透明、材质透出；见 §8.1「Liquid Glass」）。

**悬浮模式（`floatMode = true`，原主面板行为）**

- 尺寸：**400 × 500**（`vessel.window.width/height`），无边框、透明、不可缩放、置顶、不占 Dock。
- **浮动行为（与终端窗口的置顶开关无关）**：面板 `alwaysOnTop: true`（**恒定**，不跟随 `settings.terminalAlwaysOnTop` —— 终端窗口头部图钉只改终端自己），并用 `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })` 加入所有桌面 + 全屏辅助；**每次弹出前**（`showMainWindow` → `setAlwaysOnTop(true)` + 重新声明上面的 collection behavior 后再 `show()`）都会重申一次，保证点击托盘时面板直接浮在当前界面（含全屏应用之上），而不是被系统切回某个桌面才显示得出来。`skipTransformProcessType: true`：本应用已是 `LSUIElement` 菜单栏 Agent（`app.dock.hide()`），不需要 Electron 在「UIElement ↔ 普通应用」之间转换进程类型 —— 该转换会短暂隐藏窗口 / Dock 并改变激活与窗口显示行为。
- 结构：顶部栏（高 46px）：TAB 图标区右对齐、超出可横向滚动（图标 24×24px、按钮 40×40px、间距 8px）→ **固定工具标题区** `#tool-head-host`（不随内容滚动）→ 内容区（可滚动）→ 底部栏（高 34px）。
- TAB 工具顺序由单一文件 `src/renderer/scripts/tool-order.js` 的 `window.ShipsToolOrder` 数组决定（改数组即改顺序；未列出的工具按注册顺序追加到末尾）。
- 圆角：外层面板 `--radius-window`（10px），透明窗口使圆角外露；**主窗口无描边边框**（仅卡片/输入框有边框）。
- 底部栏：左侧依次为 **App 彩色图标 + 名称**（16px 图标 / 12px 名称，固定不压缩）与版本号（`vX.Y.Z`；开发者模式开启时其右侧加一枚「开发者模式」标记）、右侧依次为**终端**（`terminal`，每次新开一扇置顶终端窗口，§3.9）、**文件管理**（`folder`，打开独立文件窗口且不选中任何连接，§3.9-11）、**网络测试**（`wifi`，打开设置 → 网络测试分区）、**外观**（`monitor`/`sun`/`moon`，循环切换跟随系统 / 浅色 / 深色）、图钉（固定悬浮）与设置按钮（齿轮），六个图标按钮均为 24×24px、**间距 12px**（比顶部 TAB 小，间距放大后图标之间的留白与顶部观感一致）。
- `Escape` 隐藏面板；默认失焦自动隐藏；固定悬浮时保持显示并可通过底部左侧「应用图标 + 名称」区域拖动。
- **Liquid Glass（设置项 `Liquid Glass`，键 `settings.vibrancy`，仅 macOS）**：粒度分三档，由 `window-manager.js` 的 `glassMode()` 判定：
  - **`liquid`（macOS 26+，优先）**：用 `electron-liquid-glass` 在窗口内容后插入原生 `NSGlassEffectView`（Liquid Glass）。窗口 `transparent: true`、**不设 `vibrancy`**、`roundedCorners: false`，内容加载后 `liquidGlass.addView(win.getNativeWindowHandle(), { cornerRadius: WINDOW.cornerRadius })`（默认 10px）由玻璃自带圆角；**不叠加 tint，保持高透**（背景的 blur 与折射直接透出）。
  - **`vibrancy`（旧 macOS 回退）**：用系统 `hud` 材质（强透明，Control Center 那种通透感；`content` / `under-window` 会几乎不透或发灰，故不用），`visualEffectState: active`，并需 `roundedCorners: true` 让系统裁剪材质；常量见 `shared/constants.js` 的 `VIBRANCY`。
  - **`off`**：无玻璃，`roundedCorners: false`，由 CSS 圆角塑形。
  - 说明：以上 `transparent` / `roundedCorners` 等创建参数针对**悬浮面板**；**窗口模式**是标准窗口——开启玻璃时 `transparent: true`，但**保留系统圆角**（`roundedCorners` 默认 `true`，`titleBarStyle: hiddenInset`），否则 macOS 会连标题栏 / 红绿灯一起去掉；关闭玻璃时不透明 + 系统圆角。
  因 `roundedCorners` / `vibrancy` / 原生玻璃视图都是**创建期**行为，切换该设置时丢弃并按新配置**重建主面板**（此时面板隐藏，无闪烁；`main.js` 已订阅 `window-all-closed` 不退出）。`app.js` 在 macOS 下于 `<html>` 置 `data-vibrancy="on"`，`constants.css` 把 `--color-bg` 置 `transparent` 让玻璃透出（浅色下卡片 / 输入框保持不透明主题色，深色下沿用半透明 `--color-surface*`）；另由 `nativeTheme.themeSource` 使材质跟随应用主题。**透明度可调**：设置 → 应用的滑块 `settings.glassOpacity`（0–100，越大越透明，默认 80）由 `app.js` 换算成 `:root` 的 `--glass-surface` / `--glass-surface-2` / `--glass-surface-3`（base = `(100-glassOpacity)/100 × 0.4`，三项为 base ×1 / ×1.5 / ×2.75），`constants.css` 在 `[data-vibrancy='on']` 下用它们作为 `--color-surface*`，**实时生效**。**作用于主界面（悬浮模式与窗口模式都生效）**，设置窗口保持不透明；非 macOS 不生效（属性置 `off`，`glassMode()='off'`）。默认关闭。

### 8.2 设置窗口

- 尺寸：**800 × 600**（`vessel.settingsWindow`），普通窗口，可缩放（最小 560×420），`titleBarStyle: hiddenInset`。
- 布局：**左右分栏** —— 左侧导航（宽 190px，顺序为：应用、SSH、终端、快捷键、网络测试；导入 / 导出与日志已合并到「应用」分区），右侧内容区。
- 顶部 **28px** 为可拖拽区域（`.drag-region`，覆盖系统红绿灯 / 原生标题栏范围）；左侧导航从 **48px**（`padding-top`，为避开系统红绿灯留白）、右侧标题从 12px 起排，`Escape` 关闭窗口。

### 8.3 图标与资源

- **SVG 图标**：所有界面图标以独立 `.svg` 文件存放于 `assets/icons/`（kebab-case 命名，如 `clock.svg`、`arrow-left.svg`、`arrow-up.svg`、`file.svg`、`doc.svg`、`image.svg`、`archive.svg`、`caret-right.svg`、`home.svg`、`temp-file.svg`、`split.svg`、`shield.svg`（2FA 工具 TAB 图标）、`traffic-close.svg` / `traffic-minimize.svg` / `traffic-zoom.svg`（终端窗口自绘小红绿灯的悬浮符号）），**代码中不硬编码** SVG 标记；由 `src/preload/icons.js` 在启动时读取目录、转成 camelCase 键名并经 `contextBridge` 暴露为 `window.shipsIcons`，渲染层 `ShipsUI.Icons[name](size)` 注入尺寸后使用（会先移除图标根标签上已有的 `width` / `height` 再注入，兼容自带尺寸的品牌图标）。新增 / 修改图标只需增删 / 编辑文件；系统品牌图标（`ubuntu.svg` / `fedora.svg` / `arch.svg` / `centos.svg` / `debian.svg` / `linux.svg` / `mint.svg` / `opensuse.svg` / `RHEL.svg` / `rocky.svg` / `windows.svg` 等）同样放在此处，用于 SSH 探测结果展示。
- **文件类型图标（文件管理）**：按 `src/renderer/scripts/constants.js` 的 `FILE_TYPE_ICONS`（扩展名 → 图标名，92 项）与 `FILE_NAME_ICONS`（无扩展名的文件名，如 `Makefile` / `Dockerfile` / `LICENSE` / `README`）映射到 `code` / `braces` / `terminal` / `doc` / `image` / `play` / `archive`，未命中用 `DEFAULT_FILE_ICON = file`；目录固定 `folder`（目录只出现在左侧目录树）。未引入第三方图标库：远端文件只有文件名，没有类型探测，系统图标类库（读取本地文件图标）在此用不上。
- 位图资源（应用图标 / 托盘 / 打包）统一放在 `assets/imgs/`；`assets/icons/` 只保留 SVG 图标。
- **国旗图标**：`assets/flags/<CC>.svg`（长方形）与 `assets/flags/<CC>_1x1.svg`（方形）；由 `src/preload/flags.js` 按需读取并缓存，暴露为 `window.shipsFlags.get(code, shape)`（code 为两位国家码，shape 为 `rect`/`1x1`）。
- **归属地数据库**：`assets/geoip.json`（单行大文件），由主进程 `geo-service` 直接 `require`，不逐行读取；渲染层通过 `geo:lookup` 使用。
- 托盘图标：`assets/imgs/trayTemplate.png`（模板图，适配深浅菜单栏）。
- 应用图标：`assets/imgs/app.png`（README 引用）。
- 图标由 `scripts/gen-icons.mjs` 零依赖生成；也可手工替换同名文件。

### 8.4 SSH 主列表行

- 结构：`[系统图标] [user@host(:port)]` + 别名小字 → 右侧 `[目录] [连接]`（探测已移至设置）。
- 未探测时显示通用主机图标；探测完成后直接替换为对应系统品牌图标（如 `ubuntu.svg`、`windows.svg`）。
- 端口为 22 时省略；通配符主机不展示。
- **交互**：点击右侧「连接」按钮，或**双击条目**（按钮区域除外）均执行连接（默认在置顶终端窗口里 `ssh`，见 §3.4；可设为 iTerm）；点击 `folder` 图标**打开独立文件窗口并自动连接该主机**（`file-window:open`，见 §3.9-11）；打开面板时自动刷新列表。

---

### 8.5 置顶终端窗口

- 尺寸与位置：默认 **1024 × 768**（`vessel.terminalWindow.width/height`，可在 **设置 → 终端 → 窗口大小** 调整，存 `settings.json` 的 `terminalWindowWidth` / `terminalWindowHeight`），可缩放、最小 `minWidth × minHeight` = 350×200；改设置立即生效，手动拖动窗口写回设置。**窗口为无边框 + 透明**（`frame:false` + `transparent:true` + `hasShadow:false`）：窗口底色 / 圆角 / 描边由渲染层 `#term-shell`（`--term-bg` / `--radius-window`）绘制（白天纯白 `#ffffff`，暗色 `#0e1116`），便于「悬浮球」模式呈现圆形（见 §3.9-12）；开启「终端暗色模式」时该窗口主题变量整体改为暗色（与全局主题无关，见 §3.9-12）。**屏幕 / 位置 / 尺寸会自动记忆**（`terminal-window.json`）：同屏重开沿用记忆（越界夹回工作区），换屏 / 拔屏 / 无记录则用默认尺寸在当前屏幕居中，详见 §3.9。悬浮球尺寸 `BALL_SIZE` 默认 **90px**（`package.json` 的 `vessel.terminalWindow.ballSize`）。
- 层级：`alwaysOnTop` + `setAlwaysOnTop(true, 'screen-saver')`（由终端窗口自己的图钉开关控制，与主面板无关）；`setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true, skipTransformProcessType: true })` —— 带全屏辅助（可浮在全屏应用之上）但**不加入所有桌面**（切换桌面时窗口留在原桌面，详见 §3.9）。
- 头部：自绘头栏 `#term-header`（高度随字号在 **16–32px** 之间）。左侧**自绘小红绿灯** ×3 + **红绿灯右侧的「固定」按钮**（`pin`/`pin-off`，开启后本窗口失焦不缩成悬浮球，见 §3.9-12）、**左右 padding 各 10px** —— **红绿灯尺寸随头栏字号缩放**（字号×0.75 圆点 / ×0.5 符号，12px→9px/6px），系统红绿灯已隐藏，点击关闭 / **最小化（= 缩成悬浮球）** / 缩放；**不显示任何标题文字**；右侧图标区：**SSH 主机下拉**（宽度 / 高度 / 字号随头栏缩放，条目 `用户名@主机地址`，选中即在当前终端执行 `ssh …`，见 §3.9-2）+ 四枚 18×18px 图标按钮（符号 12px）：**文件**（`folder`，无 ssh 目标时禁用、连接中图标旋转、面板展开时强调色，见 §3.9-10）、**iTerm 交接**、**行号**（`eye`/`eye-off`）、**窗口分裂**（`split`，点击新开一扇终端窗口，同主面板终端按钮）；**无置顶按钮**）；**头栏字号 = clamp(10–20px, 终端字号)，高度 = clamp(16–32px, 头栏字号 × 1.6)**（见 §3.9-2），头部为拖拽区、红绿灯与图标区为 `no-drag`，头栏不挂 `data-tip`。
- 主体：xterm.js 终端铺满剩余区域（外层 `#term-host` 负责 6.5 / 13px 留白，xterm 挂在无内边距的 `#term-fit` 上，保证 `FitAddon` 按真实可用区算行数 —— 最后一行完整可见、页面不可滚动，见 §3.9），滚动缓冲 **10000 行**、**不显示滚动条**（滚轮 / 触控板滚动缓冲区，防跳变见 §3.9）。
- 内嵌文件面板（`#file-panel` + `#term-divider`，见 §3.9-10、§8.6）：默认隐藏，由头部文件夹按钮显隐；面板与终端间是 **6px 可拖动分隔线**（中间一条 1px 线，`:hover` 变强调色加粗；**面板自身不画上边框，所以只有这一条线**），面板高度 = `file-layout.json` 的 `panelHeight`（默认 260px、最小 120px，向上拖 = 终端变小），**字体跟随终端字号**（`--file-font-size`）。面板内容由 `scripts/file-manager.js` 构建（见 §8.6），左目录树初始宽 300px、列宽与面板高度均可拖动并持久化。
- 入口：主面板底部栏「终端」图标；SSH 连接（§3.4）也会拉起本窗口。

### 8.6 文件管理（内嵌面板 / 独立文件窗口）

- 复用组件：`scripts/file-manager.js` 的 `ShipsFileManager.create()` 同时服务终端窗口的内嵌面板与独立文件窗口，结构为 `.fm-wrap` = `.fm-main`（左 `.fm-tree-pane` 目录树 + `.fm-divider-v` 4px 分隔线 + 右 `.fm-list-pane` 文件列表）+ `.fm-status` 状态栏。
- 路径行（`.fm-path-row`，顺序固定，**高度与文件列表表头一致 1.9em，两条下边框对齐**）：（内嵌面板才有）**分离为独立窗口** / **刷新** / **家目录** / 路径输入框 —— 前三个为图标按钮、**排成一排**（「在终端 cd 到此目录」图标已移除，改由目录树右键「进入该目录」提供）。点「刷新」同时清掉状态栏的完成提示。
- 目录树：行高 `1.85em`、缩进 14px/级，`caret-right` 展开时旋转 90°、`folder` 图标，选中目录行强调色 15% 底；点文件列表某行时树滚动定位到该文件所在目录节点。
- 文件列表：表头与行共用网格 `1.9em | var(--fm-name) | var(--fm-size) | var(--fm-perm) | var(--fm-time)`（图标 / 文件名 / 体积 / **权限（在时间左边）** / 时间；列宽默认 **160 / 60 / 90 / 130px**）；**文件名 / 体积 / 权限 / 时间四列右缘有拖动把手**改变列宽；**文件名 / 体积 / 时间三列列头可点击排序**（循环：升序 → 降序 → **不排序（服务端顺序）** → 升序…，箭头指示当前升 / 降序，权限列不排序；排序在客户端进行、不改动服务端返回顺序，**排序状态随布局持久化、下次自动应用**）；**权限列**由 `attrs.mode` 格式化为 `drwxr-xr-x`。行内**无下载按钮**；**多选**：普通点击单选、**Cmd / Ctrl 点击**增删单条、**Shift 点击**从锚点范围选择，选中行高亮（`.fm-row.selected`）；选中后按 **Cmd / Ctrl + C** 把选中行按表格列（文件名 / 体积 / 权限 / 时间）导出为 **CSV** 写入剪贴板（表头用列名，字段按 CSV 规则转义；输入框 / 文本域内的复制不拦截）；**右键菜单的操作作用于全部选中项**（右键未选中的行会先只选中它）；**双击**行：体积 ≤ 10M 且为文本类型（`constants.js` 的 `FILE_VSCODE_MAX_BYTES` / `NON_TEXT_EXTENSIONS`）→ **从 VS Code 打开**，否则（大文件 / 非文本）→ **从文件夹打开**；**右键**行弹出 `.fm-menu` 菜单：**从文件夹打开**、**从 VS Code 打开**、**下载到本地**、**复制路径**、**复制传输命令**（「从文件夹打开」= 下载后由系统文件管理器定位该文件，「从 VS Code 打开」= 下载后用 Visual Studio Code 打开，「下载到本地」= 仅下载，「复制路径」= 把远端绝对路径写入剪贴板；**多选时**：从文件夹打开 / 从 VS Code 打开 / 下载到本地**逐个执行**、复制路径**多条换行**、复制传输命令生成**含多个源**的一条 `scp`；菜单 **12px 字号、条目高 25px、上下各 1px 边距、圆角 5px 高亮、无分隔线**）；**目录树节点右键**弹出菜单：**进入该目录**（仅内嵌面板：在当前终端 `cd` 到该目录 + 导航面板 + 记入 cd 历史）、**上传**、**复制路径**、**复制传输命令**（上传 = 选本地文件后上传到该目录）。**路径输入框聚焦时**在其下方下拉该 ssh 目标的 **cd 历史**（`.fm-history-menu`，含「最近访问」标题、路径单行省略；点条目 → 浏览器与终端同时前往，并**展开目录树定位到该目录**）。复制传输命令由 `sftp:transfer-command` 生成 `scp [-P 端口] [-i 私钥] [-r] 用户@主机:'远端路径' 下载目录`（目录加 `-r`，端口 22 / 默认私钥省略）并写入系统剪贴板，状态栏回显「已复制：<命令>」。上传支持**拖拽**（`.drag-over` 虚线强调色描边）与**目录树节点右键「上传」**。列表头「时间」列只有标签（不再有按钮）。列宽与树宽写入 `file-layout.json`（内嵌）/ `file-window-layout.json`（独立窗口）。
- 状态栏：左=当前绝对路径；中=**进度条** `.fm-progress`（上传 / 下载时显示，`sftp:progress` 回填百分比）；右=状态信息（连接 / 上传 / 下载 / 错误）。**所有状态栏提示**（含连接 / 下载 / 上传 / 定位 / 复制 / 错误）保留 **30 秒**（`FILE_STATUS_TTL_MS`）后**惰性清除**（下一次设置状态会重置计时），且每次设置状态都会**同时写渲染层控制台、主进程控制台与当天文件日志**（`console.log` + `log:write` → `logger.info`）。
- 字体与行高：`.fm-root { font-size: var(--file-font-size) }`；终端窗口（内嵌面板）由 `terminal.js` 跟随终端字号；**独立文件窗口固定 14px**（`body.file-window { --file-font-size: 14px }`），不跟随终端设置。**路径行 / 列表表头 / 文件行统一高度 `1.9em`**（内嵌面板随字号）；**独立文件窗口的路径行 / 列表表头 / 文件行 / 目录树行均固定 32px**（`body.file-window .fm-path-row, .fm-list-head, .fm-row, .fm-tree-row { height: 32px }`）；文件行的**文件名 / 体积 / 权限 / 时间同号 `1em`**（体积 / 权限 / 时间用等宽字体），保证中英文观感一致（此前数据列 `0.92em` 会让中文显得更大）。
- 独立文件窗口 `file-window.html`：**系统原生标题栏 / 红绿灯**（`titleBarStyle: 'default'`，不隐藏系统窗口按钮），顶部 SSH 连接栏 `#file-toolbar`（主机下拉 + 用户名 / 地址 / 端口 + 密码|密钥 + 连接按钮，见 §3.9-11；无置顶按钮），主体 `#file-root` 即 `.fm-root`；`alwaysOnTop` **默认关**（`vessel.fileWindow.alwaysOnTop` / `settings.fileWindowAlwaysOnTop`；启动时会把旧版本遗留的 `true` 归一为 `false`），不浮在全屏之上；**默认 / 最小尺寸 900 × 600**（`vessel.fileWindow.minWidth/minHeight`）；屏幕 / 位置 / 尺寸记入 `file-window.json`。**不做整行 / 整列对齐**：拖拽窗口尺寸后不再计算或调用 `file-window:snap-size`。

### 8.7 更新窗口（应用内提示框 / 下载）

- 尺寸 **380 × 150**（`package.json` 的 `vessel.updateWindow` → `constants.js` 的 `UPDATE_WINDOW`）；**标准窗口 + `titleBarStyle: 'hiddenInset'`**（真正的系统红绿灯，`trafficLightPosition {14,13}`）、不可缩放、**不可关闭**（`closable: false`，系统关闭按钮禁用、Cmd-W 无效，仅应用退出 / `quitAndInstall` / 提示框处理完毕后由主进程关闭时放行；`close` 事件另有 `preventDefault` 兜底）、置顶（`alwaysOnTop`）并**居中**显示。**可最小化**（`minimizable: true`，系统黄灯生效）；**缩放禁用**（`maximizable: false`）。
- **应用内提示框（替代系统弹窗）**：同一窗口承载所有更新提示 —— 标题（`#update-title`）+ 消息（`#update-message`）+ 按钮（`#update-prompt-actions`），隐藏进度条 / 状态行 / 取消 / 安装按钮。按钮文案与顺序由主进程按当前语言下发（`update:prompt`），首项 / `defaultId` 用强调色；点击或按 `Esc` 经 `update:choice` 回传，主进程据此继续（如下载）或关闭窗口。
- **标题与红绿灯同一行**：`.update-titlebar`（高 40px、`padding-left: 74px` 避开红绿灯、整行为拖动区）内放标题 `#update-title`。
- 结构（`update.html`）：红绿灯 → 标题（下载中「正在下载更新 vX」/ 完成「下载完成 vX」）→ 提示框模式显示**消息 + 自定义按钮**；下载模式显示 **进度条** `update-progress`（宽 = `percent`）→ 状态行（`已下载 / 总量 · 速度`；完成时 macOS 显示「N 秒后自动退出并打开安装器」、Windows 显示「N 秒后自动重启更新」）→ 底部按钮「取消」与**安装按钮**（macOS =「**退出并安装**」/ Windows =「**重启更新**」，文案随状态里的 `mode` 切换；下载期间禁用；**一旦触发安装——点按钮或倒计时到 0——「取消」与安装按钮一并禁用**；两者紧贴状态行、无多余留白）。整窗为拖拽区、红绿灯与按钮为 `no-drag`。
- 行为见 §6.6 / §7：进度实时回填；下载完成后安装按钮可用并显示 60 秒倒计时。**macOS**：点安装 / 倒计时到 0 → `open` 打开 PKG 系统安装器后退出本程序；安装完成由 PKG postinstall 自动启动 Vessel。**Windows**：调用 `quitAndInstall()`，6 秒未退出则 `app.relaunch()` + `app.quit()` 兜底。

---
