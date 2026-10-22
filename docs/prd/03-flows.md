# 3. 核心流程

> Index: [docs/PRD.md](../PRD.md)

### 3.1 启动

1. 请求单实例锁；已存在实例时聚焦主面板并退出新实例。
2. `app.whenReady()` 后：按需隐藏 Dock → 注册全部 IPC → 创建主面板（`show:false`）→ 创建托盘。
3. 打印版本、平台与数据文件清单。
4. 不显示任何窗口，仅托盘图标可见。
5. **提前请求本地网络权限（仅一次）**：应用启动时主进程先 `app.focus({ steal: true })` 让菜单栏应用成为前台，再向本机各网卡广播地址与 mDNS 组播（`224.0.0.251:5353`）各发送一个空 UDP 包，触发 macOS 15+ 的「本地网络」授权弹窗；触发用 socket **保持 30 秒**（`SOCKET_HOLD_MS`），不重试、不轮询。**每个进程只执行一次**：窗口获得焦点、SSH 连接 / 探测、网络测试等路径再调用都是空操作，不会再反复弹窗或刷日志。发送成功与失败都写一条日志：`[net] local network access requested (hold=30000ms, targets=N)` / `[net] local network access failed: <原因>`。原理、恢复方式与排查流程见 `docs/FAQ.md` §1。

### 3.2 主界面显示 / 隐藏（点击托盘）

主界面模式由 `settings.floatMode` 决定（设置 → 应用 → 悬浮模式；**默认关 = 窗口模式**）。两种模式共用同一份渲染页面 `index.html`（`<html data-window-mode="window|float">` 切换外观）。

**窗口模式（默认，`floatMode = false`）**

1. 点击托盘图标 → 若窗口未创建则创建；每次显示依次 `win.show()` → `win.focus()` → `app.focus({ steal: true })` → `win.moveTop()`，确保在当前桌面直接浮出。
2. **只记忆位置，不记桌面 / 屏幕**：`setBounds(mainWindowBoundsForOpen())` 读取 `main-window.json` 的 `{ x, y }` 并夹回**当前鼠标所在屏幕**的工作区；无记录时在当前屏幕工作区居中。显示前先 `setVisibleOnAllWorkspaces(true)` 让窗口能在当前 Space 浮出，`show()` / `focus()` 后约 60ms 再 `false` 绑定到**当前桌面**；不再调用 `app.focus({ steal: true })`（它会激活应用并可能切回旧 Space）。
3. 窗口是**独立的标准窗口**（`titleBarStyle: hiddenInset` + 系统红绿灯），**普通窗口层级、不常驻置顶**（`alwaysOnTop: false`）。
4. **桌面归属**：窗口打开后固定在其所在桌面，切换桌面时不跟随（保持留在旧桌面）；把它关闭（隐藏）后从另一个桌面点托盘，会先临时加入所有桌面再绑定当前桌面，因此在**新桌面打开**，不会被拉回旧桌面。
5. 关闭按钮（系统红绿灯）= **隐藏**（应用常驻托盘）；`Escape` 亦隐藏。拖动后（防抖 400ms）与关闭前把 `{ x, y }` 写入 `main-window.json`。
6. 尺寸：**固定 640 × 480、不可缩放**（`package.json` 的 `vessel.mainWindow`）；窗口可拖动，位置跨显示保留（只记录坐标，不记录屏幕 / 桌面）。

**悬浮模式（`floatMode = true`）**

1. 点击托盘图标 → 记录托盘 `getBounds()`。
2. 计算 `x = 托盘中心 - 面板宽/2`，`y = 托盘底部 + gapBelowTray`（`package.json` 的 `vessel.window.gapBelowTray`，当前 **2px**，使面板紧贴菜单栏），并按所在显示器工作区夹取。
3. 显示并聚焦主面板。
4. 再次点击、或面板失焦（点击别处）时隐藏；`Escape` 亦隐藏。
5. 打开设置窗口会使主面板失焦并隐藏（与设置互斥）；若面板与设置窗口同时打开，面板失焦（含焦点转到设置窗口）同样自动隐藏。
6. **固定悬浮**（底部栏图钉，对应 `settings.pinWindow`）：开启后失焦不再隐藏、保持置顶，并允许通过底部左侧「应用图标 + 名称」拖动窗口，位置在多次显示间保留；再次点击取消时会立即隐藏，且下次显示重新回到托盘下方默认位置（未固定时窗口不可移动，始终吸附托盘）。

> 切换「悬浮模式」开关时，主窗口的创建项不同（无边框浮层 ↔ 标准窗口），主进程会**销毁并按新模式重建**主窗口（`window-manager.rebuildMainWindowForMode`，此时窗口通常隐藏）。

### 3.3 打开设置

1. 点击主面板右下角设置按钮，或托盘右键菜单“打开设置”。
2. 主进程先隐藏主面板，再创建/聚焦设置窗口（`titleBarStyle: hiddenInset`，普通可缩放窗口）。

### 3.4 SSH 连接

1. 工具列表点击某主机的连接图标 → `ssh:connect`（仅传 `alias`）。
2. 主进程按 alias 查询 `~/.ssh/config`，拼装命令：`ssh [-p 端口] [-i 私钥] [-J 跳板机] [user@]host`（端口为 22 时省略 `-p`）；当私钥为默认的 `~/.ssh/id_ed25519` 或 `~/.ssh/id_rsa`（含展开后的绝对路径）时**省略 `-i`**（ssh 会自动使用默认密钥）。
3. 命令交给**置顶终端窗口**（§3.9）执行：窗口未打开则先打开，然后把 `ssh …` 注入其 shell（不再调用 iTerm，因此不会切换桌面 / 空间）。**设置 → 终端** 里的「SSH 使用内置终端连接」关掉后，退回原来的 iTerm 方式。开启「遵循系统代理」（§3.10）且系统代理为 SOCKS5 时，命令会追加 `ProxyCommand`，ssh2 探测 / SFTP 也会走 SOCKS5。
4. **密码自动输入**：若该主机在设置里存过密码，注入命令时把解密出的密码交给终端会话；`terminal-service` 监听 PTY 输出，出现 `…password:` 提示时自动写入一次（60s 内有效、用后即清，不会在命令行参数 / 环境变量里出现）。仅**内置终端**支持（iTerm 方式不自动输入）。首次连接某主机时的**主机密钥确认**不是密码提示，仍需用户手动确认一次。密码加密存于本地（见 §5.1）。
5. 成功 / 失败在主面板顶部临时提示。

### 3.5 SSH 操作系统探测

1. 入口：设置 → SSH 管理 表单内的「探测系统」按钮（`ssh:detect-host`，可对**尚未保存**的主机探测）；主面板列表不再提供探测按钮。
2. 使用 `ssh2` 连接：代理 socket 先取 `SSH_AUTH_SOCK`，无则回退 `launchctl getenv SSH_AUTH_SOCK`（GUI 从 Finder 启动时不继承 shell 环境）；有 `IdentityFile` 时读取私钥。**支持密码认证**：优先用表单里填的密码，留空则回退到该别名**已保存的加密密码**（除非表单点了「清除密码」），并开 `tryKeyboard` 兼容用 keyboard-interactive 提交密码的服务器。执行 `uname -s; echo '|||'; cat /etc/os-release`；识别不到时回退 `cmd /c ver`。
3. 归类到具体系统 / 发行版：Linux 读取 `/etc/os-release` 的 `ID`（如 `ubuntu` / `fedora` / `arch` / `centos` / `debian` / `rhel` / `alpine` …），macOS 为 `macos`，BSD 为 `freebsd` / `openbsd` 等，Windows 为 `windows`；同时给出 `family`（`macos`/`linux`/`windows`/`bsd`/`unknown`）与显示名 `label`。
4. 结果（`{ os, family, label, at }`）写入 `ssh-detected.json` 并广播 `ssh:detected` 事件；渲染层据此更新左侧彩色系统图标与提示。
5. 表单内探测期间按钮显示「探测中…」且禁用；**探测成功后**才启用「保存」。**探测失败不清空表单**：已填写的别名 / 地址 / 用户 / 端口 / 私钥 / 跳板机 / 分组 / 密码都会保留，便于原地修改后直接重新探测（密码为内存草稿，不落盘）。
6. **日志**：探测的每一步（开始、目标、认证方式、执行命令、stdout/stderr、解析结果、连接报错）都会追加写入**当天的日志文件** `~/Library/Logs/Vessel/vessel-YYYY-MM-DD.log`（设置 → 日志 → 日志文件夹可打开所在目录）；便于排查本地网络 / 权限问题。
7. **macOS 本地网络权限**：主 `Info.plist` 与 **4 个 Electron Helper 的 `Info.plist`** 都含 `NSLocalNetworkUsageDescription`（打包时由 `afterPack` 统一写入，见 §7）。应用**只在启动时主动请求一次**（广播 + mDNS 各一个空包，socket 保持 30 秒，不重试；后续调用为空操作），成功 / 失败均记日志；macOS 15+ 首次访问局域网（如 192.168.x / 10.x / 172.16.x）时会弹「本地网络」授权，需允许 Vessel，否则连接会被系统拦截（表现即 `No route to host` / `EHOSTUNREACH`）。可在「系统设置 → 隐私与安全性 → 本地网络」中开启。注意：该授权按 bundle id 记录，**更换 appId 会得到一条全新的、未授权的记录**；`tccutil` 无法重置本地网络授权。**出现本地网络不可达 / 弹窗不出现 / 授权条目与运行实例不一致时，按 `docs/FAQ.md` §1 的测试流程排查。**

