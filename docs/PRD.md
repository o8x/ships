# Ships 产品需求文档（PRD）

| 项目 | 说明 |
| --- | --- |
| 产品名称 | Ships |
| 产品定位 | 面向开发者的 macOS 菜单栏（Tray）工具箱，点击托盘图标在下方展开轻量面板 |
| 技术栈 | Electron 44（主进程）+ Tailwind CSS 3（界面样式）+ 原生 JavaScript（渲染层，无打包器）+ ssh2（SSH 探测）+ electron-liquid-glass（macOS 26+ 原生 Liquid Glass，可选）+ @xterm/xterm 与 @xterm/addon-fit（设置页内嵌终端）+ python3（PTY 桥接脚本）+ 本地 geoip.json（IP 归属地） |
| 支持平台 | macOS（arm64 / x64；当前主要面向 arm64） |
| 当前版本 | 2.2.0 |
| 发布方式 | 本地/CI 通过 `electron-builder` 打包 macOS arm64 DMG（`pnpm dist:mac`）；暂未签名 / 公证 |

**核心设计**：应用常驻系统托盘、不占用 Dock；点击托盘图标在图标正下方弹出 400×500 的圆角面板，面板内以顶部 TAB 切换工具、底部显示版本与设置入口；所有输入实时反馈，无需点击“计算”按钮。

---

## 1.1 阅读与维护规则

- 本文件是 Ships 行为的**唯一事实来源**：先读本文件、再读代码，不凭猜测改代码。
- **改代码必须同步改文档**，不得只改其一；文档与实现不一致时**以代码为准**（先核对主进程 / 预加载 / 渲染层入口，再修文档）。
- 对外接口必须写清：**签名、可用范围、是否持久（刷新 / 重启是否丢失）、副作用条件与示例**。
- 版本号变更时，同步更新本文件内所有版本引用（含示例）。

### 变更类型 → 需同步章节

| 变更类型 | 需同步章节 |
| --- | --- |
| 新增 / 删除工具 | §4 主要功能清单、§11 GUI 与布局规范 |
| 修改现有工具的交互 / 控件 | §4 主要功能清单、§11 GUI 与布局规范 |
| 新增 / 修改 IPC 通道 | §5.2 IPC 通道三张表、§2.1 安全模型、对应流程 |
| 修改窗口行为 / 尺寸 | §2.1 进程模型、§4、§8 主界面布局、§11 GUI 与布局规范、`package.json` 的 `ships` 配置 |
| 修改设置项 | §3 核心流程、§5.1 本地数据、§4 功能清单 |
| 修改 SSH 相关行为 | §3 核心流程、§5.1 本地数据、§5.2、§6 流程图 |
| 修改样式常量 | §11 GUI 与布局规范、`src/renderer/styles/constants.css` |
| 新增 / 修改图标 | §8.3 图标与资源、`assets/icons/`（SVG）与 `assets/imgs/`（位图） |
| 修改 GeoIP / 国旗 | §2.1 项目结构、§5.2 `geo:lookup`、§8.3、`assets/geoip.json` / `assets/flags/` |
| 修改构建 / 脚本 / 依赖 / CI | §7 构建与发布、`package.json`、`pnpm-lock.yaml`、`.github/workflows/*.yml` |

---

## 2. 项目概述

- **产品定位**：一个常驻 macOS 菜单栏的开发者工具箱，把高频小工具与 SSH 管理收纳进一个托盘弹出的面板。
- **技术栈**：Electron 44；界面使用 Tailwind CSS 3 编译产物 + 原生 JS（`window.Ships*` 命名空间）；SSH 探测使用 `ssh2`；原生玻璃使用 `electron-liquid-glass`（N-API 原生插件，macOS 26+ 生效，旧系统 / 非 macOS 由主进程回退，见 §8.1）。
  - 说明：AGENTS 建议界面优先 Vue 3；当前实现选用**无打包器的原生 JS + Tailwind**，以减小体积、避免引入前端构建链，后续如需可平滑替换为 Vue 3。
- **支持平台**：macOS（Darwin）。代码通过 `process.platform` 判断，非 macOS 下托盘行为与登录项设置自动降级。
- **当前版本**：2.2.0。
- **发布方式**：通过 `electron-builder` 打包 macOS arm64 DMG，见 §7。

### 2.1 架构原理

**进程模型**

- **主进程**（`src/main/`）：创建托盘与窗口、读写本地数据、解析 `~/.ssh/config`、执行 iTerm 连接与 SSH 探测、注册 IPC。
- **预加载脚本**（`src/preload/`）：在 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: false` 下运行，用 `contextBridge` 暴露白名单 API（主面板用 `main-preload.js`，设置窗口用 `settings-preload.js`）。
- **渲染进程**（`src/renderer/`）：两个页面 —— 托盘主面板 `index.html` 与设置窗口 `settings.html`；不含 Node 能力，仅通过 `window.ships`（能力）、`window.shipsIcons`（内部 SVG 图标）与 `window.shipsFlags`（国旗 SVG）与主进程 / 预加载通信。
- **无 Webview**：不内嵌远程 Web，无 guest 进程。

**项目结构**

```
Ships/
├── package.json                 # 依赖、脚本、ships 系统配置段
├── tailwind.config.js           # Tailwind：颜色/圆角/阴影/字体均映射到 CSS 变量
├── AGENTS.md                    # 客户端设计与编码约定
├── README.md                    # 英文说明（应用图标 + 简短概述，默认语言）
├── README.zh-CN.md              # 中文说明（同内容，与 README.md 顶部互相切换）
├── docs/PRD.md                  # 本文件
├── assets/
│   ├── icons/                   # 应用内部使用的 SVG 图标（kebab-case，统一由预加载读取）
│   ├── imgs/                    # 位图资源：应用图标 / 托盘 / 打包
│   │   ├── trayTemplate.png     # 托盘模板图标（18/36/54 @1x/@2x/@3x）
│   │   ├── app.png              # 应用图标（512，README 引用）
│   │   └── icon.icns            # 打包用 macOS 图标
│   ├── flags/                   # 国旗图标（`<CC>.svg` 长方形 / `<CC>_1x1.svg` 方形）
│   └── geoip.json               # IP 归属地数据库（单行大文件，由 geo-service `require`）
├── .github/workflows/build-mac.yml  # CI：构建 macOS arm64 DMG
├── scripts/                     # 构建 / 工具脚本（不打包进产物）
│   ├── capture.cjs              # 开发用 UI 截图 / 操作脚本
│   ├── dist-mac.sh              # dist:mac 包装脚本：选择签名方式
│   ├── after-pack.cjs           # electron-builder afterPack：asar 加固 + fuses + ad-hoc 签名
│   ├── adhoc-sign.sh            # 未配置正式签名时对 .app 做 ad-hoc 签名
│   ├── notarize.cjs             # electron-builder afterSign：按需公证
│   └── gen-icons.mjs            # 零依赖 PNG / icns 图标生成脚本
└── src/
    ├── shared/constants.js      # 主进程与预加载共享：IPC 通道、窗口配置、默认设置
    ├── main/
    │   ├── main.js              # 应用入口：单实例、Dock 隐藏、注册 IPC、创建托盘
    │   ├── tray.js              # 托盘图标与右键菜单
    │   ├── window-manager.js    # 主面板 / 设置窗口 / 置顶终端窗口的创建、定位、几何记忆、显隐、广播
    │   ├── ipc/                 # IPC 处理器（app / settings / window / ssh / geo / clipboard / hash / net-test / terminal）
    │   ├── scripts/             # pty-bridge.py（PTY 桥接，交互终端用；打包时经 build.asarUnpack 解包到 app.asar.unpacked）
    │   ├── services/            # settings / ssh-config / ssh / ssh-browse / iterm / terminal / hotkey / geo / clipboard / hash 服务
    │   └── utils/               # logger / json-store / paths / ls-listing（远端 `ls -l` 解析）/ utf8（UTF-8 保真解码 + 非法字节转义）/ net-test（网络测试命令与校验）/ window-geometry（终端窗口几何记忆的纯计算）
    ├── preload/                 # main-preload.js / settings-preload.js / icons.js（assets/icons/*.svg）/ flags.js（assets/flags/*.svg）
    └── renderer/
        ├── index.html           # 托盘主面板
        ├── settings.html        # 设置窗口
        ├── scripts/             # theme / i18n / ui / registry / tool-order / app / settings
        │   ├── tools/           # 每个工具一个文件，注册进 ShipsToolRegistry
        │   └── settings/        # 设置分区，注册进 ShipsSettingsRegistry
        └── styles/              # constants.css（设计变量）+ tailwind.css（入口）
