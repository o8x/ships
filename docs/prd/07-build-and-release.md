# 7. 构建与发布

> Index: [docs/PRD.md](../PRD.md)

- **包管理**：`pnpm`（锁文件 `pnpm-lock.yaml`）。安装：`pnpm install --frozen-lockfile`。
- **脚本**（`package.json`）：
  - `build:css`：Tailwind 编译 `src/renderer/styles/tailwind.css` → `tailwind.build.css`（压缩）。
  - `watch:css`：监听模式。
  - `start`：先 `build:css` 再 `electron .`。
  - `dev`：直接 `electron .`（需已有构建产物）。
  - `postinstall`：安装后自动 `build:css`。
  - `dist:mac`：执行 `scripts/dist-mac.sh` —— 先清理旧 `release/` 再 `build:css`，自动选择签名身份并 `electron-builder --mac --arm64 --publish never`（实际调用 `npx electron-builder`），产出 **PKG**；`--publish never` 时发布由 CI 完成（见下）。
  - `pack:mac`：同上但加 `--dir`，仅产出 `.app`（调试用）。
- **打包配置**（`package.json` 的 `build` 段，electron-builder）：
  - `appId = cn.com.stdout.vessel`，`productName = Vessel`；产物目录 `release/`。**appId 是本地网络授权的键**：更换 appId 会得到一条全新的未授权记录；当前正式 appId 保持为 `cn.com.stdout.vessel`，不要随意改（旧 `com.ships.app` 的授权记录仍在系统里，但不影响新 id）。改名 / 改 id 还会触发 Installer 的重定位行为与「运行实例 id 不一致」，处理步骤见 `docs/FAQ.md` §1。
  - `publish`：`[{ provider: 'github', owner: 'o8x', repo: 'vessel' }]`；macOS 检测更新不依赖 `latest-mac.yml`，使用 `package.json` 的 `vessel.updateRepo`（不会被 electron-builder 裁剪）调用 GitHub Releases API。
  - `files`：`src/**/*`、`assets/**/*`、`package.json`；依赖由 electron-builder 自动收集（`asar: true`）—— 渲染层直接从 `node_modules/@xterm/…` 加载终端资源，因此 `@xterm/xterm` 与 `@xterm/addon-fit` 放在 `dependencies`（不是 devDependencies）；`electron-updater` 同样放在 `dependencies`。
  - **原生依赖 `electron-liquid-glass`**：N-API 预编译（含 `darwin-arm64` / `darwin-x64`），故 `npmRebuild: false` 无需重编；`build.asarUnpack` 把 `**/*.node` 与 `node_modules/electron-liquid-glass/**` 解包到 `app.asar.unpacked` 供加载（Liquid Glass 仅运行时 macOS 26+ 生效，旧系统由主进程回退）。
  - **`build.asarUnpack` 另含 `src/main/scripts/*`**：`pty-bridge.py` / `space-bridge.py` 要作为文件被 `python3` 打开，而 `app.asar` 是归档不是目录（否则打包后报 `can't open file '…/app.asar/src/main/scripts/pty-bridge.py': [Errno 20] Not a directory`），解包后由 `terminal-service` 把路径改写到 `app.asar.unpacked` 再 `spawn`。
  - `npmRebuild: false`（`ssh2` 使用纯 JS 回退，无需重编原生模块）。
  - `compression: 'maximum'`；`electronLanguages: ['en', 'zh_CN']`（仅保留中英文 Electron 语言包，剔除约 220 个语言包、解包体积减少约 48MB）。
  - `mac.target`：**仅 arm64 的 pkg**。`build.pkg` 固定安装到 `/Applications`（`installLocation`），禁止安装到任意位置 / 当前用户 Home，`isRelocatable = false`；`pkg.scripts = ../scripts/pkg-scripts`：`preinstall` 先在登录用户会话中让已运行的 Vessel（以及旧名 Ships）正常退出（5 秒未退出则强制结束），并删除旧的 `/Applications/Ships.app`；替换完成后 `postinstall` 在登录用户会话中 `open /Applications/Vessel.app` 自动启动新版本。不产出 dmg / zip / `latest-mac.yml`。`mac.icon = assets/imgs/icon.icns`；`hardenedRuntime = true`、`gatekeeperAssess = false`；`extendInfo` 含 `LSUIElement = true`（纯菜单栏 Agent，无 Dock）与 `NSLocalNetworkUsageDescription`（本地网络授权说明）。**`afterPack` 会把同一个 `NSLocalNetworkUsageDescription` 写入 4 个 Helper bundle 的 `Info.plist`**（`Vessel Helper` / `.helper` / `.helper.Renderer` / `.helper.GPU` / `.helper.Plugin`）：macOS 会把部分 Electron 网络流量归属到 helper，缺少该 key 的 helper 会被静默默认拒绝且永不弹窗。