### 3.6 修改设置

1. 设置窗口任一控件变更 → `settings:set`（增量 patch）。
2. 主进程合并写入 `settings.json`，必要时应用登录项，并广播 `settings:changed`。
3. 主面板与设置窗口同步应用主题 / 强调色 / 语言；主题为“跟随系统”时监听 `nativeTheme` 的 `updated` 事件（广播 `theme:changed`）。
4. 副作用：`pinWindow` → `applyPin`；`vibrancy` → `applyVibrancy`（销毁并按新配置重建主面板，使原生 `vibrancy` 与 `roundedCorners` 同时生效），主面板同时更新 `<html data-vibrancy="on|off">`；`theme` → `nativeTheme.themeSource`（使原生材质与应用主题一致）；`terminalWindowWidth` / `terminalWindowHeight` → 已打开的终端窗口立即 `setSize`；`terminalAlwaysOnTop` → 终端窗口层级；`mainWindowHotkey` / `terminalHotkey` → `hotkey-service` 重新注册全局快捷键（先注销旧值，注册失败只记日志、不改设置，见 §3.9-8）。

---

### 3.7 远端文件（独立文件窗口）

主面板不再内嵌目录浏览：**SSH 管理**每行的 `folder` 图标改为**打开独立文件窗口**（§3.9-11）并自动连接该主机（`file-window:open`，`target` = 主机别名）。原来的主面板目录浏览（`ssh:list-dir` / `ssh:open-dir` / `ssh-browse-service` / `ls-listing` / `ssh-browse.json`）已整体移除。远端目录 / 文件的浏览、下载、上传统一由**文件管理**（§3.9-10 内嵌面板、§3.9-11 独立窗口）经 SFTP 提供。

---

### 3.8 网络测试（设置窗口）

1. **入口**：设置 → 网络测试（导航分区 `network`）；主面板底部栏的「网络测试」图标（`wifi`）会打开设置并直接定位到该分区（`window:open-settings` 携带 `section`）。
2. **执行位置**：自绘下拉选择 **本地** 或 `~/.ssh/config` 里的任一主机（主机多个分组时，两组之间显示分组小标题，见 §5.1）；选主机时整条命令包一层 `ssh … '<命令>'`，即在**该主机上**执行同一份命令（跳板机语义）。凭据沿用主机配置（端口 / 私钥 / ProxyJump）与 ssh-agent（`SSH_AUTH_SOCK` 优先取环境变量，回退 `launchctl getenv SSH_AUTH_SOCK`）；一次性执行、不分配 TTY。
3. **类型与端口**：**单行 TAB 式分段控件**（`ShipsUI.segmented` + `.segment-compact`，7 段）选择 **TCP / UDP / HTTP / ICMP / ARP / 扫描应用 / 扫描主机**（标签短，完整含义与命令见悬浮提示；列表在 `src/renderer/scripts/constants.js` 的 `NET_TEST_PROTOCOLS`，需与主进程 `src/main/utils/net-test.js` 的 `PROTOCOLS` 一致）。**ICMP / ARP / 扫描主机不使用端口**（端口禁用）；**扫描应用的端口可留空**（留空 = 扫该目标常用端口，填了 = 精确扫该端口）；端口默认 **80**、只接受 1–65535。目标支持 **IPv4 或网段**；**扫描主机必须填网段**（前缀 16–30，超出提示「网段前缀需在 16–30 之间」）。
4. **执行**：点「测试」→ `net-test:command`（`{ id, protocol, target, port, host? }`，`id` 是本节的终端会话）。主进程先校验（IPv4 / 网段 / 端口 / 协议白名单 / 主机别名，非法直接拒绝、绝不拼接未校验内容），先用 `Ctrl-U` 清空终端当前输入行，再送入命令 + 回车（不再先发一个空回车，避免多出空白提示行），**送进终端里正在运行的 shell**（等价于手敲：回显、Ctrl-C、管道、重定向都走真实终端）：
   - TCP → `nc -vz -w 3 <ip> <port>`；UDP → `nc -uzv -w 3 <ip> <port>`
   - HTTP(S) → `curl -Ikm8 http(s)://<ip>:<port>/`（443 用 https）
   - ICMP → `ping -c 4 <ip>`；ARP → `arp -n <ip>`
   - 扫描主机 → `nmap -sn <网段>`；扫描应用 → `nmap -sT [-p <port>] <目标>`（connect 扫描，无需 root）
   执行位置选了 SSH 主机时，整条命令包一层 `ssh … '<命令>'`（在那台机器上跑同一份命令）。「停止」= 向终端发送 `Ctrl-C`。
5. **交互终端**：xterm.js + **真实 PTY**。PTY 由 `src/main/scripts/pty-bridge.py`（Python 标准库 `pty`）创建，运行**用户默认登录 shell**（`$SHELL`，回退 `os.userInfo().shell`，最后 `/bin/sh`）：可直接敲命令、`clear` / `Ctrl-L` 清屏、`Ctrl-C` 中断、`cd` / 管道 / 重定向，以及需要终端的交互式工具（`vim`、`sudo` 密码提示等）。键盘输入经 `terminal:input` 写入 PTY，输出经 `terminal:data` 原样回传（含 ANSI），`TERM=xterm-256color`；终端尺寸随面板自适应（`FitAddon`），并在变化时通过 `terminal:resize` → `TIOCSWINSZ` 同步给 PTY。会话由 `terminal-service` 统一管理（带 id，可同时存在多个：设置页一个、置顶终端窗口一个）。需要系统提供 `python3`：打包后脚本位于 `Contents/Resources/app.asar.unpacked/src/main/scripts/pty-bridge.py`（`build.asarUnpack` 含 `src/main/scripts/*`，因为 `app.asar` 内的脚本无法执行），`terminal-service` 会把 `app.asar` 路径改写为 `app.asar.unpacked`；解释器依次探测 `/usr/bin/python3`、`/opt/homebrew/bin/python3`、`/usr/local/bin/python3`（可用 `VESSEL_PYTHON`（兼容旧 `SHIPS_PYTHON`） 覆盖），都找不到时用 PATH 里的 `python3`，脚本缺失则在终端里报错。
6. **会话生命周期**：进入分区自动启动会话；shell 退出（如输入 `exit`）后终端提示「会话已结束」，此时敲任意键或点「测试」会重新启动；离开分区、关闭窗口、退出应用都会结束会话（`terminal:kill`；主进程 `before-quit` 调 `killAll()` 兜底）。

------

### 3.9 置顶终端窗口（Steam 式悬浮）