```

**安全模型**

- 渲染层隔离：`contextIsolation: true`、`nodeIntegration: false`；能力仅经 `contextBridge` 白名单暴露。
- 来源校验：主进程处理 SSH 连接 / 探测时**不信任渲染层传入的主机字段**，仅以 `alias` 在 `~/.ssh/config` 中查表后使用配置值（见 `ssh-ipc.js`）。
- 打开外链仅允许 `http(s)` 协议（`app:open-external`）。
- 数据落盘：设置与探测结果均为**非机密 JSON**，位于用户数据目录；`~/.ssh/config` 仅由用户本机维护。
- 日志：详细日志仅在调试模式（`SHIPS_DEBUG=1` 或 `--debug`）输出；启动时始终打印数据文件清单与绝对路径。
- 登录项：仅在值发生变化时调用 `app.setLoginItemSettings`，避免无意义报错。

**来源标识注入 / 常驻与托盘**

- 不涉及来源标识注入（无 Webview）。
- 常驻托盘：`app.dock.hide()`（由 `ships.showDockIcon` 控制）后仅保留 Tray；`window-all-closed` 不退出应用；主面板关闭（隐藏）不影响进程。

---

## 3. 核心流程

### 3.1 启动

1. 请求单实例锁；已存在实例时聚焦主面板并退出新实例。
2. `app.whenReady()` 后：按需隐藏 Dock → 注册全部 IPC → 创建主面板（`show:false`）→ 创建托盘。
3. 打印版本、平台与数据文件清单。
4. 不显示任何窗口，仅托盘图标可见。

### 3.2 面板显示 / 隐藏（点击托盘）

1. 点击托盘图标 → 记录托盘 `getBounds()`。
2. 计算 `x = 托盘中心 - 面板宽/2`，`y = 托盘底部 + gapBelowTray`（`package.json` 的 `ships.window.gapBelowTray`，当前 **2px**，使面板紧贴菜单栏），并按所在显示器工作区夹取。
3. 显示并聚焦主面板。
4. 再次点击、或面板失焦（点击别处）时隐藏；`Escape` 亦隐藏。
5. 打开设置窗口会使主面板失焦并隐藏（与设置互斥）。
6. **固定悬浮**（底部栏图钉，对应 `settings.pinWindow`）：开启后失焦不再隐藏、保持置顶，并允许通过顶部左侧「应用图标 + 名称」拖动窗口，位置在多次显示间保留；再次点击取消时会立即隐藏，且下次显示重新回到托盘下方默认位置（未固定时窗口不可移动，始终吸附托盘）。

### 3.3 打开设置

1. 点击主面板右下角设置按钮，或托盘右键菜单“打开设置”。
2. 主进程先隐藏主面板，再创建/聚焦设置窗口（`titleBarStyle: hiddenInset`，普通可缩放窗口）。

### 3.4 SSH 连接

1. 工具列表点击某主机的连接图标 → `ssh:connect`（仅传 `alias`）。
2. 主进程按 alias 查询 `~/.ssh/config`，拼装命令：`ssh [-p 端口] [-i 私钥] [-J 跳板机] [user@]host`（端口为 22 时省略 `-p`）；当私钥为默认的 `~/.ssh/id_ed25519` 或 `~/.ssh/id_rsa`（含展开后的绝对路径）时**省略 `-i`**（ssh 会自动使用默认密钥）。
3. 命令交给**置顶终端窗口**（§3.9）执行：窗口未打开则先打开，然后把 `ssh …` 注入其 shell（不再调用 iTerm，因此不会切换桌面 / 空间）。**设置 → 终端** 里的「SSH 使用内置终端连接」关掉后，退回原来的 iTerm 方式。
4. 成功 / 失败在主面板顶部临时提示。

### 3.5 SSH 操作系统探测

1. 入口：设置 → SSH 管理 表单内的「探测系统」按钮（`ssh:detect-host`，可对**尚未保存**的主机探测）；主面板列表不再提供探测按钮。
2. 使用 `ssh2` 连接：代理 socket 先取 `SSH_AUTH_SOCK`，无则回退 `launchctl getenv SSH_AUTH_SOCK`（GUI 从 Finder 启动时不继承 shell 环境）；有 `IdentityFile` 时读取私钥。执行 `uname -s; echo '|||'; cat /etc/os-release`；识别不到时回退 `cmd /c ver`。
3. 归类到具体系统 / 发行版：Linux 读取 `/etc/os-release` 的 `ID`（如 `ubuntu` / `fedora` / `arch` / `centos` / `debian` / `rhel` / `alpine` …），macOS 为 `macos`，BSD 为 `freebsd` / `openbsd` 等，Windows 为 `windows`；同时给出 `family`（`macos`/`linux`/`windows`/`bsd`/`unknown`）与显示名 `label`。
4. 结果（`{ os, family, label, at }`）写入 `ssh-detected.json` 并广播 `ssh:detected` 事件；渲染层据此更新左侧彩色系统图标与提示。
5. 表单内探测期间按钮显示「探测中…」且禁用；**探测成功后**才启用「保存」。
6. **日志**：探测的每一步（开始、目标、认证方式、执行命令、stdout/stderr、解析结果、连接报错）都会追加写入 `ships.log`（设置 → 开发者 → 日志文件可打开）；便于排查本地网络 / 权限问题。
7. **macOS 本地网络权限**：Info.plist 含 `NSLocalNetworkUsageDescription`。macOS 15+ 首次访问局域网（如 192.168.x / 10.x）时会弹「本地网络」授权，需允许 Ships，否则连接会被系统拦截（表现即“没有本地 SSH 探测权限”）；可在「系统设置 → 隐私与安全性 → 本地网络」中开启。

### 3.6 修改设置

1. 设置窗口任一控件变更 → `settings:set`（增量 patch）。
2. 主进程合并写入 `settings.json`，必要时应用登录项，并广播 `settings:changed`。
3. 主面板与设置窗口同步应用主题 / 强调色 / 语言；主题为“跟随系统”时监听 `nativeTheme` 的 `updated` 事件（广播 `theme:changed`）。
4. 副作用：`pinWindow` → `applyPin`；`vibrancy` → `applyVibrancy`（销毁并按新配置重建主面板，使原生 `vibrancy` 与 `roundedCorners` 同时生效），主面板同时更新 `<html data-vibrancy="on|off">`；`theme` → `nativeTheme.themeSource`（使原生材质与应用主题一致）；`terminalWindowWidth` / `terminalWindowHeight` → 已打开的终端窗口立即 `setSize`；`terminalAlwaysOnTop` → 终端窗口层级；`terminalHotkey` → `hotkey-service` 重新注册全局快捷键（先注销旧值，注册失败只记日志、不改设置，见 §3.9-8）。

---

### 3.7 SSH 目录浏览（仅主面板）

1. **入口**：主面板「SSH 管理」每行的 `folder` 图标（`ssh:list-dir` 不传 `path`）；设置窗口无此入口。顶栏在「返回主机列表」「上一级」右侧另有 `/root`、`/tmp` 两个**图标按钮**（无文字，悬浮提示「进入 <path>」）：`/root` 用小房子 `home.svg`、`/tmp` 用「带时钟的文件」`temp-file.svg`；列表来自 `src/renderer/scripts/constants.js` 的 `SSH_QUICK_PATHS`（`[{ path, icon }, …]`，按顺序渲染，可增删改），点击直接进入该目录。
2. **起始目录**：主进程读取 `ssh-browse.json` 中该主机的「上次打开的目录」，列出它的**父目录**（父目录列表中该目录**整行高亮**：强调色淡底 + 淡描边，文件名加粗并带「上次」标签）；无记录时列出 `~`。
3. **列目录**：复用或新建该主机的 ssh2 连接，执行 `sh -c 'cd <dir> 2>/dev/null || exit 3; pwd -P || exit 4; LC_ALL= LC_TIME=C ls -l --quoting-style=literal 2>/dev/null || LC_ALL= LC_TIME=C ls -l || exit 5'`（外层用 `sh -c` 包一层，远端登录 shell 是 fish / csh 等非 POSIX shell 也不会失败；`--quoting-style=literal` 是 GNU 选项，BSD/macOS 上自动回退普通 `ls -l`，避免文件名被 shell 转义）；`pwd -P` 给出绝对路径，`ls -l` 解析为 `{ name, type: dir|file|link|other, size, target? }`。**排序 = 远端 `ls` 顺序 + 文件夹优先**：先按远端 `ls` 的输出顺序排列，再做一次**稳定分区**（`ls-listing.js` 的 `dirsFirst`）把目录整体提到最前面，组内顺序与 `ls` 完全一致、不按名称重排（日期字段固定为 C 语言以便解析，组内顺序仍由远端 locale 决定——远端 session 无 locale 时即 C 字节序，如 `Makefile` 在 `app` 之前；有 `en_US.UTF-8` 等 locale 时按该 locale 排序，如 `app` 在 `Dockerfile` 之前）；**`.` / `..` 与空白名一律忽略**（不显示、不计数）；**以 `.` 开头的隐藏项不列出**（`ls -l` 不含 `-A`）；单个目录最多 2000 条（按 `ls` 顺序截断），超出置 `truncated` 并提示「目录过大，仅显示部分内容」。**输出按 UTF-8 保真解码**（`src/main/utils/utf8.js` 的 `decodeUtf8WithEscapes`）：合法 UTF-8 原样保留，无法解码的字节、C0/C1 控制字符与 DEL 显示为 `\xNN`（换行 / 制表符保留，它们是输出的结构），因此坏字节呈现为 `oU\xd9\xfa\x7f` 而不再是 `�`；代价是这类名字无法原样回传（SSH 命令通道是字符串），进入这种目录会失败并以红闪提示。
4. **导航**：双击目录行 / **单击目录前的三角** / 点 `/root`、`/tmp` 快捷按钮 / 在路径栏回车 → 进入该目录并列下一级（`remember: true`，把该目录记为该主机的「上次打开的目录」）；顶栏「上一级」按父目录上跳（**不修改记录**）；「返回主机列表」回到主机列表；已处于 `/` 时「上一级」禁用。**路径栏可编辑**：输入后回车进入 —— 绝对路径 / `~` 原样提交，其它按「相对当前目录」解析（当前 `/tmp` 时输入 `www` → `/tmp/www`）；成功时输入框规范化为服务端返回的绝对路径，失败（目录不存在 / 无权限 / 连不上）**不进入**：**不显示任何文案、不改变布局**，保留原列表与已输入内容，只让路径框按 `ships-blink-error` **红闪 3 次**（0.24s × 3；边框 + 底色变红后自动恢复，动画结束即移除 `.blink-error`）；只有**首次加载就没有任何目录可显示**时，才在提示行显示 `无法打开目录：… · <输入的路径>`；`Esc` 或失焦恢复当前目录。
5. **打开终端并进入该目录**：**目录**条目悬浮时右侧出现 `terminal` 图标 → `ssh:open-dir` → 记录该目录，并执行 `ssh [-p 端口] [-i 私钥] [-J 跳板机] -t [user@]host 'cd <dir>; exec ${SHELL:-/bin/sh} -l'`（**选项 → 目标主机 → 远端命令**的顺序；登录 shell 直接落在该目录，等价于连上后手打 `cd <dir>`；`cd` 失败也仍会进入登录 shell）。命令由 `ssh-service.buildOpenAtCommand()` 拼装，**执行位置与 §3.4 的 SSH 连接同一个开关**：`settings.sshBuiltinTerminal` 为真（默认）时注入**置顶终端窗口**（窗口未打开则先打开），关掉才开 iTerm 新窗口。条目**单击无任何效果**；**文件没有任何操作**（不出现悬浮图标、双击也不响应），只显示名称与体积。条目图标按类型取：目录 `folder.svg`；文件按 `src/renderer/scripts/constants.js` 的 `FILE_TYPE_ICONS`（扩展名）/ `FILE_NAME_ICONS`（无扩展名的文件名，如 Makefile）映射到 code / braces / terminal / doc / image / play / archive，未命中用 `file.svg`。
6. **连接复用**：每台主机缓存一条 ssh2 连接（`keepaliveInterval = 15000ms`），空闲 **2 分钟**关闭；命令超时 20s，执行失败时丢弃连接并用新连接**重试一次**；应用退出（`before-quit`）时全部关闭。
7. **失败提示**：连接失败 / 无权限 / 目录不存在等在主面板内红字提示（`无法打开目录：…`），并写入 `ships.log`。

---

### 3.8 网络测试（设置窗口）

1. **入口**：设置 → 网络测试（导航分区 `network`）；主面板底部栏的「网络测试」图标（`wifi`）会打开设置并直接定位到该分区（`window:open-settings` 携带 `section`）。
2. **执行位置**：自绘下拉选择 **本地** 或 `~/.ssh/config` 里的任一主机；选主机时整条命令包一层 `ssh … '<命令>'`，即在**该主机上**执行同一份命令（跳板机语义）。凭据沿用主机配置（端口 / 私钥 / ProxyJump）与 ssh-agent（`SSH_AUTH_SOCK` 优先取环境变量，回退 `launchctl getenv SSH_AUTH_SOCK`）；一次性执行、不分配 TTY。
3. **类型与端口**：**单行 TAB 式分段控件**（`ShipsUI.segmented` + `.segment-compact`，7 段）选择 **TCP / UDP / HTTP / ICMP / ARP / 扫描应用 / 扫描主机**（标签短，完整含义与命令见悬浮提示；列表在 `src/renderer/scripts/constants.js` 的 `NET_TEST_PROTOCOLS`，需与主进程 `src/main/utils/net-test.js` 的 `PROTOCOLS` 一致）。**ICMP / ARP / 扫描主机不使用端口**（端口禁用）；**扫描应用的端口可留空**（留空 = 扫该目标常用端口，填了 = 精确扫该端口）；端口默认 **80**、只接受 1–65535。目标支持 **IPv4 或网段**；**扫描主机必须填网段**（前缀 16–30，超出提示「网段前缀需在 16–30 之间」）。
4. **执行**：点「测试」→ `net-test:command`（`{ id, protocol, target, port, host? }`，`id` 是本节的终端会话）。主进程先校验（IPv4 / 网段 / 端口 / 协议白名单 / 主机别名，非法直接拒绝、绝不拼接未校验内容），先用 `Ctrl-U` 清空终端当前输入行并回车换行（避免覆盖上一条命令未换行的输出），再把命令**送进终端里正在运行的 shell**（等价于手敲：回显、Ctrl-C、管道、重定向都走真实终端）：
   - TCP → `nc -vz -w 3 <ip> <port>`；UDP → `nc -uzv -w 3 <ip> <port>`
   - HTTP(S) → `curl -Ikm8 http(s)://<ip>:<port>/`（443 用 https）
   - ICMP → `ping -c 4 <ip>`；ARP → `arp -n <ip>`
   - 扫描主机 → `nmap -sn <网段>`；扫描应用 → `nmap -sT [-p <port>] <目标>`（connect 扫描，无需 root）
   执行位置选了 SSH 主机时，整条命令包一层 `ssh … '<命令>'`（在那台机器上跑同一份命令）。「停止」= 向终端发送 `Ctrl-C`。
