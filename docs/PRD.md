# Vessel 产品需求文档（PRD · 索引）

| 项目 | 说明 |
| --- | --- |
| 产品名称 | Vessel |
| 产品定位 | 面向开发者的 macOS 菜单栏（Tray）工具箱，点击托盘图标在下方展开轻量面板 |
| 技术栈 | Electron 44（主进程）+ Tailwind CSS 3（界面样式）+ 原生 JavaScript（渲染层，无打包器）+ ssh2（SSH 探测）+ qrcode-generator（二维码生成）+ bwip-js（Data Matrix 生成）+ electron-liquid-glass（macOS 26+ 原生 Liquid Glass，可选）+ electron-updater（自动更新）+ @xterm/xterm 与 @xterm/addon-fit（设置页内嵌终端）+ python3（PTY 桥接脚本）+ 本地 geoip.json（IP 归属地）+ EmulatorJS 4.2.3（离线内置，游戏工具） |
| 支持平台 | macOS（arm64 / x64；当前主要面向 arm64） |
| 开源许可 | **GPL-3.0-only**（见仓库根目录 `LICENSE`；第三方组件见 `THIRD_PARTY_NOTICES.md`） |
| 当前版本 | 4.19.0 |
| 发布方式 | 本地/CI 通过 `electron-builder` 打包 macOS arm64 **PKG**（`pnpm dist:mac`），安装完成后由 postinstall 自动启动；打 `v*` tag 时发布到 GitHub Releases；macOS 更新用 GitHub Releases API 检测并下载 PKG 打开安装器，Windows 走 `electron-updater` 自动安装（见 `prd/07-build-and-release.md`）；暂未签名 / 公证 |

**核心设计**：应用常驻系统托盘、不占用 Dock。主界面有**两种模式**（设置 → 应用 → 悬浮模式切换）：**窗口模式（默认）**为**固定 640×480（不可缩放）**的独立标准窗口，点托盘就在**当前桌面**显示 / 带到前台、打开期间不跨桌面跟随、**只记忆位置**（不记桌面 / 屏幕）；**悬浮模式**为托盘图标正下方弹出的 400×500 圆角面板。两种模式都以顶部 TAB 切换工具、底部显示版本与设置入口；所有输入实时反馈，无需点击“计算”按钮。

**本文档是索引**：完整行为按一级章节拆分在 `docs/prd/` 下，每个一级章节一个文件。**本索引只负责「何时该读哪个文件」与维护规则**，具体内容以对应章节文件为准。章节编号（§2、§3.9…）在所有文件里保持全局一致，旧引用无需改写。

---

## 1. 阅读指南

### 1.1 何时读哪个文件

| 文件 | 覆盖章节 | 何时阅读 |
| --- | --- | --- |
| [`prd/02-overview.md`](./prd/02-overview.md) | §2 项目概述、§2.1 架构原理（进程模型 / 项目结构 / 安全模型 / 常驻托盘） | 首次了解项目；改动主进程 / 预加载 / 渲染层边界、目录结构、安全与隔离、数据落盘策略、窗口常驻行为之前 |
| [`prd/03-flows.md`](./prd/03-flows.md) | §3 核心流程（启动、托盘显示、设置、SSH、探测、远端文件、网络测试、置顶终端、系统代理） | 改动任何用户流程、终端 / SSH / SFTP / 网络测试 / 设置联动行为之前；排查「为什么点了没反应 / 顺序不对」 |
| [`prd/04-feature-list.md`](./prd/04-feature-list.md) | §4 主要功能清单 | 新增 / 删除 / 调整工具、设置项、按钮、快捷键、默认值、禁用条件之前 |
| [`prd/05-data-and-api.md`](./prd/05-data-and-api.md) | §5 数据与接口（本地数据与加密存储、IPC 三张表、菜单与权限、本地 HTTP API） | 新增 / 修改 IPC 通道、数据结构、持久化文件、加密存储、菜单、HTTP API 之前；写对外接口说明时 |
| [`prd/06-flowcharts.md`](./prd/06-flowcharts.md) | §6 流程图（总架构、托盘、SSH 探测、设置变更、文件管理、自动更新） | 改动多步流程 / 状态机 / 时序，需要同步更新 mermaid 图之前 |
| [`prd/07-build-and-release.md`](./prd/07-build-and-release.md) | §7 构建与发布 | 改动包管理、脚本、依赖、打包文件、CI / 工作流、产物命名、签名加固、Release / 版本对齐之前 |
| [`prd/08-layout.md`](./prd/08-layout.md) | §8 主界面布局（主界面 / 设置 / 图标资源 / SSH 列表 / 终端 / 文件管理 / 更新窗口） | 改动窗口尺寸、分栏、面包屑、窗口行为、图标与资源、副窗口、快捷登录、设置界面布局之前 |
| [`prd/09-permissions.md`](./prd/09-permissions.md) | §9 权限过滤 | 改动权限来源、映射规则、界面 / 菜单可见性之前 |
| [`prd/10-connection-test.md`](./prd/10-connection-test.md) | §10 连接测试 | 改动连通性测试步骤、请求、成功判定、超时 / 失败处理之前 |
| [`prd/11-gui-spec.md`](./prd/11-gui-spec.md) | §11 GUI 与布局规范（字体 / 基础色 / 强调色、窗口层级、主壳数值、弹窗组件、平台差异） | 改动颜色、圆角、阴影、间距、字号、控件外观、动画、层级与平台差异之前 |
| [`prd/12-other.md`](./prd/12-other.md) | §12 其余要点 | 改动下载、本地数据位置、协议 / 端口提示等零散行为之前 |
| [`prd/13-games.md`](./prd/13-games.md) | §13 游戏工具（EmulatorJS） | 改动游戏工作目录、ROM 扫描 / 封面、按键映射、游戏窗口、EmulatorJS 加载与存档之前 |

