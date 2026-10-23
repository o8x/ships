# 2. 项目概述

> Index: [docs/PRD.md](../PRD.md)

- **产品定位**：一个常驻 macOS 菜单栏的开发者工具箱，把高频小工具与 SSH 管理收纳进一个托盘弹出的面板。
- **技术栈**：Electron 44；界面使用 Tailwind CSS 3 编译产物 + 原生 JS（`window.Vessel*` 命名空间）；SSH 探测使用 `ssh2`；原生玻璃使用 `electron-liquid-glass`（N-API 原生插件，macOS 26+ 生效，旧系统 / 非 macOS 由主进程回退，见 §8.1）。
  - 说明：AGENTS 建议界面优先 Vue 3；当前实现选用**无打包器的原生 JS + Tailwind**，以减小体积、避免引入前端构建链，后续如需可平滑替换为 Vue 3。
- **支持平台**：macOS（Darwin）。代码通过 `process.platform` 判断，非 macOS 下托盘行为与登录项设置自动降级。
- **当前版本**：4.18.0。
- **发布方式**：通过 `electron-builder` 打包 macOS arm64 PKG 安装包，见 §7。

### 2.1 架构原理

**进程模型**

- **主进程**（`src/main/`）：创建托盘与窗口、读写本地数据、解析 `~/.ssh/config`、执行 iTerm 连接与 SSH 探测、注册 IPC。
- **预加载脚本**（`src/preload/`）：在 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: false` 下运行，用 `contextBridge` 暴露白名单 API（主面板用 `main-preload.js`，设置窗口用 `settings-preload.js`）。
- **渲染进程**（`src/renderer/`）：多个页面 —— 托盘主面板 `index.html`、设置窗口 `settings.html`、置顶终端窗口 `terminal.html`、独立文件窗口 `file-window.html`、游戏窗口 `game.html`（EmulatorJS）、更新窗口 `update.html`（下载进度 + 应用内提示框）；不含 Node 能力，仅通过 `window.ships`（能力）、`window.shipsIcons`（内部 SVG 图标）与 `window.shipsFlags`（国旗 SVG）与主进程 / 预加载通信（更新窗口用独立预加载脚本，只暴露更新相关能力）。
- **无 Webview**：不内嵌远程 Web，无 guest 进程；游戏窗口使用 `game://` 自定义只读协议加载本地页面 / EmulatorJS / ROM。

**项目结构**

```
Vessel/
├── package.json                 # 依赖、脚本、vessel 系统配置段
├── tailwind.config.js           # Tailwind：颜色/圆角/阴影/字体均映射到 CSS 变量
├── AGENTS.md                    # 客户端设计与编码约定
├── README.md                    # 英文说明（应用图标 + 简短概述，默认语言）
├── README.zh-CN.md              # 中文说明（同内容，与 README.md 顶部互相切换）
├── docs/PRD.md                  # PRD 索引（项目表 / 阅读指南 / 维护规则）
├── docs/prd/                    # 按一级章节拆分的 PRD 章节文件（02-overview.md … 12-other.md）
├── assets/
│   ├── icons/                   # 应用内部使用的 SVG 图标（kebab-case，统一由预加载读取）
│   ├── imgs/                    # 位图资源：应用图标 / 托盘 / 打包
│   │   ├── trayTemplate.png     # 托盘模板图标（18/36/54 @1x/@2x/@3x）
│   │   ├── app.png              # 应用图标（512，README 引用）
│   │   └── icon.icns            # 打包用 macOS 图标
│   ├── flags/                   # 国旗图标（`<CC>.svg` 长方形 / `<CC>_1x1.svg` 方形）
│   ├── emulatorjs/              # EmulatorJS 4.2.3 离线运行时（loader / emulator / 四个 core / compression）
│   ├── games/                   # 未打包调试用游戏工作目录（`roms/{fc,gba,n64,sfc}` + `profiles/`，不打包）
│   └── geoip.json               # IP 归属地数据库（单行大文件，由 geo-service `require`）
├── .github/workflows/build-mac.yml  # CI：构建 macOS arm64 PKG
├── scripts/                     # 构建 / 工具脚本（不打包进产物）
│   ├── capture.cjs              # 开发用 UI 截图 / 操作脚本
│   ├── dist-mac.sh              # dist:mac 包装脚本：选择签名方式
│   ├── after-pack.cjs           # electron-builder afterPack：asar 加固 + fuses + ad-hoc 签名
│   ├── adhoc-sign.sh            # 未配置正式签名时对 .app 做 ad-hoc 签名
│   ├── pkg-scripts/             # PKG 安装前退出已运行的 Vessel，安装后自动启动新版本
│   ├── notarize.cjs             # electron-builder afterSign：按需公证
│   └── gen-icons.mjs            # 零依赖 PNG / icns 图标生成脚本
└── src/
    ├── shared/constants.js      # 主进程与预加载共享：IPC 通道、窗口配置、默认设置
    ├── shared/game-constants.js # 游戏引擎 / ROM 扩展名 / 默认按键 / 窗口配置
    ├── main/
    │   ├── main.js              # 应用入口：单实例、Dock 隐藏、注册 IPC、创建托盘
    │   ├── tray.js              # 托盘图标与右键菜单
    │   ├── window-manager.js    # 主面板 / 设置窗口 / 置顶终端窗口的创建、定位、几何记忆、显隐、广播
    │   ├── ipc/                 # IPC 处理器（app / settings / window / shortcut / ssh / geo / clipboard / hash / nutrient / twofa / net-test / terminal / sftp / file-window / game / update）
    │   ├── scripts/             # pty-bridge.py（PTY 桥接，交互终端用）/ space-bridge.py（经 SkyLight 私有 API 读取实时 Space；两者打包时经 build.asarUnpack 解包到 app.asar.unpacked）
    │   ├── services/            # settings / ssh-config / ssh / iterm / terminal / sftp（文件管理 SFTP 会话）/ layout（文件管理布局）/ cd-history（cd 历史）/ vscode（用 VS Code 打开本地文件）/ space（经 space-bridge.py 读取 WindowServer 实时 Space，失败回退解析 com.apple.spaces）/ hotkey / geo / clipboard / hash / nutrient（营养成分 / TDEE 记录）/ local-network（启动时请求一次本地网络权限并保持 socket 30 秒；成功 / 失败均记日志）/ proxy（可选的系统代理 / PAC 解析、SOCKS5 / HTTP CONNECT 隧道）/ font（系统字体列表）/ totp（2FA 动态验证码，密钥加密存储）/ game（游戏工作目录扫描 / 封面 / 存档 / game:// 协议）/ updater（自动更新）服务
    │   └── utils/               # logger / json-store / paths / utf8（UTF-8 保真解码 + 非法字节转义）/ net-test（网络测试命令与校验）/ window-geometry（终端窗口几何记忆的纯计算）
    ├── preload/                 # main-preload.js / settings-preload.js / update-preload.js（更新窗口，仅暴露更新能力）/ icons.js（assets/icons/*.svg）/ flags.js（assets/flags/*.svg）
    └── renderer/
        ├── index.html           # 托盘主面板
        ├── settings.html        # 设置窗口
        ├── terminal.html        # 置顶终端窗口（含内嵌文件面板）
        ├── file-window.html     # 独立文件窗口
        ├── game.html            # 游戏窗口（EmulatorJS + 自绘控制区）
        ├── update.html          # 自动更新窗口：应用内提示框 + 下载进度 / 取消 / 重启
        ├── font-picker.html     # 字体选择子窗口（非模态，挂在设置窗口上）
        ├── scripts/             # theme / i18n / ui / registry / tool-order / app / settings / game（游戏窗口）/ terminal（置顶终端）/ terminal-files（内嵌面板宿主）/ file-manager（文件管理 UI）/ file-window（独立文件窗口）/ update（更新窗口：提示框 + 下载）/ font-picker-window（字体选择子窗口）
        │   ├── tools/           # 每个工具一个文件，注册进 ShipsToolRegistry
        │   └── settings/        # 设置分区，注册进 ShipsSettingsRegistry
        └── styles/              # constants.css（设计变量）+ tailwind.css（入口）
```