5. **交互终端**：xterm.js + **真实 PTY**。PTY 由 `src/main/scripts/pty-bridge.py`（Python 标准库 `pty`）创建，运行**用户默认登录 shell**（`$SHELL`，回退 `os.userInfo().shell`，最后 `/bin/sh`）：可直接敲命令、`clear` / `Ctrl-L` 清屏、`Ctrl-C` 中断、`cd` / 管道 / 重定向，以及需要终端的交互式工具（`vim`、`sudo` 密码提示等）。键盘输入经 `terminal:input` 写入 PTY，输出经 `terminal:data` 原样回传（含 ANSI），`TERM=xterm-256color`；终端尺寸随面板自适应（`FitAddon`），并在变化时通过 `terminal:resize` → `TIOCSWINSZ` 同步给 PTY。会话由 `terminal-service` 统一管理（带 id，可同时存在多个：设置页一个、置顶终端窗口一个）。需要系统提供 `python3`：打包后脚本位于 `Contents/Resources/app.asar.unpacked/src/main/scripts/pty-bridge.py`（`build.asarUnpack` 含 `src/main/scripts/*`，因为 `app.asar` 内的脚本无法执行），`terminal-service` 会把 `app.asar` 路径改写为 `app.asar.unpacked`；解释器依次探测 `/usr/bin/python3`、`/opt/homebrew/bin/python3`、`/usr/local/bin/python3`（可用 `SHIPS_PYTHON` 覆盖），都找不到时用 PATH 里的 `python3`，脚本缺失则在终端里报错。
6. **会话生命周期**：进入分区自动启动会话；shell 退出（如输入 `exit`）后终端提示「会话已结束」，此时敲任意键或点「测试」会重新启动；离开分区、关闭窗口、退出应用都会结束会话（`terminal:kill`；主进程 `before-quit` 调 `killAll()` 兜底）。

------

### 3.9 置顶终端窗口（Steam 式悬浮）

1. **入口**：主面板底部栏最左侧的**终端图标**（`terminal`），或由 **SSH 连接**（§3.4）自动拉起。
2. **窗口**：默认 **1024 × 768**（`ships.terminalWindow.width/height`，**可在 设置 → 终端 → 窗口大小 调整**，见 §5.1；`terminalWindowWidth` / `terminalWindowHeight`），可缩放、最小 `ships.terminalWindow.minWidth × minHeight` = 480×320；改设置立即 `setSize`，手动拖动窗口（非最大化 / 全屏）防抖 400ms 写回设置。`titleBarStyle: hiddenInset`，但**系统红绿灯由主进程 `setWindowButtonVisibility(false)` 隐藏**，头栏左侧改为**自绘小红绿灯**；终端内容**四边不留边距**（`--term-padding-y: 0`，终端铺满整个窗口 —— `vim` 之类的全屏程序四周不会出现白边）；窗口可自由拉伸，**拖动过程中不干预**（下边框严格跟手、绝不中途改尺寸），松手后按实测余量把窗口对齐到整格（见下条）。
   - **头栏（`#term-header`，默认 22px）**：左侧自绘小红绿灯（9px 圆点 ×3，**左边距 12px** = 第一个圆点到窗口左边缘的距离；悬浮符号 `×` / `−` / `⤢`，颜色取 `--traffic-*`；悬浮任意一个时三个都显示符号，窗口失焦时整体变灰并隐藏符号 —— 与系统观感一致），点击分别调 `window:control` 的 `close` / `minimize` / `zoom`（只作用于发起窗口）；**不显示标题文字**，右侧图标区（**SSH 主机下拉** + **置顶开关** `pin` / `pin-off`、**在 iTerm 中打开并关闭此窗口**、**导出终端文本**，距右边缘 12px）。头部不挂 `data-tip` 悬浮提示，为拖拽区（红绿灯与图标区为 `no-drag`）。
   - **头栏尺寸随终端字号缩放**：字号取 CSS 变量 `--term-header-font-size`（`styles/constants.css` 定义、`terminal.js` 的 `applyFontSize()` 在改设置 / `Cmd +`/`Cmd -`/`Cmd 0` 缩放时写入）；头栏高 `max(22px, 字号 + 6px)`、图标按钮 `字号 + 6px`（符号 `字号`）、SSH 下拉宽 **180px** / 字号 `字号` / 高 `max(18px, 字号 + 6px)` 且在头栏内**上下居中**。默认 12px → 头栏 22px、按钮 18px、下拉 180×18px；24px → 30px / 30px / 180×30px。下拉菜单（挂在 `body` 上）同宽 180px、**条目高度与下拉本体一致**且**条目之间留 2px**，字号同样跟随。
   - **头部 SSH 下拉**（图标区最左）：列出 `~/.ssh/config` 里的主机，条目文本为 `用户名@主机地址`（无 `User` 时只显示主机地址），首项为占位「SSH」；选中任意主机 → `ssh:connect`（带 `inTerminal: true`）→ 由主进程用 `ssh-service.buildCommand()` 拼 `ssh [-p 端口] [-i 私钥] [-J 跳板机] [user@]host` 并**注入当前终端会话**（等价于在这个终端里手敲 `ssh …`，不新建会话、不重建窗口、不弹 iTerm —— 因此也不受「SSH 使用内置终端连接」开关影响）；**同一台主机可以重复选**（每次选择都重新执行，便于断开后重连）。下拉**禁用**并降低不透明度当 `~/.ssh/config` 里没有主机；主机列表在窗口启动与 `settings:changed` 广播时重新读取。控件用 `select-compact`，默认 **180 × 18px**，与头部 18×18 图标按钮同一观感。
   - **屏幕 / 位置 / 尺寸记忆**（`terminal-window.json`，单槽）：打开、移动、缩放、关闭时把「所在屏幕 + 位置 + 尺寸」写入 `terminal-window.json`（关闭前同步落盘，拖动后立刻关窗也不会丢；写盘读窗口**此刻**的真实几何，程序化改尺寸不会被旧快照覆盖）。下次打开时：**该屏幕还在**（`id` + `scaleFactor` + `bounds` 全一致）→ 应用记忆的位置与尺寸（越界部分夹回该屏幕工作区，整窗可见）；**换屏 / 拔掉外接屏 / 分辨率或排列变了 / 无记录** → 用设置里的默认尺寸在当前屏幕（鼠标所在屏幕）工作区内居中。屏幕签名一致才复用，是因为分辨率 / 排列变化后记忆里的绝对坐标不再是同一块屏幕上的同一位置。
3. **置顶与全屏**：默认置顶（`ships.terminalWindow.alwaysOnTop` / `settings.terminalAlwaysOnTop`，缺省为开；`alwaysOnTop` 且 `setAlwaysOnTop(true, 'screen-saver')`）。头部图钉按钮可**取消置顶**：写回 `terminalAlwaysOnTop=false`，只降窗口层级，全屏辅助与「不跟随桌面切换」的行为不变，再点一下恢复（`terminal:set-top`，见 §5.2）。**该开关只作用于终端窗口，不影响主面板**（面板恒定置顶，见 §8.1）。空格行为是 `setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true, skipTransformProcessType: true })` = `NSWindowCollectionBehaviorDefault | FullScreenAuxiliary` —— **带全屏辅助、但不加入所有桌面**：可以浮在（当前桌面里的）全屏应用之上，同时**不会跟随桌面切换**，始终留在打开它的那个桌面；再次从托盘打开时用「先 true 再 false」把窗口拉到当前桌面。三处调用都带 `skipTransformProcessType: true`（应用已是 `LSUIElement` 菜单栏 Agent，无需进程类型转换，转换会短暂隐藏窗口 / Dock 并改变激活行为）。iTerm 会强制切桌面，所以 SSH 连接改走这里。
4. **终端**：与 §3.8 同一套 xterm.js + `pty-bridge.py` 真实 PTY，运行 shell（取设置 → 终端的**默认 shell**，`terminalShell`；留空或文件不存在时回退 `$SHELL` / `os.userInfo().shell`）；**滚动缓冲与字号取设置**（`terminalScrollback` / `terminalFontSize`，默认 10000 行 / 12px；`app:info.terminalScrollback` 仅作为配置缺失时的兜底）；窗口尺寸变化会同步 PTY 尺寸，关闭窗口即结束会话。
   - **不显示滚动条**：两处都关掉 —— ① 原生滚动条：`.xterm-viewport` 用 `scrollbar-width: none` / `::-webkit-scrollbar { display: none }`（`xterm.css` 先于本应用样式加载，保证规则生效）；② **xterm 自绘的滚动条**：`.xterm .xterm-scrollable-element > .scrollbar { display: none !important }`（xterm 6 只是用该元素做视觉指示，缓冲区滚动由它自己处理，隐藏后滚轮 / 触控板照常滚动）。主题里同时给出 macOS 风格的滑块色（`scrollbarSliderBackground/Hover/Active`）作为兜底，万一再出现滚动条也是圆角半透明样式。
   - **防跳变**：只在容器尺寸真的变化时 `fit()`，且只在 `cols`/`rows` 变化时才 `terminal:resize` —— 多余的 PTY resize 会让 shell 重绘，看起来像滚动时视图跳。
   - **会话结束即关窗**：在终端里 `exit`（或 `Ctrl-D`）结束 shell 后，主进程发出 `terminal:exit`，渲染层先把 `sessionId` 清空（免得 `beforeunload` 再去 kill 一个已消失的会话）再直接 `window.close()` —— **窗口自动关闭，不再显示「会话已结束」之类的提示**。只有会话**启动失败**（`type: 'error'`，例如 PTY 桥接脚本缺失 / 无法启动）才保留窗口，并把原因用红字写在终端里，便于排查。
   - **尺寸测量**：xterm 挂在**无内边距**的 `#term-fit`（`h-full w-full`）里，留白由外层 `#term-host`（四边 0）提供 —— `FitAddon` 按「父元素的 border box 高度」算行数，若父元素自带内边距会把可用高度多算一份内边距（默认窗口下多算 19.5px ≈ 1 行），于是最后一行被裁掉大半行、页面还多出几像素可滚动高度（滚轮时标题跟着上下动）；父元素无内边距时测量值即真实可用区。`#term-host` 与页面根容器另加 `overflow: hidden` 兜底：即使残留绝对定位元素（如 xterm 的 `xterm-helper-textarea`）越界，也不会让页面可滚动。
   - **字号缩放**：按 `Cmd + =` / `Cmd + -` 只改终端字号（8–24px，初始值取设置里的字体大小），标题栏与图标不缩放（实现见 §5.3）；`Cmd + 0` 复位到设置值。**在 设置 → 终端 改字体大小会即时生效**：终端窗口也在 `settings:changed` 广播名单里（`window-manager.broadcast`），只有设置值本身变化时才覆盖当前字号，临时缩放不会被别的设置变更顶掉。
   - **无留白与整格对齐**：终端主体 `#term-host` `padding: var(--term-padding-y) 0` = **0**（四边都不留白；`#term-fit` 仍是无内边距的那层，保证 `FitAddon` 量到真实可用区）。窗口尺寸保持在「行高 / 列宽的整数倍 + chrome」：
     - **列数自己算**：`FitAddon` 只要 `scrollback > 0` 就固定预留 14px（给 overview ruler），会让终端比窗口窄、右侧空出一条白边（我们本来就隐藏滚动条）。`fitIfNeeded()` 里 `fit.fit()` 之后按实测单元格宽度重新 `term.resize(cols, rows)`，列数铺满可用宽度。
     - **拖动期间一律不改窗口尺寸**：不用 `will-resize` 拦截、也不 `setBounds`（中途改帧会打乱 macOS 的增量拖拽跟踪 → 越拖越小 / 反复跳变）。`will-resize` 只用来标记「正在拖动」并广播 `terminal:drag-active`；渲染层收到后**不再发对齐请求**（请求即使到了主进程也只会被挂起），下边框严格跟手。
     - **松手信号**：拖动中渲染层收不到鼠标事件，因此「鼠标重新出现在终端内容区」（`mousemove`）即视为松手 → 重新 `fit()` + 对齐；同时拖动空闲 380ms 后主进程会发 `terminal:recalibrate` 兜底。挂起的旧请求一律作废，绝不套用过期的数值。
     - **对齐用实测余量**：渲染层按 `可用高度 − 行数 × 行高` / `可用宽度 − 列数 × 列宽` 请求收掉差额（`terminal:snap-size`，余量 < 1px 不动；主进程还有 60px 的安全上限，偏差过大宁可不做）。首次打开、改字号、设置里改窗口大小同样走这条路径。真实拖动实测：93 次鼠标驱动的尺寸变化中 **0 次**中途改尺寸，松手后各 1 次 2~11px 的对齐。
     - **拖动 / 缩放期间**头栏中间显示 `列 × 行`（`#term-size`，等宽小字、`pointer-events: none`），停手 700ms 后自动隐藏。