1. **入口与多窗口（Steam 式独立）**：主面板底部栏的**终端图标**（`terminal`）**每次点击都新开一扇独立的终端窗口**，落在**当前桌面 / 鼠标所在屏幕**（`terminal:open` → `openTerminalWindow()`；几何沿用 `terminal-window.json` 记忆）；已有多扇时，新窗口相对记忆位置**逐扇偏移 26px**（并夹回该屏工作区），避免完全盖在一起。**窗口一旦打开就永远留在那个桌面**——不同桌面可以同时存在多扇终端，且**绝不**把别的桌面上已打开的窗口拉过来（已移除原来的「先 true 再 false」跨桌面拉取）。**全局快捷键**（§3.9-8）在当前终端前台时按 = **收缩成悬浮球**（球态时按 = 放大回窗口），否则新开一扇。**SSH 连接**（§3.4）注入命令到**当前聚焦的终端**；没有聚焦的终端时新开一扇。多扇终端窗口各自持有独立的会话、文件面板与 SFTP 连接（按 webContents 归属）。
2. **窗口**：默认 **1024 × 768**（`vessel.terminalWindow.width/height`，**可在 设置 → 终端 → 窗口大小 调整**，见 §5.1；`terminalWindowWidth` / `terminalWindowHeight`），可缩放、最小 `vessel.terminalWindow.minWidth × minHeight` = 350×200；改设置立即 `setSize`，手动拖动窗口（非最大化 / 全屏）防抖 400ms 写回设置。`titleBarStyle: hiddenInset`，但**系统红绿灯由主进程 `setWindowButtonVisibility(false)` 隐藏**，头栏左侧改为**自绘小红绿灯**；终端内容**上下不留边距、左侧留 2px**（`--term-padding-y: 0`，`#term-host` 左内边距 2px；`vim` 之类的全屏程序左右基本铺满）；**打开后自动聚焦 xterm 输入**（窗口每次获得焦点也会重新 `term.focus()`）；窗口可自由拉伸，**拖动过程中不干预**（下边框严格跟手、绝不中途改尺寸），松手后按实测余量把窗口对齐到整格（见下条）。
   - **头栏（`#term-header`，默认 22px）**：左侧自绘小红绿灯（**尺寸随头栏字号缩放**：`--traffic-size = 字号 × 0.75`、`--traffic-glyph-size = 字号 × 0.5`，12px 字号 = 9px 圆点 / 6px 符号；**左右 padding 均为 10px**：左边距 10px = 第一个圆点到窗口左边缘的距离、右侧图标区距右边缘 10px；悬浮符号 `×` / `−` / `⤢`，颜色取 `--traffic-*`；悬浮任意一个时三个都显示符号，窗口失焦时整体变灰并隐藏符号 —— 与系统观感一致），点击分别调 `window:control` 的 `close` / `minimize` / `zoom`（只作用于发起窗口）；**不显示任何标题文字**（当前 SSH 信息仅用于内部逻辑，不在头栏显示，见下条），右侧图标区（**SSH 主机下拉** + **文件** `folder`、**在 iTerm 中打开并关闭此窗口**、**行号** `eye`/`eye-off`、**窗口分裂** `split`（点击**新开一扇终端窗口**，与主面板底部栏的终端按钮行为一致）；**已去掉置顶（图钉）按钮**，置顶只由设置里的 `terminalAlwaysOnTop` 决定）。头部不挂 `data-tip` 悬浮提示，为拖拽区（红绿灯与图标区为 `no-drag`）。
   - **头栏随终端字号缩放（字号夹在 10–20px，高度夹在 16–32px）**：`--term-header-font-size = clamp(10px, 终端字号, 20px)`；`--term-header-height = clamp(16px, round(头栏字号 × 1.6), 32px)`（10px 字号 → 16px，20px 字号 → 32px），由 `terminal.js` 的 `applyHeaderFontSize()` 在启动 / 改设置 / `Cmd +/-/0` 时写入。图标按钮 = 头栏字号 + 6px（符号 = 头栏字号）、红绿灯 = 0.75 × 头栏字号（符号 = 0.5 ×）、SSH 下拉字号 = **头栏字号 - 2px**、高 = `clamp(14px, 头栏字号 + 3px, 22px)`、宽 = `clamp(170px, 头栏字号 × 10, 260px)`（下拉箭头 = 头栏字号 - 2px）。下拉菜单宽度随触发器实测宽度（`createSelect` 的 `matchTrigger: true`）、条目高 = `max(22px, 头栏字号 + 8px)`（在原来基础上上下各 +1px）、上下 padding 1px、字号 = 头栏字号 - 2px、圆角 5px、无分隔线。独立文件窗口使用同一套映射（由 `file-window.js` 写入）。
    - **头部 SSH 下拉**（图标区最左）：列出 `~/.ssh/config` 里的主机，条目文本为 `用户名@主机地址`（无 `User` 时只显示主机地址）；占位「连接到服务器」**只显示在触发器上（未选择时），不出现在下拉列表里**。列表顺序为**有分组的主机在前（按分组在配置中出现的顺序）、未分组的主机排最后**；**存在多个分组时在每组条目前插入一个分组小标题**（不可点，未分组组的标题为「未分组」；只有一个分组时不显示标题）——分组来自 config 的 `# group:` 注释（见 §5.1）。**设置页对主机 / 分组的增删改会经 `ssh-config:changed` 广播，下拉实时刷新**。选中任意主机 → `ssh:connect`（带 `inTerminal: true`）→ 由主进程用 `ssh-service.buildCommand()` 拼 `ssh [-p 端口] [-i 私钥] [-J 跳板机] [user@]host` 并**注入当前终端会话**（不弹 iTerm，因此也不受「SSH 使用内置终端连接」开关影响）。**切换主机时的会话处理**：若当前已通过本应用发起过 SSH 连接（`sshTarget` 非空），渲染层先**销毁当前 PTY / shell 并重新创建一个登录 shell**（**不清屏**，只在终端里打印一行灰色提示「正在重建终端会话…」以保留原输出），等新会话就绪后再注入 `ssh …`，避免旧 ssh 会话残留 / 嵌套；若当前仍是系统 shell（`sshTarget` 为空），则**不重建**，直接在现有 shell 里执行。**同一台主机可以重复选**（每次选择都重新执行，便于断开后重连）。下拉**禁用**并降低不透明度当 `~/.ssh/config` 里没有主机；主机列表在窗口启动与 `settings:changed` 广播时重新读取。控件用 `select-compact`，宽度 / 高度 / 字号随头栏字号缩放（宽 `clamp(170px, 头栏字号 × 10, 260px)`、高 `clamp(14px, 头栏字号 + 3px, 22px)`，见 §3.9-2）。
   - **屏幕 / 位置 / 尺寸记忆**（`terminal-window.json`，单槽）：打开、移动、缩放、关闭时把「所在屏幕 + 位置 + 尺寸」写入 `terminal-window.json`（关闭前同步落盘，拖动后立刻关窗也不会丢；写盘读窗口**此刻**的真实几何，程序化改尺寸不会被旧快照覆盖）。下次打开时：**该屏幕还在**（`id` + `scaleFactor` + `bounds` 全一致）→ 应用记忆的位置与尺寸（越界部分夹回该屏幕工作区，整窗可见）；**换屏 / 拔掉外接屏 / 分辨率或排列变了 / 无记录** → 用设置里的默认尺寸在当前屏幕（鼠标所在屏幕）工作区内居中。屏幕签名一致才复用，是因为分辨率 / 排列变化后记忆里的绝对坐标不再是同一块屏幕上的同一位置。**拖动时水平磁性吸附**：窗口中心与屏幕工作区的**垂直中线**（x 方向）对齐（±10px）时吸附到正中并轻微「卡」住，拖动超过 26px 才脱开（`CENTER_SNAP.xThreshold` / `xRelease`，仅改 x、不要求上下居中；与窗口模式主窗口同一行为）。