**安全模型**

- 渲染层隔离：`contextIsolation: true`、`nodeIntegration: false`；能力仅经 `contextBridge` 白名单暴露。
- 来源校验：主进程处理 SSH 连接 / 探测时**不信任渲染层传入的主机字段**，仅以 `alias` 在 `~/.ssh/config` 中查表后使用配置值（见 `ssh-ipc.js`）。
- 打开外链仅允许 `http(s)` 协议（`app:open-external`）；终端路径链接只做 Finder 定位（`app:open-path`，需绝对路径且存在，不执行文件）。
- 游戏协议：`game://app` 只允许 `src/renderer/` 与 `assets/emulatorjs/<version>/`，`game://rom|cover/<gameId>` 只解析到当前扫描结果，拒绝路径穿越；渲染层不获得任意文件读写能力。
- 数据落盘：设置与探测结果均为**非机密 JSON**，位于用户数据目录；`~/.ssh/config` 仅由用户本机维护。SSH 登录密码（可选）**以 AES-256-GCM 加密后保存在应用数据目录**（`ssh-credentials.json` + 随机密钥 `ssh-credentials.key`，均 0600），明文不落盘（见 §5.1）。2FA（TOTP）密钥同样**以 AES-256-GCM 加密保存**（`totp-accounts.json` + 随机密钥 `totp-accounts.key`，均 0600），密钥只在主进程内解密、**验证码由主进程计算**（见 §4「2FA 验证码」），明文既不落盘也不下发到渲染层。
- 日志：详细日志（`debug` 级）仅在**开发（调试）模式**输出；**开发模式 = 未打包运行（`pnpm start` / `pnpm dev` / `electron .`，`app.isPackaged === false`），安装后的 `pkg` / `.app` 一律为生产模式**；环境变量 `VESSEL_DEBUG=1`（兼容旧 `SHIPS_DEBUG`）或 `--debug` 仅作为手动覆盖。**开发模式下每条日志同时写到当天的日志文件与控制台（同一条只输出一次，不重复）**，生产模式仅写文件；控制台统一格式为 `<ISO 时间> [级别] 内容`（`file()` 的流程日志为 `<ISO 时间> [模块] 内容`），不再输出无时间戳的 `[vessel] …` 行；`info` / `warn` / `error` 始终写入当天日志文件；启动时始终打印数据文件清单与绝对路径。macOS 下日志写到 `~/Library/Logs/Vessel`，**Console.app 的「日志报告」会直接收录**，因此**不再做统一日志同步**；可在 **设置 → 日志** 配置**保留天数**（默认 7）并打开日志文件夹 / 控制台 App。
- 登录项：仅在值发生变化时调用 `app.setLoginItemSettings`，避免无意义报错。

**来源标识注入 / 常驻与托盘**

- 不涉及来源标识注入（无 Webview）。
- 常驻托盘：`app.dock.hide()`（由 `vessel.showDockIcon` 控制）后仅保留 Tray；`window-all-closed` 不退出应用；主面板关闭（隐藏）不影响进程。

---