5. **导出**：头部导出图标把 xterm 缓冲区文本（含回滚）写入本地文件 —— 系统保存对话框，默认文件名 `ships-terminal-<时间戳>.txt`，成功后在终端里回显路径。
6. **iTerm 交接**：头部终端图标调用 `iterm-service.openCommand()` 在 iTerm 中重放**最后一次由外部注入的命令**（例如 SSH 连接 / 网络测试命令；没有则开一个登录 shell），成功后关闭当前终端窗口。
7. **SSH 连接与目录浏览都改走这里**：`ssh:connect`（§3.4）与 `ssh:open-dir`（§3.7）默认都不打开 iTerm，而是打开/聚焦该终端窗口并把 `ssh …` 命令注入其中，失败时才提示错误；两者都受 设置 → 终端 →「SSH 使用内置终端连接」（`settings.sshBuiltinTerminal`）控制，关掉后各自退回 iTerm（头部 SSH 下拉传 `inTerminal: true`，明确要求在**当前终端**执行，不受该开关影响，见第 2 条）。
8. **全局快捷键**：设置 → 终端 →「打开终端的全局快捷键」（`settings.terminalHotkey`，默认 `CommandOrControl+Shift+Z`，来自 `ships.terminalWindow.hotkey`）用 `globalShortcut` 注册：任意界面按下即打开/聚焦本窗口（等价于点托盘底部栏的终端图标）。改绑 / 重置 / 取消时先注销旧值再注册新值；**注册失败（被其它 App 占用、格式非法）不写入设置**，设置界面红字提示并把原值留在设置里；空字符串 = 不注册（界面显示「未设置」）。应用退出（`before-quit`）时 `unregisterAll()`。

---

## 4. 主要功能清单


| 功能 | 说明 | 默认值 / 条件 |
| --- | --- | --- |
| 时间戳转换 | 秒 / 毫秒 / 纳秒与日期互转；顶部实时当前时间，纳秒用 `performance.timeOrigin + performance.now()` 高精度计算（约 50ms 刷新，非固定 `000000`）；时间戳单位**自动识别**（≤11 位为秒、≤15 位为毫秒、否则纳秒），无单位选择框；**时间戳 → 日期**与**日期 → 时间戳**的输入框**同一行右侧**各有一个**偏移输入框**（普通文本输入，无下拉预设，见 §11），可输入 `-30m` / `+2h` / `90`（纯数字按秒；单位 `s`/`m`/`h`/`d`/`w`/`mo`，月按 30 天），带符号表示「前（-） / 后（+）」，输出结果叠加该偏移，**默认值为 `+0s`（时间不变）**，清空时同样按无偏移计算；偏移文本非法时输入框描红（`.invalid`）且按无偏移计算；**底部「时间戳差值」**输入两个时间戳 A / B（各自自动识别单位，可混用），实时输出「时间差（秒）」（带符号，最多 9 位小数、去尾零）与「时间差（格式化）」（`天 / 小时 / 分钟 / 秒 / 毫秒` 非零项拼接，负数前置 `-`），按 **B − A** 计算、纯数字运算不经过浮点 | 实时；不可识别的时间戳显示错误；输入与偏移不做历史记录、不落盘 |
| IP / 网段与掩码 | 输入 `IP`、`IP/前缀`、`IP 掩码`、纯数字或 `0x` 十六进制；自上而下显示：**归属地** → **IP 进制（十进制 / 十六进制 / 二进制）** → 网段结果（网络地址、广播地址、可用范围、主机数、掩码、反掩码、前缀、掩码二进制、地址类型）；IPv6 仅显示 IP 进制 | 未给掩码时按 `/24` 计算并提示；IPv6 不查归属地；归属地卡片固定高度，无运营商显示 `-`；归属地右侧两个图标按钮用浏览器打开 `https://ipgeolocation.io/what-is-my-ip/<ip>` 与 `https://iplocation.io/ip/<ip>`（IP 自动替换；无有效 IPv4 时禁用） |
| 进制转换 | 2/8/10/16 进制四行双向实时同步；另有 2–36 自定义进制（自绘下拉）；“位宽/字节”统计 | 任一行输入即联动其余 |
| JSON 格式化 | 粘贴/失焦后**原地格式化**（固定 4 空格缩进）并语法高亮；工具栏单行：文本/结构切换、键排序、复制、压缩、清空；错误定位（行列）；**结构查看**（可折叠树） | 超过 1MB 仅格式化不高亮；输入改变仅重高亮；编辑器高度 180px |
| SSH 管理 | 读取 `~/.ssh/config` 列表；每行显示系统图标、`user@host(:port)`（22 不显示端口）、别名与**连接按钮**；**双击条目（按钮除外）等同于连接**（连接在置顶终端窗口里执行，见 §3.9，不会切换桌面）；列表在打开面板时自动刷新（无手动刷新按钮）；系统图标来自缓存的探测结果（品牌彩色图标，探测在「设置 · SSH 管理」进行）；行内 `folder` 图标进入**目录浏览**（见 §3.7）：列出该主机目录、双击目录进入下一级、悬浮目录条目在终端里打开并 `cd`（与连接同一个开关：默认置顶终端窗口，可退回 iTerm；文件仅显示体积、无操作）、顶栏可返回上一级 / 返回主机列表 | 忽略通配符主机（如 `Host *`）；未探测显示通用主机图标 |
| 剪贴板 | 主进程按设置周期轮询系统剪贴板，展示最近 N 条记录（默认 **3**，可在设置调整）；文本固定 2 行截断预览，图片渲染为小缩略图，**SVG 代码也渲染为小图（固定 64×64 框内等比缩放）**；每条可复制，支持一键清空历史 | 历史仅存内存、退出即清空；文本超 10 万字截断；图片按「大小+哈希」去重；SVG 超 20 万字符按文本处理 |
| 编码转换 | 字符串 / Base64 / 十六进制 / URL 编码 / ASCII 十进制 五个字段双向实时同步（UTF-8） | 输入非法时标红不联动 |
| 哈希计算 | 计算 **MD5 / SHA1 / SHA256**；支持输入字符串或**选择本地文件**（流式计算，适合大文件）；切换类型时清空结果 | 字符串输入防抖 200ms；文件经系统对话框选择 |
| 营养成分 | 输入商品名与每 100g 的能量(kJ)/蛋白质/脂肪/碳水/钠及商品总重，实时换算：盐、千卡、千焦（含每日推荐 2250kcal / 9410kJ 对比与超出量）、慢跑与步行消耗（公里 / 分钟 / 步数）；底部提供**清空（图标）**与**一个复制按钮（复制输入与结果）** | 输入不做历史记录、不落盘，每次打开为默认值；不做历史列表与商品保存 |
| 设置 · Ships | 语言（自绘下拉）、外观（跟随系统/浅色/深色）、主题色、开机自启、固定悬浮（置顶常驻、失焦不隐藏）、**Liquid Glass**（主界面启用系统玻璃背景：macOS 26+ 用原生 Liquid Glass，旧系统回退 hud 毛玻璃，见 §8.1）、剪贴板条数、剪贴板轮询间隔、打开数据文件夹、关于、开发者（打开悬浮界面 / 设置界面 / **终端界面** DevTools，`devtools:open` 的 `main` / `settings` / `terminal`） | 见 §5.1 |
| 设置 · SSH 管理 | `~/.ssh/config` 主机的增删改（别名/HostName/User/Port/IdentityFile/ProxyJump）；列表左侧显示系统图标；新增时自动预填 **用户 root / 端口 22 / 私钥 `~/.ssh/id_ed25519`**，**私钥支持手动选择文件**（对话框默认 `~/.ssh`，选后转为 `~` 路径），保存时别名默认取主机地址；表单内含「探测系统」，**探测成功后才允许保存**，探测失败**保留表单内容**；支持**导出 config** | 别名与主机地址至少填一项；删除二次确认 |
| 设置 · 终端 | 配置置顶终端窗口：**默认 shell**（留空 = 系统默认 `$SHELL`，可手填或用「选择文件」挑，写入前校验文件存在）、**字体大小**（8–24px，默认 12）、**窗口大小**（宽 × 高，最小 480 × 320，默认 1024 × 768；改完立即作用到已打开的终端窗口，手动拖动窗口也会写回；这是「换屏 / 无记忆」时的默认尺寸，同屏则优先沿用终端窗口自己的位置与尺寸）、**缓冲区大小**（默认 10000 行）、**打开终端的全局快捷键**（默认 `⌘⇧Z`；点按钮后按新组合键改绑，`Backspace` 清除、`Esc` 取消，至少含 Command / Control / Alt 之一，被占用 / 非法时红字提示且不落盘）、**SSH 使用内置终端连接**（开关：开 = 点连接、以及目录浏览里「打开」都在置顶终端执行 `ssh`，关 = 两者都改用 iTerm）、**重置**（二次确认后把以上终端设置恢复默认值，并清掉 `terminal-window.json` 里记住的屏幕 / 位置 / 大小） | 对应 `settings.json` 的 `terminalShell`/`terminalFontSize`/`terminalWindowWidth`/`terminalWindowHeight`/`terminalScrollback`/`terminalHotkey`/`sshBuiltinTerminal`；默认值来自 `package.json` 的 `ships.terminalWindow`/`ships.sshBuiltinTerminal`；窗口位置 / 屏幕在 `terminal-window.json`（见 §5.1、§3.9） |
| 设置 · 网络测试 | 在本地或通过 `~/.ssh/config` 里的主机执行测试命令（TCP / UDP / HTTP(S) / ICMP / ARP / 扫描应用 / 扫描主机）；下方是**可直接输入命令的交互终端**（真实 PTY + 默认登录 shell + xterm.js），「测试」把校验过的命令送进终端执行（选主机时包一层 `ssh`）、「停止」发送 Ctrl-C；详见 §3.8 | 端口默认 80；扫描主机需网段（前缀 16–30）；扫描应用端口可留空；输入不落盘 |
| 底部栏 | 左显示版本号；右侧依次为**终端图标**（打开置顶终端窗口，见 §3.9）、**网络测试图标**（打开设置 → 网络测试分区）、**图钉（固定悬浮）**与设置入口 | 图钉状态取 `settings.pinWindow`；版本取 `package.json` |
| 通用交互 | 顶部栏左侧为 App 彩色图标 + 名称、右侧 TAB 右对齐；所有下拉框为 Tailwind 自绘（非系统 `<select>`）；TAB 与图标按钮悬浮显示提示；切换类组件均带过渡 / 入场动画；各工具输入不做历史记录、不落盘，面板切换 / 重启后不保留 | 见 §11 |