3. **置顶与全屏**：默认置顶（`vessel.terminalWindow.alwaysOnTop` / `settings.terminalAlwaysOnTop`，缺省为开；`alwaysOnTop` 且 `setAlwaysOnTop(true, 'screen-saver')`）。**头栏没有置顶（图钉）按钮**，置顶只由设置 `terminalAlwaysOnTop`（`terminal:set-top` 仍可被设置界面 / 其它入口调用）决定。**该开关只作用于终端窗口，不影响主面板**（悬浮面板恒定置顶；窗口模式不置顶，见 §8.1）。空格行为是 `setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true, skipTransformProcessType: true })` = `NSWindowCollectionBehaviorDefault | FullScreenAuxiliary` —— **带全屏辅助、但不加入所有桌面**：可以浮在（当前桌面里的）全屏应用之上，同时**不会跟随桌面切换**，始终留在打开它的那个桌面。**该声明在窗口创建时、以及每次获得焦点时（此刻窗口就在活动桌面上）执行**（`skipTransformProcessType: true`：应用已是 `LSUIElement` 菜单栏 Agent，无需进程类型转换，转换会短暂隐藏窗口 / Dock 并改变激活行为）；**变球时不再重新声明**（变球发生在用户已切到其它桌面之后，此时再设会按 macOS 语义把窗口重新分配到「当前活动桌面」→ 球会跟着切换桌面，见 §3.9-12）；放大回来时最后重申一次，便于经全局快捷键把窗口带到当前桌面。iTerm 会强制切桌面，所以 SSH 连接改走这里。
4. **终端**：与 §3.8 同一套 xterm.js + `pty-bridge.py` 真实 PTY，运行 shell（取设置 → 终端的**默认 shell**，`terminalShell`；留空或文件不存在时回退 `$SHELL` / `os.userInfo().shell`）；**滚动缓冲与字号取设置**（`terminalScrollback` / `terminalFontSize`，默认 10000 行 / 14px；`app:info.terminalScrollback` 仅作为配置缺失时的兜底）；窗口尺寸变化会同步 PTY 尺寸，关闭窗口即结束会话。
   - **不显示滚动条**：两处都关掉 —— ① 原生滚动条：`.xterm-viewport` 用 `scrollbar-width: none` / `::-webkit-scrollbar { display: none }`（`xterm.css` 先于本应用样式加载，保证规则生效）；② **xterm 自绘的滚动条**：`.xterm .xterm-scrollable-element > .scrollbar { display: none !important }`（xterm 6 只是用该元素做视觉指示，缓冲区滚动由它自己处理，隐藏后滚轮 / 触控板照常滚动）。主题里同时给出 macOS 风格的滑块色（`scrollbarSliderBackground/Hover/Active`）作为兜底，万一再出现滚动条也是圆角半透明样式。
   - **防跳变**：只在容器尺寸真的变化时 `fit()`，且只在 `cols`/`rows` 变化时才 `terminal:resize` —— 多余的 PTY resize 会让 shell 重绘，看起来像滚动时视图跳。
   - **会话结束即关窗**：在终端里 `exit`（或 `Ctrl-D`）结束 shell 后，主进程发出 `terminal:exit`，渲染层先把 `sessionId` 清空（免得 `beforeunload` 再去 kill 一个已消失的会话）再直接 `window.close()` —— **窗口自动关闭，不再显示「会话已结束」之类的提示**。只有会话**启动失败**（`type: 'error'`，例如 PTY 桥接脚本缺失 / 无法启动）才保留窗口，并把原因用红字写在终端里，便于排查。
   - **尺寸测量**：xterm 挂在**无内边距**的 `#term-fit`（`h-full w-full`）里，留白由外层 `#term-host`（四边 0）提供 —— `FitAddon` 按「父元素的 border box 高度」算行数，若父元素自带内边距会把可用高度多算一份内边距（默认窗口下多算 19.5px ≈ 1 行），于是最后一行被裁掉大半行、页面还多出几像素可滚动高度（滚轮时标题跟着上下动）；父元素无内边距时测量值即真实可用区。`#term-host` 与页面根容器另加 `overflow: hidden` 兜底：即使残留绝对定位元素（如 xterm 的 `xterm-helper-textarea`）越界，也不会让页面可滚动。
    - **字号缩放**：按 `Cmd + =` / `Cmd + -` 只改终端字号（8–64px，步进 1px，初始值取设置里的字体大小；写回 `settings.terminalFontSize`，所有已打开的终端窗口同步）；**页面缩放因子固定为 1**，不缩放整页；头栏与图标**跟随字号**（按 10–20px / 20–32px 映射，见上条），不是固定尺寸；调整时在「固定」图标右侧临时显示新字号（`#term-size`，与行列提示共用，约 900ms）。`Cmd + 0` 复位到默认 **14px**（同样写回设置）。**在 设置 → 终端 改字体大小 / 字体家族会即时生效**：终端窗口也在 `settings:changed` 广播名单里（`window-manager.broadcast`），只有设置值本身变化时才覆盖当前值。
    - **URL / 文件路径链接**：**按住 Command 时**才识别终端输出中的 `http(s)://` 地址与绝对路径 / `~/` 路径并加下划线 / 手形（松开 Command 不提供链接、不显示下划线）；`Cmd + 点击`（非 macOS 为 Ctrl）时，URL 用系统默认浏览器打开（`app:open-external`，只允许 http/https），文件路径在 Finder 中定位（`app:open-path`，仅接受绝对路径 / `~`，先校验存在；目录与文件都只“在文件夹中显示”，不执行文件）。URL 内部不会被误识别成路径，`and/or` 这类普通文本也不会。
    - **右键快速编辑（Windows cmd 风格）**：终端内容区**单击右键**即完成复制 / 粘贴，**不弹右键菜单**。有选区时右键 = **复制选区到系统剪贴板并清除选区**（`terminal:copy-text`）；无选区时右键 = **把系统剪贴板文本粘贴进当前 shell**（`terminal:paste-text`，经 `term.paste()` 注入，遵循 bracketed paste 与 `\n → \r` 转换）并让终端重新获得焦点；无会话时粘贴忽略。仅在终端内容区（`#term-fit`）生效，头栏不受影响，且请求只接受来自终端窗口本身。
    - **当前 SSH 目标（不再后台轮询 `ps`）**：**不再周期性执行 `/bin/ps` 扫描进程树**。SSH 目标只在**本应用发起连接**时确定：头部 SSH 下拉 / SSH 管理连接成功后，`terminal-ipc` 把目标别名经 `terminal:session` 事件推给该终端窗口（用于启用**文件按钮**、驱动内嵌文件面板与 SFTP）；手动在终端里敲 `ssh …` 不会被自动识别（可用独立文件窗口手动连接）。目标不显示在头栏；会话重启 / 退出时由渲染层清空。**ssh 断开自动收尾**：注入 `ssh …` 时在本地 shell 里追加 `printf` 一个不可见 OSC 标记（`SSH_EXIT_MARKER`；该 `printf` 片段被 shell 回显时由渲染层从显示内容中删除，前台只看到 `ssh …` 本身），ssh 进程结束（`exit` / 连接断开 / 被终止）后 shell 输出该标记，渲染层识别并立即清空当前 SSH 目标、断开内嵌文件面板（销毁 SFTP 会话并收起面板），不依赖后台 `ps` 轮询。
   - **留白与整格对齐**：终端主体 `#term-host` `padding: var(--term-padding-y) 0 var(--term-padding-y) 2px`（上下 0、**左 2px**、右 0；`#term-fit` 仍是无内边距的那层，保证 `FitAddon` 量到真实可用区）。窗口尺寸保持在「行高 / 列宽的整数倍 + chrome」：
     - **列数自己算**：`FitAddon` 只要 `scrollback > 0` 就固定预留 14px（给 overview ruler），会让终端比窗口窄、右侧空出一条白边（我们本来就隐藏滚动条）。`fitIfNeeded()` 里 `fit.fit()` 之后按实测单元格宽度重新 `term.resize(cols, rows)`，列数铺满可用宽度。
     - **拖动期间一律不改窗口尺寸**：不用 `will-resize` 拦截、也不 `setBounds`（中途改帧会打乱 macOS 的增量拖拽跟踪 → 越拖越小 / 反复跳变）。`will-resize` 只用来标记「正在拖动」并广播 `terminal:drag-active`；渲染层收到后**不再发对齐请求**（请求即使到了主进程也只会被挂起），下边框严格跟手。
     - **松手信号**：拖动中渲染层收不到鼠标事件，因此「鼠标重新出现在终端内容区」（`mousemove`）即视为松手 → 重新 `fit()` + 对齐；同时拖动空闲 380ms 后主进程会发 `terminal:recalibrate` 兜底。挂起的旧请求一律作废，绝不套用过期的数值。
      - **页面缩放固定为 1**：终端窗口（及独立文件窗口、主面板、设置窗口）加载后强制 `setZoomFactor(1)`（并在 `zoom-changed` 时归零）—— Electron 会按 origin 记住页面缩放，历史缩放会让 renderer 的 CSS px 与窗口内容尺寸（DIP）不再相等，导致整格对齐算错。`Cmd +/-` 只改字号（§5.3），不改页面缩放。
      - **对齐按 chrome 计算、四舍五入到整行 / 整列**：`chrome = 窗口内容尺寸 − 终端区尺寸`（头栏 / 分隔线 / 文件面板 / 状态栏等固定部分）。终端区尺寸**四舍五入**到最近的整行 / 整列（余量 > 半格就补一行 / 一列，否则收掉余量），目标 `内容高 = chrome高 + 行数×行高`、`内容宽 = chrome宽 + 列数×列宽`，与当前相差 **≥2px** 才经 `terminal:snap-size` 设置（1px 死区，避免取整抖动）。主进程还有 60px 的安全上限，偏差过大宁可不做。首次打开、改字号、设置里改窗口大小、打开 / 关闭文件面板都会走这条路径。
      - **单元格尺寸用 xterm 的稳定值**：行高 / 列宽取自 `term._core._renderService.dimensions.css.cell`（不随列数 / 行数变化）；退化时才用「屏幕宽 ÷ 列数」。否则「屏幕宽 ÷ 列数」会随列数取整而抖动（798↔799、91↔92 列），导致窗口反复微调。`fitColumns` 也用同一稳定值。
      - **松手即对齐（不依赖 will-resize / mousemove）**：渲染层在 `window` 的 `resize` 上**防抖 120ms**（= 松手）后清除「拖动中」标记并重新 `fit` + 对齐；主进程在拖拽空闲约 160ms 后也会无条件发一次 `terminal:recalibrate` 兜底。两种信号触发同一段「清除标记 → 重新测量 → 按 chrome 对齐」逻辑，所以拖动完成后即便鼠标不再移动、行数 / 列数没变，也会自动对齐（响应更快）。
      - **拖动 / 缩放期间**在「固定」图标右侧显示 `列 × 行`（`#term-size`，等宽小字、`pointer-events: none`），停手 700ms 后自动隐藏。
      - **尺寸 / 字体度量日志**：窗口尺寸变化时经 `log:write` 把当前**字体大小、行高、列宽、窗口 / 内容尺寸、列 × 行**写入**控制台与当天日志文件**（`[term-metrics] font=…px lineHeight=…px colWidth=…px window=…x… content=…x… cols=… rows=…`），便于排查行高 / 窗口对齐问题。
      - **行号（`eye` 按钮，默认关闭）**：开启后在终端**最左侧**显示每行的行号，**按当前窗口编号——第一行永远是 1**（`1..rows`，两位、不足补 0，不随滚动变化）；开启时给 `#term-host` 让出左侧宽度（`#term-gutter`），窗口重新 `fit` 并整格对齐。
      - **`Cmd +/-/0` 直接改设置里的字号**：`menu.js`/`zoom-changed` 路由到渲染层后写入 `settings.terminalFontSize`（持久化，重开终端保留），**不再改页面缩放因子**（缩放因子固定为 1，头栏 / 图标尺寸不变）。