> 若项目内嵌 Webview，额外维护 `docs/prd/webview.md`（注入 API、模态 / 子窗口集成）；本项目当前不使用 Webview。

### 1.2 推荐阅读路径

- **快速上手 / 定位问题**：本索引 → `02` → `03` → `04`。
- **改功能行为**：本索引 → `04` → 对应流程（`03`）→ 涉及接口（`05`）→ 流程图（`06`）→ 视觉（`08` / `11`）。
- **改接口 / 数据结构**：本索引 → `05` → `02`（安全模型）→ 对应流程（`03` / `06`）。
- **改构建 / 发版**：本索引 → `07` → `11`（平台差异）。
- **改样式 / 布局**：本索引 → `11` → `08`；颜色 / 间距常量在 `src/renderer/styles/constants.css`。
- **改游戏工具**：本索引 → `13` → `04`（工具清单）→ `05`（IPC / 数据）→ `08` / `11`（窗口与视觉）。

---

## 2. 阅读与维护规则

- **唯一事实来源 = 本索引 + `docs/prd/*.md`**：先读索引定位文件、再读对应章节、最后读代码，不凭猜测改代码。
- **改代码必须同步改文档**，不得只改其一；文档与实现不一致时**以代码为准**（先核对主进程 / 预加载 / 渲染层入口，再修文档）。
- **按一级章节拆分**：每个一级章节（§2、§3…）对应 `docs/prd/NN-slug.md` 一个文件；章节内容只写在对应文件里，不回流到索引。
- **新增章节自动拆分**：新增一级章节时，必须新建 `docs/prd/NN-slug.md`、在本索引 §1.1 表格登记（文件 / 覆盖章节 / 何时阅读），并同步 `AGENTS.md` 的「PRD 维护」规则；不得把新章节直接追加到 `docs/PRD.md`。
- **章节编号全局一致**：拆分不改章节号；文件内标题为 `# N. 标题`，子章节保持 `### N.x`，正文里的 `§x.y` 引用继续有效。
- 对外接口必须写清：**签名、可用范围、是否持久（刷新 / 重启是否丢失）、副作用条件与示例**。
- 版本号变更时，同步更新**所有文件**中的版本引用（含示例）；当前版本以本索引顶部表格为准。
- 遇到**本地网络不可达 / 授权弹窗 / 安装后 app id 与运行实例不一致**等问题，先看 `docs/FAQ.md` §1；FAQ 记录的是已验证的现象、原理、恢复步骤与测试流程。

### 2.1 变更类型 → 需同步文件

| 变更类型 | 需同步文件 |
| --- | --- |
| 新增 / 删除工具 | `prd/04-feature-list.md`、`prd/11-gui-spec.md` |
| 修改现有工具的交互 / 控件 | `prd/04-feature-list.md`、`prd/11-gui-spec.md` |
| 新增 / 修改 IPC 通道 | `prd/05-data-and-api.md`（三张表）、`prd/02-overview.md`（安全模型）、对应流程 |
| 修改窗口行为 / 尺寸 | `prd/02-overview.md`（进程模型）、`prd/04-feature-list.md`、`prd/08-layout.md`、`prd/11-gui-spec.md`、`package.json` 的 `vessel` 配置 |
| 修改设置项 | `prd/03-flows.md`、`prd/05-data-and-api.md`、`prd/04-feature-list.md` |
| 修改 SSH 相关行为 | `prd/03-flows.md`、`prd/05-data-and-api.md`、`prd/06-flowcharts.md` |
| 修改样式常量 | `prd/11-gui-spec.md`、`src/renderer/styles/constants.css` |
| 新增 / 修改图标 | `prd/08-layout.md`、`assets/icons/`（SVG）与 `assets/imgs/`（位图） |
| 修改 GeoIP / 国旗 | `prd/02-overview.md`（项目结构）、`prd/05-data-and-api.md`（`geo:lookup`）、`prd/08-layout.md`、`assets/geoip.json` / `assets/flags/` |
| 修改构建 / 脚本 / 依赖 / CI | `prd/07-build-and-release.md`、`package.json`、`pnpm-lock.yaml`、`.github/workflows/*.yml` |
| 修改 appId / 本地网络权限 / 安装位置 | `prd/03-flows.md`（§3.1 / §3.5）、`prd/07-build-and-release.md`、`docs/FAQ.md` §1 |
| 新增 / 修改游戏工具（工作目录 / 扫描 / 按键 / 窗口 / 存档 / EmulatorJS） | `prd/13-games.md`、`prd/04-feature-list.md`、`prd/05-data-and-api.md`、`prd/08-layout.md`、`prd/11-gui-spec.md`、`package.json` 的 `vessel.gameWindow` |
| 新增 / 修改 EmulatorJS 运行时 / 版本 | `prd/13-games.md`（§13.7 / §13.11）、`prd/07-build-and-release.md`、`assets/emulatorjs/` |