---

## 5. 数据与接口

### 5.1 本地数据与加密存储

| 文件 | 位置 | 结构 | 生命周期 |
| --- | --- | --- | --- |
| `settings.json` | `app.getPath('userData')`（macOS：`~/Library/Application Support/ships/settings.json`） | `{ locale, theme, accent, launchAtLogin, pinWindow, vibrancy, clipboardLimit, clipboardPollMs, terminalShell, terminalFontSize, terminalWindowWidth, terminalWindowHeight, terminalAlwaysOnTop, terminalScrollback, terminalHotkey, sshBuiltinTerminal }` | 持久；重启保留 |
| `ships.log` | 同上目录 | 追加写入的文本日志（启动信息、SSH 探测过程 / 命令 / 输出 / 报错等） | 持久；用于排查本地网络与权限问题 |
| `ssh-detected.json` | 同上目录 | `{ [alias]: { os, family, label, at } }` | 持久；缓存探测结果 |
| `ssh-browse.json` | 同上目录 | `{ [alias]: "/abs/dir" }`（每台主机最近打开的目录） | 持久；由目录浏览写入，下次进入时列出其父目录 |
| `terminal-window.json` | 同上目录 | `{ display: { id, scaleFactor, bounds: { x, y, width, height } }, bounds: { x, y, width, height } }`（置顶终端窗口最近一次的所在屏幕 + 位置 + 尺寸） | 持久；打开 / 拖动 / 缩放 / 关闭时写入（含「实际生效」的几何，恢复时被夹取过也记夹取后的值）；同一块屏幕再次打开即沿用，换屏 / 拔屏 / 无记录则改用默认尺寸居中 |
| 剪贴板历史 | 内存（不落盘） | 最近 5 条 `{ id, type, text?, thumb?, width?, height?, truncated?, at }` | 随进程退出丢失 |
| `~/.ssh/config` | 用户主目录 | 标准 OpenSSH 配置 | 由设置内 SSH 管理读写；未加密（非机密） |

- 机密数据：本应用不保存密码 / 令牌；SSH 私钥仍由用户自行管理与使用，不复制、不落盘到应用数据目录。
- 设置默认值来自 `package.json` 的 `ships.defaultLocale/defaultTheme/defaultAccent`。
- 启动时打印数据文件清单与绝对路径（`src/main/utils/paths.js` → `describeDataFiles`）。

### 5.2 IPC 通道

**invoke（渲染 → 主，返回 Promise）**

| 通道 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `app:info` | — | `{ version, platform, arch, systemLocale, dataDir, dataFiles, terminalScrollback }` | 版本取 `package.json`；`terminalScrollback` 取 `ships.terminalWindow.scrollback` |
| `app:open-data-folder` | — | `{ ok, error? }` | 打开数据目录 |
| `app:open-log` | — | `{ ok, error? }` | 在 Finder 中定位并打开 `ships.log` |
| `app:open-external` | `url` | `{ ok, error? }` | 仅允许 `http(s)` |
| `settings:get` | — | `settings` | |
| `settings:set` | `patch` | 合并后的 `settings` | 副作用：写盘 + 广播 + 可能修改登录项 |
| `ssh:list` | — | `{ hosts, detected }` | 读 `~/.ssh/config` |
| `ssh:connect` | `{ alias, inTerminal? }` | `{ ok, command?, error? }` | 按 alias 查表并拼 `ssh …`：`inTerminal: true`（终端窗口头部的 SSH 下拉）**强制注入当前置顶终端窗口**、不受 `sshBuiltinTerminal` 影响；省略时按 `settings.sshBuiltinTerminal` 决定走置顶终端或 iTerm |
| `ssh:detect` | `{ alias }` | `{ queued }` | 异步，结果经 `ssh:detected` 回传（兼容保留） |
| `ssh:detect-host` | `{ alias?, hostName, user?, port?, identityFile?, proxyJump? }` | `{ ok, alias, info }` | 对任意主机（可尚未保存）同步探测，结果写入缓存并广播 |
| `ssh:get-detected` | — | `{ [alias]: { os, family, label, at } }` | 读取探测缓存 |
| `terminal:open` | — | `{ ok }` | 打开 / 聚焦置顶终端窗口（§3.9） |
| `terminal:start` | `{ cols, rows }` | `{ ok, id, cols, rows, shell }` | 新建交互终端会话（真实 PTY + 默认登录 shell） |
| `terminal:input` | `{ id, data }` | `{ ok }` | 把 xterm 的键盘输入写进 PTY |
| `terminal:resize` | `{ id, cols, rows }` | `{ ok }` | 同步 PTY 尺寸（`TIOCSWINSZ`） |
| `terminal:interrupt` | `{ id }` | `{ ok }` | 向终端发送 Ctrl-C |
| `terminal:kill` | `{ id }` | `{ ok }` | 结束会话 |
| `terminal:export` | `{ text, name? }` | `{ ok, path?, canceled?, error? }` | 保存对话框 + 把终端文本写入本地文件 |
| `terminal:open-iterm` | — | `{ ok, command?, error? }` | 在 iTerm 中重放最后注入的命令并关闭终端窗口 |
| `terminal:set-top` | `{ value: boolean }` | `{ ok, alwaysOnTop }` | 终端窗口头部图钉：写 `settings.terminalAlwaysOnTop`，由 `window-manager` 的 settings 监听调 `setAlwaysOnTop(true, 'screen-saver')` / `setAlwaysOnTop(false)`；持久，下次打开沿用 |
| `terminal:set-hotkey` | `{ hotkey: string }` | `{ ok, hotkey, error? }` | 设置界面改绑全局快捷键：先试注册（空串 = 注销），**成功才写 `settings.terminalHotkey`**；失败返回 `{ ok: false, error }`（`unavailable` = 已被占用）并保持原值 |
| `terminal:reset` | — | `{ ok, settings }` | 设置 → 终端 →「重置」：把终端相关设置（`terminalShell`/`terminalFontSize`/`terminalScrollback`/`terminalWindowWidth`/`terminalWindowHeight`/`terminalAlwaysOnTop`/`terminalHotkey`/`sshBuiltinTerminal`）恢复为 `package.json` 里的默认值，并删除 `terminal-window.json`（记住的屏幕 / 位置 / 大小）；返回重置后的完整设置 |
| `terminal:snap-size` | `{ width?, height? }` | `{ ok, size?, deferred? }` | 渲染层按**实测余量**请求把窗口收到「整行 / 整列」：**拖动期间只挂起**（`deferred: true`），松手后由渲染层重新测量再对齐；偏差 > 60px 视为状态异常、不做。只接受来自终端窗口本身的请求 |
| `window:control` | `{ action: 'close' \| 'minimize' \| 'zoom' }` | `{ ok, action }` | 终端窗口自绘小红绿灯的窗口控制：只作用于**发起请求的那个窗口**（`BrowserWindow.fromWebContents(event.sender)`），未知 action 返回 `{ ok: false }` |
| `net-test:command` | `{ id, protocol, target, port, host? }` | `{ ok, command?, error? }` | 校验后把测试命令注入指定终端会话；`host` 为 SSH 别名时整条命令包一层 `ssh` |
| `ssh:list-dir` | `{ alias, path?, remember? }` | `{ ok, path?, parent?, entries?, truncated?, lastDir?, code?, error? }` | 列出远端目录：`path` 省略时取「上次目录的父目录」或 `~`；`remember: true` 时**仅在列出成功后**把实际路径记入 `ssh-browse.json`（输错路径不会被记住）；`code` ∈ `noDir`/`noPath`/`listFailed`/`timeout`/`connect` |
| `ssh:open-dir` | `{ alias, path }` | `{ ok, command?, error? }` | 打开终端并 `cd` 进该目录（副作用：记录该目录为「上次打开的目录」）；默认注入置顶终端窗口，`settings.sshBuiltinTerminal` 为 `false` 时改用 iTerm |
| `ssh-config:read` | — | `hosts` | |
| `ssh-config:upsert` | `host` | 更新后的 `hosts` | 保留未管理指令与注释 |
| `ssh-config:remove` | `alias` | 更新后的 `hosts` | |
| `ssh-config:export` | — | `{ ok, path?, canceled?, error? }` | 经保存对话框导出 `~/.ssh/config` 副本 |
| `geo:lookup` | `ip`（IPv4 字符串） | `{ iso_3166, country, province, city, isp }` 或 `null` | 本地 `assets/geoip.json` 查询；内网返回 `{ isp: '保留地址' }`；**逐级回退**（省 / 市只有中国、台湾有数据，缺失不影响国家级结果；只有 ISP 命中时仅返回 `isp`；都不命中返回 `null`） |
| `devtools:open` | `'main' \| 'settings' \| 'terminal'` | `{ ok }` | 打开对应窗口的开发者工具（detach 模式；主面板会先显示，`'terminal'` 未打开时先打开置顶终端窗口） |
| `clipboard:list` | — | `item[]`（最多 5 条） | 内存历史，含文本 / 图片缩略图 |
| `clipboard:copy` | `id` | `{ ok, error? }` | 文本用 `writeText`，图片用 `ClipboardItem` 写回 |
| `clipboard:clear` | — | `{ ok }` | 清空历史（不清空系统剪贴板） |
| `hash:text` | `text` | `{ md5, sha1, sha256 }` | 计算文本哈希 |
| `hash:file` | `file`（绝对路径） | `{ ok, hashes?, info?, error? }` | 流式计算文件哈希 |
| `dialog:open-file` | — | `{ path, name, size }` 或 `null` | 打开系统文件选择对话框 |

**send（渲染 → 主，单向）**

| 通道 | 说明 |
| --- | --- |
| `window:hide` | 隐藏主面板 |
| `window:open-settings` | 隐藏主面板并打开设置窗口；可选参数 `section`（如 `network`）指定初始分区，窗口已打开时直接切换 |
| `window:close-settings` | 关闭设置窗口 |

**事件（主 → 渲染）**