5. **窗口分裂**：头部**窗口分裂**图标（`split`）点击后**新开一扇终端窗口**，行为与主面板底部栏的终端按钮一致（`terminal:open` → `openTerminalWindow()`，落在当前桌面 / 鼠标所在屏幕，几何沿用记忆并逐扇偏移 26px，见 §3.9-1）。原「复制全部内容」按钮与功能已整体移除（终端右键快速编辑的复制选区仍保留，见 §3.9-4）。
6. **iTerm 交接**：头部终端图标调用 `iterm-service.openCommand()` 在 iTerm 中重放**最后一次由外部注入的命令**（例如 SSH 连接 / 网络测试命令；没有则开一个登录 shell），成功后关闭当前终端窗口。
7. **SSH 连接改走这里**：`ssh:connect`（§3.4）默认不打开 iTerm，而是把 `ssh …` 命令注入**当前聚焦的终端窗口**（没有聚焦的终端就新开一扇；窗口不跨桌面移动），失败时才提示错误；受 设置 → 终端 →「SSH 使用内置终端连接」（`settings.sshBuiltinTerminal`）控制，关掉后退回 iTerm（头部 SSH 下拉传 `inTerminal: true`，明确要求在**当前终端**执行，不受该开关影响，见第 2 条）。
8. **全局快捷键**（`hotkey-service`）：设置 → 快捷键 分别绑定**主窗口**与**终端**（`settings.mainWindowHotkey` / `settings.terminalHotkey`，默认都为 `CommandOrControl+Shift+Z`）。触发规则：**终端 = 按一下**；**主窗口 = 快速连按两下**。两者使用同一组合键时，单击会等待 `SHORTCUT_DOUBLE_TAP_MS`（260ms）以区分双击：双击 = 主窗口，单击 = 终端；绑定不同组合键时各自按上述次数工作。终端行为：**同时存在多扇终端窗口时快捷键失效（不响应）**；只有一扇时，在**悬浮球 ↔ 终端窗口**之间互相切换 —— 处于悬浮球时放大回窗口；窗口在前台时**收缩成悬浮球**；窗口既不在前台也非球态时**拉回前台**；一扇都没有则**新开一扇**（窗口不跨桌面移动）。**悬浮球关闭时回退为「关闭按钮行为」**（`hide` 隐藏 / `destroy` 销毁）。改绑 / 取消时先试注册，**注册失败（被其它 App 占用、格式非法）不写入设置**，设置界面红字提示并把原值留在设置里；空字符串 = 不注册（界面显示「未设置」）。应用退出（`before-quit`）时 `unregisterAll()`。
9. **关闭按钮行为**（设置 → 终端 →「关闭按钮行为」，`settings.terminalCloseAction`，默认 `destroy`，来自 `vessel.terminalWindow.closeAction`）：所有「隐藏终端」的路径统一走 `window-manager.shrinkTerminalToBall()` —— 悬浮球开启时**收缩成悬浮球**，关闭时才真正隐藏。
    - **`destroy`**：关闭按钮 / `Cmd-W` **直接销毁**（结束会话）。
    - **`hide`**：关闭按钮 / `Cmd-W` **收缩成悬浮球**（不再真正隐藏窗口；会话与 shell 保留，点球或快捷键放大回来，见 §3.9-12）。窗口 `close` 事件被 `preventDefault()` 拦下后走 `shrinkTerminalToBall`。
    - **最小化按钮禁用**：终端窗口头栏的「最小化」红绿灯**失效**（灰显、不可点）。
    - **例外**：在终端里 `exit`（会话结束）与「iTerm 交接」走 `terminal:destroy` → **始终销毁窗口**，不受上述规则影响 —— 否则会留下一个已结束的会话挂在后台。
    - **退出应用例外**：`app.quit()`（如托盘右键「退出 Vessel」）时主进程先置 `isQuitting`，终端窗口的 `close` 不再走 `preventDefault()`，而是正常关闭，保证退出不被拦截。