- **签名 / 公证（打包时自动）**：
  - 由 `scripts/dist-mac.sh` 判断：设置了 `CSC_LINK` / `APPLE_ID` / `CSC_NAME` 之一 → 视为**正式签名**，交给 electron-builder 在打包阶段用 Developer ID 签名 `.app`；PKG 安装器签名需要额外的 **Developer ID Installer** 证书（缺失时产出的 PKG 未签名，但可安装）。否则设 `CSC_IDENTITY_AUTO_DISCOVERY=false`（避免误用钥匙串里的无关证书而失败）。
  - **ad-hoc 兜底**：`afterPack` 钩子 `scripts/after-pack.cjs` 调用 `scripts/adhoc-sign.sh`：仅当未配置正式签名（同上三个环境变量都为空）时执行 `codesign --force --deep --sign -` 并对 `.app` 校验，保证**未签名环境下应用仍可运行**；配置了正式签名时跳过，以免覆盖。
- **打包加固**（`afterPack` 内，顺序固定：**asar → 二进制 → helper Info.plist → 签名**）：
  - **asar 保护**：用 `asarmor` 给 `app.asar` 打 **bloat 补丁**（约 100GB 假条目），使 `asar extract` 解包时写出大量数据而失败（现代 `asar` 已使传统补丁失效，故采用 bloat 策略）。
  - **Electron Fuses**（`@electron/fuses`）：`RunAsNode=false`、`EnableNodeOptionsEnvironmentVariable=false`、`EnableNodeCliInspectArguments=false`、`EnableCookieEncryption=true`、`OnlyLoadAppFromAsar=true`；`EnableEmbeddedAsarIntegrityValidation=false`（与 asar 改写冲突）。
  - 加固依赖 `asarmor`、`@electron/fuses` 位于 `devDependencies`。
  - **公证**：`afterSign` 钩子 `scripts/notarize.cjs`，当设置 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` 时自动公证（`SKIP_NOTARIZE=1` 可跳过）。
  - 产物命名：`Vessel-v<version>-<arch>.pkg`；无 blockmap / latest-mac.yml。
- **更新流程（`src/main/services/updater-service.js`）**：
  - **版本检测**：macOS 调用 GitHub Releases API（`releases/latest`，仓库来自 `vessel.updateRepo`），Windows 仍用 `electron-updater`。**仅打包后**的 macOS / Windows 生效（`app.isPackaged`）；开发模式不检查。启动后**静默检查一次**（延迟 5s，不打扰）。
  - **提示后下载**：`update-available` → 应用内提示框（复用更新窗口）「发现新版本 vX（当前 vY），现在下载吗？」→ 确认才下载。**所有更新相关提示（发现新版本 / 已是最新 / 暂时无法检查 / 下载失败 / 开发模式不检查）都不再使用系统 `dialog.showMessageBox`**，统一由更新窗口渲染（标题 + 消息 + 按钮，`Esc` = 取消）；提示结束后若没有下载任务，窗口自动关闭。
  - **下载方式按平台分两种模式**（`dl.mode`）：
    - **macOS（`mode=pkg`）**：GitHub Releases API 返回的最新版本里选出与当前架构匹配的 `.pkg`；用 **Node 原生 `http(s)`** 流式下载到 `app.getPath('downloads')`（手动跟随重定向），可取消（`destroy` + 删除半成品）。**不用 Electron `net`**：`net` 走 Chromium 网络栈会触及加密 Cookie 存储（打包时翻转了 `EnableCookieEncryption` fuse），从而弹出 macOS「钥匙串」授权框；Node 原生请求不碰 Chromium 会话 / Cookie，因此更新检查与下载都不会再触发该弹框。**`owner` / `repo` 取自 `package.json` 的 `vessel.updateRepo`**；产物前缀固定取应用名 `Vessel`（`APP_NAME`）。**不依赖 Squirrel / 签名**，因此 ad-hoc 构建也能更新。开启「遵循系统代理」（§3.10）时，这些 Node `http(s)` 请求会按系统代理 / PAC 走 SOCKS5 或 HTTP CONNECT；代理失败时回退直连。
    - **Windows（`mode=auto`）**：仍用 `electron-updater` 的 `downloadUpdate()` 自动下载并 `quitAndInstall()`（`autoInstallOnAppQuit=true`；6 秒未退出则 `app.relaunch()` + `app.quit()` 兜底）。
  - **下载窗口**：确认下载后弹出一个**小型、不可关闭（`closable: false` + 系统关闭按钮禁用，仅退出应用时放行）、可最小化、置顶居中的前台窗口** `update.html`（尺寸 `vessel.updateWindow` = 380 × 150，见 §8.7）。窗口采用 **`titleBarStyle: 'hiddenInset'`**：**真正的系统红绿灯**与标题同一行，**只有「最小化」可用**（关闭 / 缩放禁用）。窗口还有：**实时进度条**（`update:progress`）、**取消**、**安装按钮**（下载期间禁用）。下载完成后按钮可用并显示 **60 秒倒计时**（常量 `UPDATE_COUNTDOWN_SECONDS`）；**macOS 按钮为「退出并安装」**（`open` 打开 PKG 系统安装器，随后退出本程序；安装完成后 PKG 的 postinstall 会重新启动 Vessel；倒计时文案「N 秒后自动退出并打开安装器」），**Windows 按钮为「重启更新」**（`quitAndInstall()`）。**取消 = 退出本次更新**（下载阶段中止下载并删除半成品；点击安装 / 倒计时到 0 后取消按钮禁用）。**注意**：macOS 上 `closable: false` 的窗口会让 `app.quit()` 卡住（窗口永不被关闭），因此退出时（`before-quit`）会对更新窗口 `setClosable(true)` 放行，保证能真正退出。
  - **下载失败**：仅在日志记录详细错误，并在当前更新窗口内显示应用内提示（不再弹系统对话框）。
  - **手动检查**：设置 → 应用 → 关于「检查更新」（`app:check-updates`）触发，会用应用内提示框提示「已是最新 / 暂时无法检查」；**每次点击都必须有反馈**（有新版本同样会重新弹窗，反复点击不会静默无响应）；检查进行中再次点击返回 `{ ok: true, checking: true }`，界面就地提示「正在检查…」。**出错时不报技术错误**：手动检查给一句友好提示（详情写日志），启动时的静默检查出错则完全不提示。
  - **说明**：macOS 的 Squirrel 自动安装需要稳定 **Developer ID 签名**，本项目默认 ad-hoc 签名，故改用 PKG + 系统安装器；发布仅含 `*.pkg`，更新检测通过 GitHub API 完成。
  - **签名要求**：正式分发建议同时配置 Developer ID Application（.app）与 Developer ID Installer（.pkg）；未签名 PKG 仍可手动安装，但会触发系统安全提示。
- **图标生成**：`node scripts/gen-icons.mjs` 在 `assets/imgs/` 生成 `trayTemplate*.png`、`app.png`，在 macOS 上经 `iconutil` 额外生成 `icon.icns`。
- **CI**（`.github/workflows/build-mac.yml`）：在 `macos-14` 上以 **pnpm 10 / Node 22** 安装并执行 `pnpm dist:mac`；签名/公证由 secrets 提供（`CSC_LINK` / `CSC_KEY_PASSWORD` / `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`，缺省则未签名构建）；上传 `*.pkg` 为 artifact；打 `v*` tag 时把 PKG 发布到 GitHub Release（供更新下载）。
- **版本对齐**：`package.json` 版本、`docs/PRD.md` 索引里的“当前版本”与产物文件名中的版本号保持一致。

---