| 通道 | 负载 | 说明 |
| --- | --- | --- |
| `settings:changed` | `settings` | 设置变更后广播到两个窗口 |
| `theme:changed` | `{ shouldUseDarkColors }` | 系统主题变化 |
| `ssh:detected` | `{ alias, os, family, label, at }` | 探测完成 |
| `clipboard:changed` | `item[]` | 剪贴板历史变化（主进程每约 1.2s 轮询系统剪贴板） |
| `terminal:data` | `{ id, type: 'data', data }` | PTY 输出（原样文本，含 ANSI），只发给拥有该会话的窗口 |
| `terminal:exit` | `{ id, type: 'exit', code, signal }` 或 `{ id, type: 'error', message }` | 会话结束 / 启动失败 |
| `terminal:recalibrate` | — | 拖动结束后请终端窗口重新测量并按整行对齐高度（拖动期间主进程不改窗口尺寸，见 §3.9-4） |
| `terminal:drag-active` | — | 主进程检测到终端窗口开始被拖动（`will-resize`）：渲染层据此在拖动期间不发对齐请求 |
| `settings:open-section` | `sectionId` | 请求设置窗口切换到指定分区（由 `window:open-settings` 的 `section` 触发） |

### 5.3 菜单与权限映射

- 托盘左键：切换主面板；托盘右键菜单：`打开设置`、`退出 Ships`。
- **应用菜单**（`src/main/menu.js`）：自定义模板 = 应用菜单 / 编辑（撤销、剪切、拷贝、粘贴、全选，终端里复制粘贴依赖它）/ 视图（放大、缩小、实际大小、全屏、开发者工具）/ 窗口菜单。视图里的三个缩放项 **只显示快捷键、不向系统注册**（`registerAccelerator: false`），改由主进程 `before-input-event` 统一处理：`Cmd + = / +` / `Cmd + -` / `Cmd + 0` —— **焦点在置顶终端窗口时只改 xterm 字号**（`terminal:zoom` → 8–24px，默认 12px，改完重新 fit 并同步 PTY），其它窗口保持原来的整页缩放。终端窗口另外用 `setVisualZoomLevelLimits(1, 1)` 关掉 pinch 缩放、`zoom-changed` 把 `Cmd+滚轮` 也接到字号缩放上，保证标题栏与图标永远不跟着放大缩小。
- 不涉及系统权限申请（无摄像头/麦克风等）；SSH 连接依赖用户本机 iTerm 与 `~/.ssh/config`。

### 5.4 本地 HTTP API

- 无。应用不监听任何本地端口。

---

## 6. 流程图

### 6.1 总体架构

```mermaid
flowchart LR
  Tray[Tray 图标] -->|点击| WM[window-manager]
  WM --> Main[主面板 index.html]
  WM --> Settings[设置窗口 settings.html]
  Main <-->|invoke/send/event| IPC[IPC 层]
  Settings <-->|invoke/send/event| IPC
  IPC --> SvcSettings[settings-service]
  IPC --> SvcSshConfig[ssh-config-service]
  IPC --> SvcSsh[ssh-service]
  SvcSettings --> F1[(settings.json)]
  SvcSshConfig --> F2[~/.ssh/config]
  SvcSsh --> F3[(ssh-detected.json)]
  SvcSsh --> Iterm[iTerm<br/>仅 sshBuiltinTerminal=false]
  SvcSsh --> Remote[远端主机]
```

### 6.2 托盘面板显示流程

```mermaid
flowchart TD
  A[点击托盘图标] --> B{面板可见?}
  B -- 是 --> C[隐藏面板]
  B -- 否 --> D[读取托盘 bounds]
  D --> E[按托盘中心水平居中、位于图标下方]
  E --> F[按工作区夹取坐标]
  F --> G[显示并聚焦面板]
```

### 6.3 SSH 探测时序

```mermaid
sequenceDiagram
  participant U as 用户
  participant R as 渲染层
  participant M as 主进程
  participant H as 远端主机
  U->>R: 点击探测图标
  R->>M: ssh:detect { alias }
  M-->>R: { queued: true }
  M->>M: 按 alias 查 ~/.ssh/config
  M->>H: ssh2 连接并读取 uname + /etc/os-release
  H-->>M: 输出
  M->>M: 归类 macos/linux/windows/bsd/unknown
  M->>M: 写入 ssh-detected.json
  M-->>R: 事件 ssh:detected { alias, os }
  R->>R: 更新系统图标
```

### 6.4 设置变更生命周期

```mermaid
stateDiagram-v2
  [*] --> 读取: 启动读取 settings.json
  读取 --> 应用: 主题/强调色/语言
  应用 --> 修改: 设置窗口 patch
  修改 --> 写盘: settings:set
  写盘 --> 广播: settings:changed
  广播 --> 应用
```

---

### 6.5 SSH 目录浏览

```mermaid
flowchart TD
  A[主列表点击 folder 图标] --> B["ssh:list-dir（不传 path）"]
  B --> C{ssh-browse.json 有该主机记录?}
  C -- 有 --> D[列出记录目录的父目录<br/>该目录以强调色 + 上次标记高亮]
  C -- 无 --> E[列出 ~]
  D --> F[双击目录行]
  E --> F
  F --> G["ssh:list-dir remember=true<br/>记录该目录并列出下一级"]
  H[悬浮条目 → terminal 图标] --> I["ssh:open-dir<br/>记录该目录 + 打开终端并 cd 进入<br/>（默认置顶终端，可退回 iTerm）"]
  J[点击 上一级] --> K["ssh:list-dir 父目录（不修改记录）"]
  L[点击 返回主机列表] --> M[回到主机列表]
```

---

## 7. 构建与发布

- **包管理**：`pnpm`（锁文件 `pnpm-lock.yaml`）。安装：`pnpm install --frozen-lockfile`。
- **脚本**（`package.json`）：
  - `build:css`：Tailwind 编译 `src/renderer/styles/tailwind.css` → `tailwind.build.css`（压缩）。
  - `watch:css`：监听模式。
  - `start`：先 `build:css` 再 `electron .`。
  - `dev`：直接 `electron .`（需已有构建产物）。
  - `postinstall`：安装后自动 `build:css`。
  - `dist:mac`：执行 `scripts/dist-mac.sh` —— 先 `build:css`，再自动选择签名身份并 `electron-builder --mac --arm64`（实际调用 `npx electron-builder`），产出 **DMG**。
  - `pack:mac`：同上但加 `--dir`，仅产出 `.app`（调试用）。
- **打包配置**（`package.json` 的 `build` 段，electron-builder）：
  - `appId = com.ships.app`，`productName = Ships`；产物目录 `release/`。
  - `files`：`src/**/*`、`assets/**/*`、`package.json`；依赖由 electron-builder 自动收集（`asar: true`）—— 渲染层直接从 `node_modules/@xterm/…` 加载终端资源，因此 `@xterm/xterm` 与 `@xterm/addon-fit` 放在 `dependencies`（不是 devDependencies）。
  - **原生依赖 `electron-liquid-glass`**：N-API 预编译（含 `darwin-arm64` / `darwin-x64`），故 `npmRebuild: false` 无需重编；`build.asarUnpack` 把 `**/*.node` 与 `node_modules/electron-liquid-glass/**` 解包到 `app.asar.unpacked` 供加载（Liquid Glass 仅运行时 macOS 26+ 生效，旧系统由主进程回退）。
  - **`build.asarUnpack` 另含 `src/main/scripts/*`**：`pty-bridge.py` 要作为文件被 `python3` 打开，而 `app.asar` 是归档不是目录（否则打包后报 `can't open file '…/app.asar/src/main/scripts/pty-bridge.py': [Errno 20] Not a directory`），解包后由 `terminal-service` 把路径改写到 `app.asar.unpacked` 再 `spawn`。
  - `npmRebuild: false`（`ssh2` 使用纯 JS 回退，无需重编原生模块）。
  - `compression: 'maximum'`；`electronLanguages: ['en', 'zh_CN']`（仅保留中英文 Electron 语言包，剔除约 220 个语言包、解包体积减少约 48MB）。
  - `mac.target`：**仅 arm64 的 dmg**；`mac.icon = assets/imgs/icon.icns`；`hardenedRuntime = true`、`gatekeeperAssess = false`；`extendInfo` 含 `LSUIElement = true`（纯菜单栏 Agent，无 Dock）与 `NSLocalNetworkUsageDescription`（本地网络授权说明）。
- **签名 / 公证（打包时自动）**：
  - 由 `scripts/dist-mac.sh` 判断：设置了 `CSC_LINK` / `APPLE_ID` / `CSC_NAME` 之一 → 视为**正式签名**，交给 electron-builder 在打包阶段用 Developer ID 签名（`.app` 与 `dmg`，`dmg.sign = true`）；否则设 `CSC_IDENTITY_AUTO_DISCOVERY=false`（避免误用钥匙串里的无关证书而失败）。
  - **ad-hoc 兜底**：`afterPack` 钩子 `scripts/after-pack.cjs` 调用 `scripts/adhoc-sign.sh`：仅当未配置正式签名（同上三个环境变量都为空）时执行 `codesign --force --deep --sign -` 并对 `.app` 校验，保证**未签名环境下应用仍可运行**；配置了正式签名时跳过，以免覆盖。