10. **内嵌文件面板（SFTP）**：头部 **文件按钮**（`folder`，仅当检测到当前 ssh 目标时可用，否则禁用；连接中图标旋转、展开时强调色）显隐**窗口底部的内嵌文件面板**（终端区域随之收窄并自动重新 fit）。面板与终端之间有一条**可拖动分隔线**（向上拖 = 终端变小、面板变高），高度持久化到 `file-layout.json`（见 §5.1）。文件管理 UI（左目录树、右文件列表、状态栏、可拖动分栏）由 **`scripts/file-manager.js`** 提供，终端窗口（`terminal-files.js`）与独立文件窗口（`file-window.js`）共用同一套（见 §3.9-11）。
    - **布局**：左列**目录树**占初始 **300px**（可在分隔线上拖动改变宽度；顶部路径行 = **分离为独立窗口 / 刷新 / 家目录 / 路径输入框**，顺序固定 —— 前三者为图标、排成一排，分离仅内嵌面板有，高度与右列表头一致）；右列**文件列表**表头与行均为网格（图标 / 文件名 / 体积 / **权限** / 时间；**文件名 / 体积 / 权限 / 时间四列列宽可拖动改变**，默认 **160 / 60 / 90 / 130px**）；列表头「时间」列只有标签（上传已移到**目录树节点右键菜单**，分离按钮已移到路径行）。文件行不再有行内下载按钮，改为**右键菜单「从文件夹打开」/「下载到本地」**。最底**状态栏**（左=当前绝对路径，右=状态信息，中间=**进度条**）。树宽与列宽一并持久化到 `file-layout.json`。字体与样式**跟随终端字号**（`--file-font-size`，`Cmd +/-`、`Cmd 0`、设置里的字体大小都同步作用到文件管理部分）。**面板默认隐藏**（ID 规则用 `:not(.hidden)` 保证不被 `.hidden` 覆盖），仅在点击头部文件按钮时展开。**终端与面板之间只有一条分隔线**（面板自身不再画上边框；分隔线就是那条可拖动的线）。
    - **首次打开自动放大**：若 `file-layout.json` **没有**本地调整记录，打开面板时按最小布局套用并把终端窗口**只放大不缩小**到够用 —— 终端 ≥ **300**、文件管理 ≥ **200**（目录树 **220**、文件列表 ≥ **400**），即内容区约 **626 × 550**（`terminal:ensure-size`，受屏幕工作区限制，不写回几何记忆）；有本地记录则完全按记录（含面板高度 / 树宽 / 列宽）来。
    - **交互**：树节点单击进入 / 展开（`caret-right` 展开时旋转 90°），目录树以 `/` 为根按需展开；路径输入回车进入（支持绝对路径 / `~` / 相对当前目录）；**点文件行**时左侧目录树滚动定位并高亮该文件所在目录节点（**任何导航**——目录树 / 路径输入 / cd 跟随 / 历史——成功后都会展开目录树到当前目录，确保该节点存在、点文件能定位）；**双击文件行**：体积 ≤ 10M 且为文本类型 → **从 VS Code 打开**；体积 > 10M 或为图片 / PDF / Word / Excel / 压缩包 / 音视频等**非文本类型** → **从文件夹打开**（用系统默认程序打开，行为同右键「从文件夹打开」）；**文件行右键 → 从文件夹打开 / 从 VS Code 打开 / 下载到本地**（「从文件夹打开」= 下载后由系统文件管理器定位该文件，「从 VS Code 打开」= 下载后由 Visual Studio Code 打开，「下载到本地」= 仅下载）；上传有两种方式：**拖拽本地文件到右列**，或**目录树节点右键「上传」**（打开系统文件选择窗口多选后上传到该目录，逐个显示进度）；**目录树节点右键「进入该目录」**（仅内嵌面板：在当前终端 `cd` 到该目录，并导航面板、记入 cd 历史）；**点「刷新」清掉状态栏提示**。**所有状态栏提示均保留 30 秒后惰性清除**（下一次设置会重置计时），且每次设置状态栏都会**同时写控制台日志与当天文件日志**（`log:write`，见 §8.6）。
    - **权限列**：由 SFTP `attrs.mode`（st_mode）格式化为 `drwxr-xr-x` 风格（类型字符 + rwx ×3）。
     - **PWD 跟随（cd 命令）**：终端里提交**纯 `cd …` 命令**时识别并导航。检测方式：按回车瞬间读取 xterm **当前行「光标之前」的文本**（`translateToString(false, 0, cursorX)`）再剥掉提示符（最后一个 `# `/`$ `/`% `/`> ` 之后）—— **这样能拿到 shell 回显后的真实命令、包含 Tab 补全结果，同时排除 zsh autosuggestion 之类的灰色建议**；读不到才退回键入跟踪（并跳过 ANSI / 括号粘贴序列）。解析：**相对路径按「终端 shell 的当前目录」`shellCwd` 解析**（初始 = 家目录、每次 cd 成功后同步；不按文件面板手动浏览到的目录，避免两者分叉），绝对路径 / `~` 直接解析；`shellCwd` 为估计值。**含 `..` 的相对路径（`cd ..` / `cd ../x`）一律不跟随**（无法可靠得知 shell 真实当前目录，避免导航到错误目录）；含 `..` 的绝对路径 / `~` 路径仍会规范化后跟随。文件面板若已连接就导航；**并展开该路径的所有上级目录、把目录树滚动定位到目标节点**（`expandTo` + `scrollTreeToSelected`），目标不存在则静默保持当前目录；手动导航 / 其它命令不触发跟随。**连接就绪前收到的 cd 会排队**，连上后跟随。
     - **cd 历史（路径输入框下拉）**：点「路径输入框」聚焦时，在其下方下拉出**该 ssh 目标（`用户名@主机`，由 `sessionKey` 解析）最近 cd 到的目录**（去重、越新越靠前、最多 **10** 条，`CD_HISTORY_MAX`）。点条目 → 文件浏览器与该终端（ssh）**同时前往该目录**（`navigate` + `onCd`）；独立文件窗口无终端时只导航。历史**只记录通过 cd 到达的目录**（终端 cd 跟随、`cd 到此目录` 按钮、点历史条目），**手动浏览不记录**；持久保存到 `cd-history.json`（按目标 key 分组），随「清理数据」可清除（见 §4）。
    - **连接凭据**：以当前 ssh 目标（由本应用发起的连接传入，如 `user@host` / 别名）为键 → 命中 `~/.ssh/config`（SSH 管理）记录时按记录的 `HostName`/`Port`/`User`/`IdentityFile` 连接（命令行给了同名用户时优先用命令行用户）；无记录时用命令里的用户名（缺省用本机用户名）+ 默认私钥 `~/.ssh/id_ed25519`。命中记录带 **ProxyJump 时 ssh2 不支持、连接失败并在状态栏提示**。SSH 私钥优先，其次 ssh-agent。
    - **状态机**：**收到 SSH 目标通知即自动建立 SFTP 连接**（面板仍保持隐藏，状态栏显示「正在连接」）—— 这样终端里的 **cd 跟随在面板未展开时也生效**；点文件按钮展开面板（已连接则直接显示）；**再次点按钮只隐藏面板、保留连接**；切换连接（目标变化）→ **销毁该 SFTP 连接**（面板随之收起）；连接失败（认证 / 超时 / ProxyJump / 无法启动子系统）只在状态栏提示。**ssh 会话断开时自动断开文件管理**（收到 ssh 退出标记 → 清空目标 → 销毁该 SFTP 会话并收起面板，见 §3.9-4）。窗口销毁时该窗口的连接一并关闭。
    - **下载 / 上传进度**：下载与上传（含拖拽多文件逐个）都在状态栏用**进度条**显示百分比（主进程经 `sftp:progress` 事件回传 `transferred/total`）。下载保存到设置的下载目录（默认 `~/Downloads`，重名自动加 ` (n)`，见 §5.1），成功后状态栏显示本地路径。