- **打包加固**（`afterPack` 内，顺序固定：**asar → 二进制 → 签名**）：
  - **asar 保护**：用 `asarmor` 给 `app.asar` 打 **bloat 补丁**（约 100GB 假条目），使 `asar extract` 解包时写出大量数据而失败（现代 `asar` 已使传统补丁失效，故采用 bloat 策略）。
  - **Electron Fuses**（`@electron/fuses`）：`RunAsNode=false`、`EnableNodeOptionsEnvironmentVariable=false`、`EnableNodeCliInspectArguments=false`、`EnableCookieEncryption=true`、`OnlyLoadAppFromAsar=true`；`EnableEmbeddedAsarIntegrityValidation=false`（与 asar 改写冲突）。
  - 加固依赖 `asarmor`、`@electron/fuses` 位于 `devDependencies`。
  - **公证**：`afterSign` 钩子 `scripts/notarize.cjs`，当设置 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` 时自动公证（`SKIP_NOTARIZE=1` 可跳过）。
  - 产物命名：`Ships-v<version>-<arch>.dmg`（含 `.blockmap`）。
- **图标生成**：`node scripts/gen-icons.mjs` 在 `assets/imgs/` 生成 `trayTemplate*.png`、`app.png`，在 macOS 上经 `iconutil` 额外生成 `icon.icns`。
- **CI**（`.github/workflows/build-mac.yml`）：在 `macos-14` 上以 **pnpm 10 / Node 22** 安装并执行 `pnpm dist:mac`；签名/公证由 secrets 提供（`CSC_LINK` / `CSC_KEY_PASSWORD` / `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`，缺省则未签名构建）；上传 DMG artifact；打 `v*` tag 时发布到 GitHub Release。
- **版本对齐**：`package.json` 版本、本文件“当前版本”与产物文件名中的版本号保持一致。

---

## 8. 主界面布局

### 8.1 主面板（托盘弹出）

- 尺寸：**400 × 500**（`ships.window.width/height`），无边框、透明、不可缩放、置顶、不占 Dock。
- **浮动行为（与终端窗口的置顶开关无关）**：面板 `alwaysOnTop: true`（**恒定**，不跟随 `settings.terminalAlwaysOnTop` —— 终端窗口头部图钉只改终端自己），并用 `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })` 加入所有桌面 + 全屏辅助；**每次弹出前**（`showMainWindow` → `setAlwaysOnTop(true)` + 重新声明上面的 collection behavior 后再 `show()`）都会重申一次，保证点击托盘时面板直接浮在当前界面（含全屏应用之上），而不是被系统切回某个桌面才显示得出来。`skipTransformProcessType: true`：本应用已是 `LSUIElement` 菜单栏 Agent（`app.dock.hide()`），不需要 Electron 在「UIElement ↔ 普通应用」之间转换进程类型 —— 该转换会短暂隐藏窗口 / Dock 并改变激活与窗口显示行为。
- 结构：顶部栏（高 46px）：**左侧**为 App 彩色图标 + 名称（固定不压缩），**右侧**为 TAB 图标区（右对齐、超出可横向滚动；图标 22×22px、按钮 36×36px、间距 6px）→ 内容区（可滚动）→ 底部栏（高 34px）。
- TAB 工具顺序由单一文件 `src/renderer/scripts/tool-order.js` 的 `window.ShipsToolOrder` 数组决定（改数组即改顺序；未列出的工具按注册顺序追加到末尾）。
- 圆角：外层面板 `--radius-window`（10px），透明窗口使圆角外露；**主窗口无描边边框**（仅卡片/输入框有边框）。
- 底部栏：左侧版本号（`vX.Y.Z`），右侧依次为**终端**（`terminal`，打开置顶终端窗口，§3.9）、**网络测试**（`wifi`，打开设置 → 网络测试分区）、图钉（固定悬浮）与设置按钮（齿轮），四个图标按钮均为 24×24px、**间距 12px**（比顶部 TAB 小，间距放大后图标之间的留白与顶部观感一致）。
- `Escape` 隐藏面板；默认失焦自动隐藏；固定悬浮时保持显示并可通过顶部「应用图标 + 名称」区域拖动。
- **Liquid Glass（设置项 `Liquid Glass`，键 `settings.vibrancy`，仅 macOS）**：粒度分三档，由 `window-manager.js` 的 `glassMode()` 判定：
  - **`liquid`（macOS 26+，优先）**：用 `electron-liquid-glass` 在窗口内容后插入原生 `NSGlassEffectView`（Liquid Glass）。窗口 `transparent: true`、**不设 `vibrancy`**、`roundedCorners: false`，内容加载后 `liquidGlass.addView(win.getNativeWindowHandle(), { cornerRadius: WINDOW.cornerRadius })`（默认 10px）由玻璃自带圆角；**不叠加 tint，保持高透**（背景的 blur 与折射直接透出）。
  - **`vibrancy`（旧 macOS 回退）**：用系统 `hud` 材质（强透明，Control Center 那种通透感；`content` / `under-window` 会几乎不透或发灰，故不用），`visualEffectState: active`，并需 `roundedCorners: true` 让系统裁剪材质；常量见 `shared/constants.js` 的 `VIBRANCY`。
  - **`off`**：无玻璃，`roundedCorners: false`，由 CSS 圆角塑形。
  因 `roundedCorners` / `vibrancy` / 原生玻璃视图都是**创建期**行为，切换该设置时丢弃并按新配置**重建主面板**（此时面板隐藏，无闪烁；`main.js` 已订阅 `window-all-closed` 不退出）。`app.js` 在 macOS 下于 `<html>` 置 `data-vibrancy="on"`，`constants.css` 把 `--color-bg` 置 `transparent` 让玻璃透出（浅色下卡片 / 输入框保持不透明主题色，深色下沿用半透明 `--color-surface*`）；另由 `nativeTheme.themeSource` 使材质跟随应用主题。**仅作用于主面板**，设置窗口保持不透明；非 macOS 不生效（属性置 `off`，`glassMode()='off'`）。默认关闭。

### 8.2 设置窗口

- 尺寸：**800 × 600**（`ships.settingsWindow`），普通窗口，可缩放（最小 560×420），`titleBarStyle: hiddenInset`。
- 布局：**左右分栏** —— 左侧导航（宽 190px，含 Ships 设置、SSH 管理、终端、网络测试），右侧内容区。
- 顶部 **28px** 为可拖拽区域（`.drag-region`，覆盖系统红绿灯 / 原生标题栏范围）；左侧导航从 32px、右侧标题从 12px 起排（不再额外留 52px 空白），`Escape` 关闭窗口。

### 8.3 图标与资源

- **SVG 图标**：所有界面图标以独立 `.svg` 文件存放于 `assets/icons/`（kebab-case 命名，如 `clock.svg`、`arrow-left.svg`、`arrow-up.svg`、`file.svg`、`doc.svg`、`image.svg`、`archive.svg`、`caret-right.svg`、`home.svg`、`temp-file.svg`、`traffic-close.svg` / `traffic-minimize.svg` / `traffic-zoom.svg`（终端窗口自绘小红绿灯的悬浮符号）），**代码中不硬编码** SVG 标记；由 `src/preload/icons.js` 在启动时读取目录、转成 camelCase 键名并经 `contextBridge` 暴露为 `window.shipsIcons`，渲染层 `ShipsUI.Icons[name](size)` 注入尺寸后使用（会先移除图标根标签上已有的 `width` / `height` 再注入，兼容自带尺寸的品牌图标）。新增 / 修改图标只需增删 / 编辑文件；系统品牌图标（`ubuntu.svg` / `fedora.svg` / `arch.svg` / `centos.svg` / `debian.svg` / `linux.svg` / `mint.svg` / `opensuse.svg` / `RHEL.svg` / `rocky.svg` / `windows.svg` 等）同样放在此处，用于 SSH 探测结果展示。
- **文件类型图标（目录浏览）**：按 `src/renderer/scripts/constants.js` 的 `FILE_TYPE_ICONS`（扩展名 → 图标名，92 项）与 `FILE_NAME_ICONS`（无扩展名的文件名，如 `Makefile` / `Dockerfile` / `LICENSE` / `README`）映射到 `code` / `braces` / `terminal` / `doc` / `image` / `play` / `archive`，未命中用 `DEFAULT_FILE_ICON = file`；目录固定 `folder`。未引入第三方图标库：远端文件只有文件名，没有类型探测，系统图标类库（读取本地文件图标）在此用不上。
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
- **交互**：点击右侧「连接」按钮，或**双击条目**（按钮区域除外）均执行连接（默认在置顶终端窗口里 `ssh`，见 §3.4；可设为 iTerm）；点击「目录」按钮进入目录浏览视图；打开面板时自动刷新列表。
- **目录浏览视图**（独占内容区，替换主机列表，见 §3.7）：
  - 顶栏：`←` 返回主机列表、`↑` 上一级、`/root`（`home.svg`）与 `/tmp`（`temp-file.svg`）两个图标快捷按钮、**可编辑路径框**（等宽字体，回车进入、Esc / 失焦恢复）。目录打开失败时**不显示文案、不产生重排**，路径框红闪 3 次后恢复。
  - 条目：目录名前有**向右三角按钮**（`caret-right.svg`，图标 12px、按钮 13×20px 且内容靠左对齐；**单击即进入该目录**，悬浮提示「进入该目录」），文件不显示三角但保留同宽占位（13px），因此文件名称整体缩进（目录名与文件名左边界一致，实测距行左边缘 54px）；类型图标：目录 `folder.svg`，文件按扩展名映射到 code / braces / terminal / doc / image / play / archive（未命中 `file.svg`，见 §3.7）；符号链接按文件显示并附 `→ 目标`；文件名中的非法字节 / 控制字符以 `\xNN` 显示；文件显示人类可读体积（B / KB / MB / GB），目录不显示体积；顺序为**文件夹优先 + 组内沿用远端 `ls` 顺序**（见 §3.7）；**文件夹行底色比文件行略深**（`--color-row-dir-bg` = `color-mix(in srgb, var(--color-fg) 4%, var(--color-surface))`，浅色下约 `#f6f6f6` vs 文件行 `#ffffff`）。
  - 行高：条目比主机行紧凑（`.row-card.row-compact` → `gap-2 / px-2.5 / py-1`，类型图标框 `h-6 w-6`、悬浮操作按钮 `h-6 w-6`，三角占位 `w-3.5`），列表行距 `gap-2`；因 `html` 字号为 13px（`1rem = 13px`），实测条目行高约 28px、主机行约 38px。
  - 交互：目录**双击**进入下一级；条目**单击无效果**；**目录**悬浮时右侧出现 `terminal` 图标，点击后打开终端并 `cd` 进入该目录（默认置顶终端窗口，`settings.sshBuiltinTerminal=false` 时用 iTerm，见 §3.7）；**文件无任何操作**（无悬浮图标、双击不响应）。
  - 高亮：「上次打开的目录」**整行换底色**（`.row-card.row-last` → `--color-last-bg` / `--color-last-border`），文件名加粗并带 `chip`「上次」标记。
  - 滚动：工具标题与顶栏（返回 / 上一级 / 路径）**固定不动**，只有条目列表在剩余高度内滚动；浏览时在 `#content` 上加 `.tool-fixed`，返回主机列表即移除（普通页面滚动恢复）。

---

### 8.5 置顶终端窗口

- 尺寸与位置：默认 **1024 × 768**（`ships.terminalWindow.width/height`，可在 **设置 → 终端 → 窗口大小** 调整，存 `settings.json` 的 `terminalWindowWidth` / `terminalWindowHeight`），可缩放、最小 `minWidth × minHeight` = 480×320，`titleBarStyle: hiddenInset`；改设置立即生效，手动拖动窗口写回设置。**屏幕 / 位置 / 尺寸会自动记忆**（`terminal-window.json`）：同屏重开沿用记忆（越界夹回工作区），换屏 / 拔屏 / 无记录则用默认尺寸在当前屏幕居中，详见 §3.9。
- 层级：`alwaysOnTop` + `setAlwaysOnTop(true, 'screen-saver')`（由终端窗口自己的图钉开关控制，与主面板无关）；`setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true, skipTransformProcessType: true })` —— 带全屏辅助（可浮在全屏应用之上）但**不加入所有桌面**（切换桌面时窗口留在原桌面，详见 §3.9）。
- 头部：**22px** 自绘头栏 `#term-header`（左侧**自绘小红绿灯** 9px×3、左边距 12px —— 系统红绿灯已隐藏，点击 = `window:control` 关闭 / 最小化 / 缩放；**无标题文字**；右侧图标区：**SSH 主机下拉**（默认 180×18px，条目 `用户名@主机地址`，选中即在当前终端执行 `ssh …`，见 §3.9-2）+ 三枚 18×18px 图标按钮（符号 12px）：**置顶开关**（置顶时 `pin` 图标 + 强调色，取消后 `pin-off`）、iTerm 交接、导出文本）；**头栏尺寸随终端字号缩放**（`--term-header-font-size`，默认 12px：高 `max(22px, 字号+6px)`，24px 字号 → 30px），头部为拖拽区、红绿灯与图标区为 `no-drag`，头栏不挂 `data-tip`。
- 主体：xterm.js 终端铺满剩余区域（外层 `#term-host` 负责 6.5 / 13px 留白，xterm 挂在无内边距的 `#term-fit` 上，保证 `FitAddon` 按真实可用区算行数 —— 最后一行完整可见、页面不可滚动，见 §3.9），滚动缓冲 **10000 行**、**不显示滚动条**（滚轮 / 触控板滚动缓冲区，防跳变见 §3.9）。
- 入口：主面板底部栏「终端」图标；SSH 连接（§3.4）也会拉起本窗口。

---

## 9. 权限过滤

- 不适用：应用无账号 / 权限体系，未做权限过滤。

---

## 10. 连接测试

- **设置 · 网络测试**（§3.8）：在本地或通过 SSH 主机执行 `nc` / `curl` / `ping` / `arp` / `nmap` 一次性命令，输出显示在设置页内嵌的 xterm 终端；校验与命令映射见 §3.8。
- **SSH 的可用性**通过 **SSH 管理 → 探测操作系统** 隐式验证（同时也是目录浏览所用连接）：
  - 步骤：点击探测 → 后台 `ssh2` 连接 → 读取 `uname -s` 与 `/etc/os-release`，识别到具体发行版。
  - 成功判定：连接建立且命令返回可识别系统。
  - 超时：`readyTimeout = 8000ms`；失败归类为 `unknown`。
- **目录浏览的可用性**：`ssh:list-dir` 的远端退出码映射为 `noDir`（3，目录不存在 / 无权限）、`noPath`（4，无法解析绝对路径）、`listFailed`（5，列目录失败），另有 `timeout`（20s 无响应）与 `connect`（连接 / 认证失败）；失败时主面板红字提示并写入 `ships.log`。

---

## 11. GUI 与布局规范

**字体**

- 无衬线：`--font-sans`（系统字体栈，含 PingFang SC）。
- 等宽：`--font-mono`（SF Mono 等），用于数值 / 地址 / 代码。

**颜色（`src/renderer/styles/constants.css`）**

| 变量 | 浅色 | 深色 |
| --- | --- | --- |
| `--color-bg` | `#ffffff` | `#1c1c1e` |
| `--color-surface` | `#ffffff` | `#2a2a2c` |
| `--color-surface-2` | `#fafafb` | `#333336` |
| `--color-surface-3` | `#f1f1f3` | `#3d3d41` |
| `--color-border` | `rgba(0,0,0,.09)` | `rgba(255,255,255,.1)` |
| `--color-fg` | `#1d1d1f` | `#f5f5f7` |
| `--color-fg-muted` | `#8a8a8f` | `#98989f` |
| `--color-accent` | 由设置决定（默认 `#2e6bfc`） | 同左 |
| `--color-danger` | `#e5484d` | `#ff6369` |
| `--color-success` | `#2f9e44` | `#4ade80` |

- JSON 语法色：`--color-json-key/str/num/bool/null`（深浅各一套）。
- **强调色使用范围**：`--color-accent` 仅用于高亮与控件（TAB 选中、分段控件、开关、焦点环、强调按钮、色板等），**不**用于卡片 / 输入框的边框与背景（这些保持中性色）；**唯一例外**是 SSH 目录浏览中「上次打开的目录」整行高亮（`.row-card.row-last`）。
- **目录浏览行底色 / 高亮色**：`constants.css` 的 `--color-row-dir-bg` = `color-mix(in srgb, var(--color-fg) 4%, var(--color-surface))`（文件夹行 `.row-card.row-dir`，浅色下约 `#f6f6f6`）；`--color-last-bg` = `color-mix(in srgb, var(--color-accent) 16%, var(--color-surface))`、`--color-last-border` = 35% 强调色 + `--color-border`（「上次打开的目录」整行高亮，浅色下 `#dee7ff`、深色下 `#2b344d`）；`.row-card.row-last` 在 `.row-card.row-dir` 之后声明，故高亮优先于文件夹底色 —— 改这几处即全局生效。
- **清晰度**：`theme.js` 按 `window.devicePixelRatio` 在 `<html>` 上设置 `data-dpr`（≥2 为 `2`，否则 `1`，并在 `resize` / 分辨率变化时更新）。仅当 `data-dpr="2"` 时，卡片 / 输入框 / 分段 / 下拉等使用 **0.5px 发丝线**、浅色卡片带轻微投影；非 HiDPI 下**不使用**这些效果。
- 强调色由设置写入 `:root` 的 `--color-accent`；TAB 选中、开关、按钮等统一引用。
- **Liquid Glass / 毛玻璃配色**：`[data-vibrancy='on']`（浅色）与 `[data-vibrancy='on'][data-theme='dark']`（深色）在 `constants.css` 中把 `--color-bg` 覆盖为 `transparent`，并把 `--color-surface/-2/-3` 调成**极淡的半透明白**（`0.08 / 0.12 / 0.22`）：卡片 / 输入框几乎不填色、仅留描边与极淡一层，让原生玻璃的 blur 与折射直接透出（贴近系统 Liquid Glass 应用）；同时**加深文字**（浅色 `--color-fg` 纯黑、`--color-fg-muted` 黑 55%；深色反之）保证可读性。弹层 `select-menu` 额外用 `--color-surface-3` 提高辨识度。属性由主面板 `app.js` 设置，设置窗口不设置（保持不透明）。材质明暗由主进程 `nativeTheme.themeSource`（取 `settings.theme`）控制。

**尺寸与圆角**

| 名称 | 值 |
| --- | --- |
| 面板尺寸 | 400 × 500 |
| 设置窗口尺寸 | 800 × 600 |
| `--tabbar-height` | 46px |
| `--footer-height` | 34px |
| `--term-header-height` | 22px（终端窗口头栏最小高度，刚好放下自绘小红绿灯；实际为 `max(22px, --term-header-font-size + 6px)`） |
| `--term-header-font-size` | 12px（终端窗口头栏字号，`terminal.js` 的 `applyFontSize()` 跟随终端字号改写） |
| `--term-padding-y` | 0px（终端内容与窗口四边的留白；0 = 终端铺满整个窗口） |
| `--traffic-size` / `--traffic-glyph-size` | 9px / 6px（头栏自绘小红绿灯的圆点直径与悬浮符号尺寸） |
| `--traffic-close` / `--traffic-minimize` / `--traffic-zoom` / `--traffic-inactive` | `#ff5f57` / `#febc2e` / `#28c840` / 失焦灰（浅色 `rgba(0,0,0,.18)`、深色 `rgba(255,255,255,.28)`） |
| `--radius-window` | 10px |
| `--radius-card` | 5px |
| `--radius-control` | 5px |
| `--radius-xs` | 2px |
| 间距 `--space-1..5` | 4 / 8 / 12 / 16 / 20px |

**组件**

- 输入 `field`、按钮 `btn` / `btn-accent`、图标按钮 `icon-btn`、结果行 `row-card`（目录浏览条目用 `row-card row-compact`，更紧凑）、TAB `tab` / `tab-active`、开关 `switch`、分段控件 `segment`、色块 `swatch`。
- **纵向间距统一 10px**：工具/设置分区用 `.section`（`gap: 10px`、`margin-bottom: 10px`）；结果行、输入、区块之间的间距均为 10px（不再混用 8/12/16px）。
- **统一标题**：每个工具内容区顶部由 `app.js` 渲染统一头部 `.tool-head`（标题取 `tools.<id>`、说明取 `toolDesc.<id>`）；切换 TAB 时内容区自动滚动回顶部。
- 自绘控件：下拉框 `select-trigger` / `select-menu` / `select-option`（`ShipsUI.createSelect`，替代系统 `<select>`；`.select-trigger.select-compact` 是头栏尺寸变体 —— 内边距 6px / 圆角控件值，字号与高度由 `#term-actions` 规则按头栏字号推导；终端窗口的下拉菜单由 `body.term-window .select-menu` 限定为 180px 宽、条目高度与下拉本体一致，用于终端窗口头栏里的 SSH 主机下拉）；**终端窗口自绘小红绿灯** `.traffic-light`（`.traffic-close` / `.traffic-minimize` / `.traffic-zoom`，9px 圆点 + 悬浮符号，见 §3.9-2）；悬浮提示 `ships-tip`（`ShipsUI.initTooltips`，元素加 `data-tip`，时间戳工具的偏移输入框用 `data-tip` 说明表达式语法）；JSON 覆盖式高亮编辑器 `json-editor` 与结构树 `json-tree`。
- 输入校验态：普通输入框加 `.invalid` 时描红（`border-color: var(--color-danger)`），时间戳工具的两个偏移输入框即用它表示偏移表达式非法；`.field:disabled` 半透明 + `not-allowed` 光标（IP 工具网络测试在 ICMP / ARP / 扫描主机下禁用端口输入）。
- 分段控件：`ShipsUI.segmented(options, value, onSelect, { className })` 支持选项 `disabled`（置灰不可点选，`.segment button:disabled` 透明 0.4）、`tip`（悬浮提示，配合 `data-tip`）与 `setOptions()`（原地重建，用于跟随状态变化）；`.segment-compact` 为单行多段变体（内边距 4px / 6px），设置 → 网络测试的类型切换即用它。
- 悬浮操作图标：目录浏览中**只有目录条目**用 `group` + `invisible group-hover:visible`（未悬浮时不可见，且不产生布局跳动；文件条目不加该图标）；「上次」标记用 `.chip`。
- 内嵌终端：设置 → 网络测试使用 **xterm.js**（`@xterm/xterm` + `@xterm/addon-fit`，从 `node_modules` 直接以 `<script>` / `<link>` 加载，配合 `FitAddon` + `ResizeObserver` 自适应），高度随面板伸缩（最小 200px），配色读取 `constants.css` 的 CSS 变量（`--color-bg` / `--color-fg` / `--color-accent`）；后端是 `src/main/scripts/pty-bridge.py` 创建的真实 PTY（Python 标准库，无 node-pty 原生依赖），因此终端可交互（键盘输入直通 PTY，支持 `clear` / Ctrl-C / sudo 提示）。
- 固定头部布局：`.tool-fixed`（由工具加在 `#content` 上）把内容区改为列方向 flex + `overflow: hidden`，`.tool-head` 不收缩、其后工具容器 `flex: 1 1 auto; min-height: 0`，工具自身再让列表 `flex: 1 1 0%; min-height: 0; overflow-y: auto` —— 顶部标题与工具顶栏固定，只有列表滚动。目前仅 SSH 目录浏览使用。
- 视觉点缀：不使用 emoji；SSH 探测结果直接使用 `assets/icons` 中的品牌彩色图标（Ubuntu/Fedora/Arch/CentOS/… 及 Windows），macOS 用灰色 command 图标；IP 归属地展示彩色国旗。
- **动效**：TAB 选中、分段控件、下拉菜单、开关、JSON 视图切换均有过渡 / 入场动画；工具与设置分区内容进入时带 `ships-fade-up`，下拉菜单与 TAB 选中带 `ships-pop`（详见 `styles/tailwind.css` 的 Motion 段）；SSH 目录浏览的失败反馈用 `ships-blink-error`（`.blink-error`，边框 + 底色红闪 3 次后自动移除，无文案、无重排）。
- 图标按钮与 TAB 一律通过 `data-tip` 提供悬浮说明。

**平台差异**

- 仅针对 macOS 优化（托盘定位、iTerm、登录项）；非 macOS 平台 Dock 隐藏与登录项自动跳过，托盘能力依赖 Electron 默认实现。

**主题**

- 支持浅色 / 深色 / 跟随系统；由 `data-theme` 属性与 CSS 变量驱动；跟随系统时监听 `prefers-color-scheme` 与主进程 `theme:changed`。
- 语言：`zh` / `en`，由渲染层 i18n 字典（`scripts/i18n.js`）提供；工具可 `extend` 扩展自己的文案。

---

## 12. 其余要点

- **数据位置**：应用数据在 `app.getPath('userData')`；日志 `ships.log` 同目录；SSH 配置在 `~/.ssh/config`。
- **调试开关**：`SHIPS_DEBUG=1` 或 `--debug` 输出详细日志；`SHIPS_SSH_CONFIG` 可覆盖 SSH 配置文件路径（测试用）。
- **开发辅助**：`scripts/capture.cjs` 可在 Electron 中加载真实界面、执行点击/输入并截图（环境变量 `OUT` / `SETTINGS_OUT` / `TAB` / `INPUT` / `PATCH` 等），不参与打包。
- **协议与端口提示**：应用不监听端口；SSH 默认端口 22。