11. **独立文件窗口**（`file-window.html`，见 §8.6）：文件管理可**分离为单独窗口**——内嵌面板**路径行最左的「分离为独立窗口」按钮**或 **SSH 管理的 `folder` 图标**（自动连接该主机）打开；点分离按钮时会**关闭并销毁当前内嵌容器**（连同其 SFTP 连接）再开独立窗口，并把**当前所在目录一并带过去**（`file-window:open` 带 `path`，连上后进入该目录；SSH 管理 `folder` 图标无当前目录则从家目录开始）。窗口是**普通窗口**：`titleBarStyle: 'default'` + **系统原生红绿灯 / 标题栏**（不再自绘红绿灯），`alwaysOnTop` **默认关**（设置 `fileWindowAlwaysOnTop`，默认关），不再浮在全屏之上。**窗口固定浅色主题 + 纯白背景**（`--file-window-bg: #ffffff`，`data-theme-lock="light"`），**不跟随主界面的明暗主题 / 背景色**（菜单、下拉、状态栏、文件区均为白底浅色）。窗口**默认 / 最小尺寸均为 900 × 600**（`vessel.fileWindow`），不再自动把行列 / 高度对齐到整数倍。窗口顶部是一条**自动换行的 SSH 连接栏**（`#file-toolbar` > `#file-ssh-form`），从左到右平铺：**已保存主机下拉**（`~/.ssh/config`，分组显示，随 `ssh-config:changed` 实时刷新）、**用户名**、**地址 / IP**、**端口**（默认 22）、**认证方式分段控件「密码 / 密钥」**、**凭据输入**（密码与密钥**互斥、共用一个输入框**：密码模式下为密码框 + 眼睛按钮切换明文 / 密文；密钥模式下变为私钥路径输入 + 选择文件按钮，留空用默认私钥；切换模式时各自保留草稿）、**连接按钮**。从下拉选择主机时**自动把用户名 / 地址 / 端口 / 私钥覆盖到输入框并立即连接**；也可修改任意字段后按「连接」（或回车）手动连接。**连接按钮状态**：连接进行中一律禁用（按钮变灰、`not-allowed` 光标）；连接成功后**保持禁用**，直到用户修改任意一项（主机 / 用户名 / 地址 / 端口 / 认证方式 / 凭据）；连接失败后恢复可用。自动连接与手动连接遵循同一规则。**手动填写的密码只用于本次连接，不写设置 / 不落盘**。连接状态栏提示 `正在连接 SFTP：用户名@地址(:端口)…`，并同步写入控制台 / 当天日志（主进程另有 `[sftp] connecting <目标> -> <host>:<port> user=... auth=...` 明细）。**无终端**。**字号固定 14px、行高固定 32px**，**不再跟随终端设置中的任何设置**，也**不支持 `Cmd +/-` 缩放**。**连接与内嵌面板彼此独立**（各自一个 SFTP 会话，可各连不同 ssh），并**不随终端里的 ssh 关闭而关闭**。几何（屏幕 / 位置 / 尺寸）记入 `file-window.json`（单槽，同终端窗口的记忆方式）。
12. **悬浮球（失去焦点缩成圆形小窗）**：终端窗口**失去焦点后延迟 `terminalBallDelayMs`（默认 0.2s）**缩成一个 **`terminalBallSize`（默认 90px、宽高强制 1:1、10–2048px）的圆形、无标题栏窗口**，形如悬浮球：
    - **开关与延迟**：设置 → 终端「自动缩成悬浮球」（`settings.terminalBallEnabled`，默认开）、「缩成悬浮球延迟」（下拉：立即 / 50ms / 100ms / 200ms / 500ms / 1s / 5s / 10s / 15s / 30s / 60s，默认 **50ms**；「立即」= 0ms）、「悬浮球大小」（`settings.terminalBallSize`，默认 90px，1:1，范围 10–2048px）、「悬浮球图标」（`settings.terminalBallIcon`，选项为 `assets/icons/ball/` 下所有 SVG，默认 `ball-11.svg`，**实时生效**）、「终端暗色模式」（`settings.terminalBallDark`，默认**开** = **终端窗口整体（xterm 终端 + 悬浮球）始终暗色**；关 = **跟随全局主题**（亮 / 暗随 `data-theme`）；**悬浮球图标始终保留原色、不去色**）、**透明背景**（`settings.terminalBallTransparent`，默认**开**：悬浮球无底色 / 无边框，拖动时显示淡圆形背景；关 = 使用暗 / 亮纯色底）；实现：终端窗口在 `<html>` 置 `data-terminal-dark="on|auto"`（`terminal.js` 的 `applyTerminalDark`），开启时由 `constants.css` 把该窗口的主题变量整体覆盖为暗色（xterm / 头栏 / 文件面板一并变暗），悬浮球底色由 `tailwind.css` 依该属性决定；**延迟内焦点回来则取消缩球**（`blur` 起计时、`focus` 清除）。
    - **窗口形态**：终端窗口以 `frame: false` + `transparent: true` + `hasShadow: false` + **`roundedCorners: false`**（圆角由 CSS 画，避免系统把四角边框裁掉）+ **`acceptFirstMouse: true`** 创建（macOS：让悬浮球浮在其它应用 / 全屏应用之上时**第一次点击**就落到窗口内容，而不必先激活、点两次）；底座 `#term-shell` 负责底色 / 圆角 / 描边，悬浮球为 `#term-ball`（**固定 `--term-ball-size` 的圆形 + 设置的悬浮球图标**（`assets/icons/ball/*.svg`，默认 `ball-11.svg`））——球尺寸固定、**锚在窗口右上角**（`top:0; right:0`）。**图标尺寸随球大小自动缩放**：`图标 = 球直径 × clamp(min, 期望, min(max, 弹跳上限))`，其中 `期望 = --term-ball-icon-scale`（默认 **0.8**，可手动改；此时图标四周各留 10% padding，弹跳最高点仍在球内）、`min/max = 0.5 / 0.8`、`弹跳上限 = 1 - 2 × --ball-bounce-distance`（保证图标上移到最高点仍在圆内、不被裁切）；变量定义在 `styles/ball-animations.css` 的 `:root`，**改完保存即生效（无需重建）**。SVG 本身以 `display: block; width: 100%; height: 100%` 填满图标容器（容器尺寸 = 球直径 × 有效比例），避免 SVG 自带的外层透明留白额外占位。
    - **外观**：默认**透明背景**开启——悬浮球**无底色、无边框**，只显示图标；**拖动时**（`<html data-ball-drag="on">`）显示一层**淡淡的圆形背景**（浅色模式：黑色 18%；暗色模式：白色 22%，统一由 `--ball-drag-bg` 控制）。关闭透明背景时使用**不透明纯色底**（暗 / 亮由下方「终端暗色模式」决定）。**不做 `backdrop-filter` 毛玻璃 / 高光描边等玻璃特效**（省性能）。球由 CSS 画圆形、底座透明窗口只透出球体本身。
    - **切换 Space 不缩球（实时读取 WindowServer）**：终端窗口**创建时（页面加载前）/ 从球放大回来**时，`space-service` 优先调用 `src/main/scripts/space-bridge.py`（Python 标准库 `ctypes` → SkyLight 私有 API `CGSCopyManagedDisplaySpaces`）读取各显示器当前的 Space uuid，按 uuid 排序拼成签名并记在该窗口的 `__spaceId`；该接口直接向 WindowServer 取值，切换 Space 后**立即**反映新值（`defaults export com.apple.spaces` 经 cfprefsd 可能长时间仍是旧值，不可靠）。桥接失败时回退到 `defaults export com.apple.spaces - | plutil -convert json -o - -` 解析 `SpacesDisplayConfiguration.Management Data.Monitors[*]["Current Space"].uuid`（多显示器时任一屏切换 Space 都会让签名变化；并发读取共用一次子进程）。**获得焦点时不再重新记录**（切桌面时窗口可能被系统短暂带到新桌面并重新获得焦点，若此时覆盖记录，就会把「已切走」误判成「没切」→ 仍然缩球）。失去焦点延迟到期、**准备缩成悬浮球 / 隐藏**时（`shrinkTerminalToBall` → `maybeEnterBall`），先等待打开时的那次读取完成，再读取当前签名：**与记录不一致 = 用户切了 Space → 不缩球，保持终端窗口原样**；首次读到一致后还会**等待 `SPACE_CONFIRM_DELAY_MS`（150ms，`src/shared/constants.js`）再读一次确认**，两次都一致才缩球。**读取失败 / 超时 / 尚无记录时一律不缩球**（宁可保持窗口，也不误缩到切换后的桌面）。保持原样时写日志 `[terminal] keep window: space changed (<窗口 id>) from=<记录的原桌面 uuid> to=<当前桌面 uuid>`；读取不确定时写 `[terminal] keep window: space unknown (<窗口 id>) from=<记录值>`。切换 Space 引起的 blur 与点击其它应用引起的 blur 因此可区分。
    - **桌面事件日志**：终端窗口**打开**（`ready-to-show`，`open`）、**关闭 / 销毁**（`close`）、**缩成悬浮球**（`ball`）、**从悬浮球展开**（`expand`）时，均异步读取当前 Space 并写入当天日志（调试模式下同时输出到控制台）：`[terminal] <open|close|ball|expand> (<窗口 id>) space=<当前桌面签名>`；读取失败记 `space=unknown`。关闭流程中先读取再销毁，读取失败不影响关闭。
    - **空间归属**：球固定在它所在的桌面 / 空间，**切换桌面时不跟随**。桌面归属在窗口**获得焦点时**（那时窗口就在活动桌面上）用「先 `setVisibleOnAllWorkspaces(true)` 再 `(false, { visibleOnFullScreen: true, skipTransformProcessType: true })`」**明确绑定到本桌面**（只置 `false` 有时仍是「移到活动桌面」行为，切桌面时会被拉过去）；**进入球模式时不再动窗口的桌面 / 层级**（变球由失焦延迟触发，发生在用户已切到别的桌面之后，此时再设会把窗口重新分配到当前活动桌面 → 球跟着切换），窗口尺寸也只在动画尾改一次；放大回来时最后重申一次，便于经全局快捷键把窗口带到当前桌面。
    - **位置稳定**：球 = 原窗口**右上角**的 `size×size` 方块；若用户没拖动过球，放大时**原样恢复**原 bounds（多次「终端 ↔ 球」往返位置不变）；拖动过则以球位置为右上角展开回原尺寸（夹回工作区）。
    - **缩放动画（渲染层 CSS transform）**：窗口尺寸只在**动画首 / 尾各改一次**（`setBounds`，非逐帧）：收缩时窗口保持原尺寸，渲染层把 `#term-shell` 以 `transform-origin: top right` 从 `scale(1)` 过渡到 `scale(size/宽, size/高)`；放大时窗口先一次性还原，再把 shell 从球 scale 过渡到 `1`。由 GPU 合成，**右上角严格不动、不左右弹跳**（原生窗口动画做不到精确锚点）。`BALL_ANIM_MS = 420ms`，`scaleX/scaleY` 由主进程随事件下发。
    - **阶段（`terminal:ball` 的 `phase`）**：`enter` = 终端可见并按缩放过渡缩小（**不显示球**）；动画结束 `settle`（`active:true`）= 窗口一次性收到球大小、隐藏终端、显示球；`grow` = 窗口先一次性还原、终端按球 scale 显示再过渡放大；`settle`（`active:false`）= 恢复正常并重新 `fit` / 对齐。期间**不写几何记忆**（`saveTerminalGeometry` 遇球模式直接返回）。
    - **动画期间禁用整格对齐**：球模式下主进程的 `applyTerminalSnap` / `requestTerminalSnap` / `markTerminalResizing` 与渲染层的 `ResizeObserver` / `fitIfNeeded` 全部跳过 —— 否则「窗口宽高对齐到整行 / 整列」会与缩放动画抢尺寸。
    - **拖动**：渲染层指针事件（pointer capture）→ 主进程按光标位置持续 `setPosition`（16ms）；「按下到松开位移 ≤ 3px」判定为**点击**（聚焦后按住不放视为拖动，松开即展开）。
    - **放大回来**：点击球、或按**终端全局快捷键**（`toggleTerminalWindow`）→ `terminal:ball-restore` → 还原窗口并放大，动画结束恢复最小尺寸 / 可缩放 / 置顶、`win.focus()`。**不在窗口 `focus` 时自动放大**（避免拖动即触发）。
    - **最小化按钮禁用**：终端窗口头栏「最小化」红绿灯失效（灰显不可点）。
    - **运行活动提示（以持续输出判断）**：球模式下，终端**有输出**（`terminal:data`）时悬浮球**内的图标**做**正弦平滑弹跳**（球本身不动）：一个循环 `0% → 50%` 上移 `--ball-bounce-distance`（相对球尺寸的比例，默认 `0.065`；配合下面的图标缩放，图标会随幅度增大自动缩小以避免裁切，幅度超过约 `0.25` 时到达图标下限 0.5 仍可能裁切）→ `100%` 回到原位，时长 `--ball-bounce-duration`（默认 `1.3s`），缓动 `cubic-bezier(0.45, 0, 0.55, 1)`。图标用 `translate3d` + `will-change` + `backface-visibility` 提升为合成层、并在弹跳时把 `shape-rendering` 置回 `auto`，全程只做合成不重绘。动画定义在**独立样式文件 `src/renderer/styles/ball-animations.css`**（由 `terminal.html` 直接引入、不走 Tailwind 构建，改完无需重建）。该动画常驻但默认 `animation-play-state: paused`，有输出时切 `.term-ball-bounce` 恢复播放。**连续 5s 没有输出即视为程序已停止**（不再看 PTY 前台进程组 / SSH 连接状态，因此仅连上 SSH 不会启动计时）；停止时等当前循环走完（回到 `translateY(0)`）再暂停（`terminal.js` 按 `--ball-bounce-duration` 算到循环边界），**不会停在半空 / 顶部 / 底部**。
    - **累计活动时长（悬停显示）**：计时**按任务计算**——同一任务持续有输出时累计；连续 5s 无输出视为任务结束，**计时冻结并保留显示**（不自动增加）；之后再出现输出视为**新任务，累计值清零并重新计时**。打开终端 / 球与窗口切换不清零，终端会话重启时清零。**鼠标悬停在球上**（此时可拖动）时，球内**隐藏图标、显示本次会话的累计活动时长**（即使当前没有跳动也显示静态累计值），**分两行**：上行 `h` / `m`（**为 0 的那一项不显示**，如 5 分钟显示 `5m`、1 小时显示 `1h`、1h1m 显示 `1h1m`；**不补前导 0**），下行 `s`（**同样不补前导 0**：`5s` 而非 `05s`；字号更大，上行 `h`/`m` 字号为其一半）。若 `h`/`m` 均为 0 则只显示秒。显示由 `requestAnimationFrame` 刷新（跳动时逐帧增长，停止跳动后只保留静态累计值），**鼠标悬停用 `pointerenter`/`pointerleave` 的布尔标记判断**（不轮询 `:hover`，避免透明失焦窗口下 hover 抖动导致闪烁）。停止跳动只停止计时增长，**不清空累计值**；悬停时仍显示当前冻结值，直到新任务出现才归零重计。元素为 `#term-ball-timer`（内含 `#term-ball-timer-hm` / `#term-ball-timer-s`，`terminal.html`），由 `<html>` 上的 `data-ball-timer="on|off"` 控制显隐（`tailwind.css`）；文字颜色取主题前景色 `--color-fg`，字体族跟随终端字体设置（`--term-font-family`）；显示时带一层主题背景（`--color-surface` + `--color-border` 圆角底、轻微阴影），透明球模式下也能看清；`h`/`m` 行为空时用 `:empty` 折叠；右键垃圾桶状态下不显示。
    - **右键垃圾桶（销毁）**：在球上**右键** → 球上悬浮一个半透明**垃圾桶**图标；此时**再点一下球**（未拖动）即**销毁终端**（`terminal:destroy`）；拖动球会取消该状态。
    - **「固定」按钮（仅当前窗口，默认关）**：头栏红绿灯**右侧**新增固定按钮（`pin`/`pin-off` 图标，开时强调色）；开启后该窗口 `blur` 不再缩球（主进程 `win.__ballPin` 标记，**不持久**、仅作用于当前终端）。
    - **iTerm 交接 / 会话结束不缩球**：`TERMINAL_OPEN_ITERM`、`terminal:destroy`（exit）走 `destroyTerminalWindow`，会先置 `__suppressBall` 再销毁，直接关闭窗口而不是变球。
    - 多扇终端各自独立成球。

---

### 3.10 系统代理（`settings.followSystemProxy`，默认关闭）

1. **开关**：设置 → 应用 → 「遵循系统代理」，写入 `settings.json` 的 `followSystemProxy`（布尔，默认 `false`）。关闭时所有连接直连；开启后由主进程按 macOS 系统代理 / PAC 转发。
2. **解析**：通过 Electron `session.resolveProxy()` 读取系统代理 / PAC 的解析结果（含静态代理与 PAC 脚本）。支持 `SOCKS5`、`PROXY` / `HTTP` / `HTTPS` 与 `DIRECT`；`SOCKS4` / 未知类型按直连处理。结果按目标 `host:port` 缓存 **30s**；改动开关时清空缓存并预热一个通用结果。
3. **内置终端**：创建 PTY 时注入 `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` / `NO_PROXY`（大小写各一份），供 `curl` / `git` 等命令行工具使用。静态系统代理优先；只有 PAC 时使用启动 / 开关变化时预热得到的通用结果。已打开的会话不回溯修改，重启会话后生效。
4. **SSH**：
   - 系统代理为 SOCKS5 时，内置终端 / iTerm 的 `ssh` 命令追加 `-o ProxyCommand='/usr/bin/nc -X 5 -x <proxy-host:port> %h %p'`；`ssh2` 探测通过预连接的 SOCKS5 socket（`sock`）连接。
   - 系统代理是 HTTP / HTTPS 时 **SSH 直连**（不为 SSH 实现 HTTP CONNECT）。
   - `ProxyJump` 优先：同时配置时不叠加系统代理。
5. **SFTP**：与 `ssh2` 探测一致，仅 SOCKS5；失败时连接报错，不回退到无代理的静默重试。
6. **更新**：`updater-service` 的 Node `http(s)` 请求按系统代理走 **SOCKS5** 或 **HTTP CONNECT** 隧道；代理不可用 / 解析失败时回退直连（不阻断更新，错误写日志）。
7. **不支持**：代理认证（需要用户名密码的代理视为不可用）、SOCKS4；PAC 的按 URL 细粒度规则在终端环境变量里只能用通用结果近似（SSH / SFTP / 更新按具体目标解析，支持 PAC）。
8. **日志**：解析失败、隧道建立失败、SOCKS5 连不上时分别写 `[proxy]` / `[ssh]` / `[sftp]` 日志。
