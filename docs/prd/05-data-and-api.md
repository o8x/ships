# 5. 数据与接口

> Index: [docs/PRD.md](../PRD.md)

### 5.1 本地数据与加密存储

| 文件 | 位置 | 结构 | 生命周期 |
| --- | --- | --- | --- |
| `settings.json` | `app.getPath('userData')`（macOS：`~/Library/Application Support/vessel/settings.json`） | `{ locale, theme, accent, launchAtLogin, floatMode, pinWindow, vibrancy, glassOpacity, developerMode, clipboardLimit, clipboardPollMs, terminalShell, terminalFontFamily, terminalFontSize, terminalWindowWidth, terminalWindowHeight, terminalAlwaysOnTop, terminalScrollback, mainWindowHotkey, terminalHotkey, terminalCloseAction, sshBuiltinTerminal, followSystemProxy, sftpDownloadDir, terminalBallEnabled, terminalBallDelayMs, terminalBallSize, terminalBallIcon, terminalBallDark, terminalBallTransparent, fileWindowAlwaysOnTop, logRetentionDays }` | 持久；重启保留 |
| `vessel-YYYY-MM-DD.log` | **macOS：`~/Library/Logs/Vessel/`**（Console.app 的「日志报告」会收录该目录，与 JetBrains/CLion 一致，与用户数据目录分离）；其它平台：`app.getPath('userData')` 的 `logs/` 子目录（`src/main/utils/paths.js` 的 `LOG_DIR`，按 `process.platform` 选择） | 按天追加的文本日志（启动信息、SSH 探测 / SFTP / 终端 / 文件管理等）；启动时把数据文件清单也写进去 | 持久；**惰性清理**：每天首次写日志时删除保留期之前的日志文件（保留天数取设置 `logRetentionDays`，默认 **7 天**，来自 `package.json` 的 `vessel.logRetentionDays`） |
| `ssh-detected.json` | 同上目录 | `{ [alias]: { os, family, label, at } }` | 持久；缓存探测结果 |
| `ssh-credentials.json` | 同上目录 | `{ entries: { [别名]: { iv, tag, data } } }`（**AES-256-GCM 密文**，全 base64） | 持久；在设置里保存 / 清除 SSH 密码时更新。密钥随机生成、存 `ssh-credentials.key`（0600）；密码明文不落盘，连接时主进程解密后交给内置终端自动输入（见 §3.4） |
| `ssh-credentials.key` | 同上目录 | base64 的 32 字节随机密钥（0600） | 持久；首次存密码时生成，用于加解密 `ssh-credentials.json` |
| `totp-accounts.json` | 同上目录 | `{ accounts: [{ id, title, subtitle, period, digits, algorithm, secret: { iv, tag, data } }] }`（**TOTP 密钥为 AES-256-GCM 密文**，全 base64；标题 / 副标题 / 参数为明文）。`algorithm` ∈ `SHA1`（默认）/`SHA256`/`SHA512`，`period` 默认 30（1–600），`digits` ∈ 6（默认）/8 | 持久；2FA 工具添加 / 删除账号时更新。密钥随机生成、存 `totp-accounts.key`（0600）；密钥明文不落盘，验证码由主进程解密后计算（见 §4「2FA 验证码」） |
| `totp-accounts.key` | 同上目录 | base64 的 32 字节随机密钥（0600） | 持久；首次存 2FA 账号时生成，用于加解密 `totp-accounts.json` |
| `main-window.json` | 同上目录 | `{ x, y }`（**窗口模式**主窗口位置；兼容旧版 `{ bounds: { x, y, width, height } }`，只取 x / y；**不记录桌面 / 屏幕 / 尺寸**） | 持久；拖动后防抖 400ms 与关闭前写入；下次显示应用到当前鼠标所在屏幕并夹回工作区，无记录则居中；「清理数据」可删除 |
| `terminal-window.json` | 同上目录 | `{ display: { id, scaleFactor, bounds: { x, y, width, height } }, bounds: { x, y, width, height } }`（置顶终端窗口最近一次的所在屏幕 + 位置 + 尺寸） | 持久；打开 / 拖动 / 缩放 / 关闭时写入（含「实际生效」的几何，恢复时被夹取过也记夹取后的值）；同一块屏幕再次打开即沿用，换屏 / 拔屏 / 无记录则改用默认尺寸居中 |
| `file-window.json` | 同上目录 | 同 `terminal-window.json` 的结构（独立文件窗口的屏幕 + 位置 + 尺寸） | 持久；记忆方式与终端窗口一致 |
| `file-layout.json` | 同上目录 | `{ treeWidth, name, size, perm, time, panelHeight, sortKey, sortDir }`（**内嵌面板**的目录树宽、文件名 / 体积 / 权限 / 时间列宽、面板高度，单位 px；默认 `300 / 160 / 60 / 90 / 130 / 260`；`time` 默认 130 是**默认值**，最小可拖到 60；`sortKey` ∈ `''`（不排序）/`name`/`size`/`time`、`sortDir` ∈ `asc`/`desc`） | 持久；拖动分隔线 / 列宽、点击列头排序时写入；**有记录时不再套用首次的最小布局**（§3.9-10） |
| `file-window-layout.json` | 同上目录 | 同 `file-layout.json` 结构（**独立文件窗口**自己的布局记录，与内嵌面板**分开保存**） | 持久；独立窗口拖动分隔线 / 列宽时写入 |
| `nutrient-records.json` | 同上目录 | `{ products: { [name]: { name, energy, protein, fat, carbohydrate, sodium, total, savedAt } }, tdee: { sex, age, height, weight, activity, bmr, tdee, savedAt } 或 null }`（商品名去重、同名覆盖；TDEE 保存输入与计算结果） | 持久；营养成分工具保存商品 / TDEE 变化时写入 |
| `cd-history.json` | 同上目录 | `{ [“用户名@主机”]: string[] }`（文件面板每个 ssh 目标最近 cd 到的远端目录，去重、越新越靠前、最多 `CD_HISTORY_MAX` = 10 条） | 持久；仅记录通过 cd 到达的目录（终端跟随 / `cd 到此目录` 按钮 / 点历史条目），手动浏览不记录；「清理数据」可删除 |
| 剪贴板历史 | 内存（不落盘） | 最近 5 条 `{ id, type, text?, thumb?, width?, height?, truncated?, at }` | 随进程退出丢失 |
| `~/.ssh/config` | 用户主目录 | 标准 OpenSSH 配置；**分组用一行注释 `# group: <名称>` 标记**（紧随其后的 Host 属于该分组，直到下一个标记；未标记的属「未分组」；ssh 忽略注释，不影响连接） | 由设置内 SSH 管理读写；未加密（非机密） |

- 机密数据：**默认不保存密码**；仅当用户在设置 → SSH 主动填写登录密码时，密码以 **AES-256-GCM 加密**保存在 `ssh-credentials.json`（密钥 `ssh-credentials.key`，均 0600），明文不落盘。2FA（TOTP）密钥同理由用户主动添加，以 **AES-256-GCM 加密**保存在 `totp-accounts.json`（密钥 `totp-accounts.key`，均 0600），明文不落盘、且不下发到渲染层（验证码在主进程计算）。导出备份文件时密码为**明文**（用户自行保管）。SSH 私钥仍由用户自行管理与使用，不复制、不落盘到应用数据目录。
- 设置默认值来自 `package.json` 的 `vessel.defaultLocale/defaultTheme/defaultAccent`。
- **从 Ships 更名升级**：打包版首次启动时，若新数据目录不存在，会把旧 `~/Library/Application Support/ships` 重命名为新目录，并把旧 `~/Library/Logs/Ships` 重命名为 `~/Library/Logs/Vessel`；目标已存在时不覆盖。
- 启动时打印数据文件清单与绝对路径（`src/main/utils/paths.js` → `describeDataFiles`）。

### 5.2 IPC 通道

**invoke（渲染 → 主，返回 Promise）**

| 通道 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `app:info` | — | `{ version, platform, arch, systemLocale, dataDir, dataFiles, terminalScrollback }` | 版本取 `package.json`；`terminalScrollback` 取 `vessel.terminalWindow.scrollback` |
| `app:list-fonts` | — | `{ ok, fonts?, error? }`（`fonts: [{ family, mono }]`） | 通过 AppKit `NSFontManager`（`osascript -l JavaScript`）读取系统已安装字体家族，并标记是否为等宽字体；**等宽字体排在前面**，同组按名称排序，结果缓存。供字体选择子窗口使用。仅 macOS |
| `font-picker:open` | — | `{ ok }` | 打开设置窗口的非模态字体选择子窗口（`font-picker.html`）；已打开时聚焦现有窗口 |
| `app:open-data-folder` | — | `{ ok, error? }` | 打开数据目录 |
| `app:open-log` | — | `{ ok, error? }` | 打开**日志文件夹**（macOS：`~/Library/Logs/Vessel`；不存在则创建；**只打开文件夹，不打开日志文件**） |
| `app:open-console` | — | `{ ok, error? }` | 打开 macOS 系统「控制台」App（`/System/Applications/Utilities/Console.app`，缺失时退回 `/Applications/Utilities/Console.app`）；非 macOS 返回 `{ ok: false, error: 'unsupported' }`；由设置 → 日志的「打开控制台 App」按钮调用 |
| `app:clear-data` | — | `{ ok }` | 一键清理**非业务数据**：删除 `main-window.json`、`terminal-window.json`、`file-window.json`、`file-layout.json`、`file-window-layout.json`、`cd-history.json`（窗口位置 / 尺寸、列宽 / 面板高度、cd 历史）；**不动** `settings.json`、日志与 `~/.ssh/config`；由设置 → 应用 的「清理数据」（二次确认后）调用 |
| `app:open-external` | `url` | `{ ok, error? }` | 仅允许 `http(s)` |
| `app:open-path` | `target` | `{ ok, error? }` | 终端路径链接：展开 `~`、校验绝对路径且存在，然后 `shell.showItemInFolder` 在 Finder 中定位（不执行文件 / 不启动 .app） |
| `app:copy-image` | PNG data URL | `{ ok, error? }` | 把 PNG 图片写入系统剪贴板（Electron 44：`new ClipboardItem({ 'image/png': Blob })` + `await clipboard.write([…])`）；仅接受 `data:image/png;base64,` 前缀；编码转换工具的二维码「复制」用 |
| `app:save-image` | `{ dataUrl, name? }` | `{ ok, path?, canceled?, error? }` | 保存对话框把 PNG data URL 存为本地文件（默认名 `qrcode.png`）；编码转换工具的二维码「下载到本地」用 |
| `app:check-updates` | — | `{ ok, checking?, error?, message? }` | 设置 → 应用 → 关于 的「检查更新」：触发一次自动更新检查（`updater-service`）。**每次手动检查都会给出反馈**（有新版本 / 已是最新 / 暂时无法检查 / 开发模式不检查，均由**应用内提示框**即更新窗口显示），反复点击不会静默无响应；检查进行中再次点击返回 `{ ok: true, checking: true }`，设置页就地提示「正在检查…」。**失败只给一句友好提示，不暴露技术错误**，详情写日志；`message` 字段为向后兼容保留（界面不再重复显示，提示统一走更新窗口） |
| `update:state` | — | `{ phase, mode, version, percent, transferred, total, bytesPerSecond, countdown, prompt }` 或 `null` | 更新窗口查询当前状态（`phase` ∈ `idle` / `downloading` / `downloaded`；`prompt` = 待处理的提示框 `{ id, title, message, buttons, defaultId, cancelId }` 或 `null`，窗口加载完成时据此补显示）；只接受来自**更新窗口**的请求 |
| `update:cancel` | — | `{ ok }` | 下载窗口「取消」：下载阶段中止下载（`CancellationToken`），已完成则停止倒计时、不立即重启（退出本次更新）；只接受来自更新窗口的请求 |
| `update:install` | — | `{ ok }` | 下载窗口「重启更新」：`quitAndInstall()` 立即重启并安装；只接受来自更新窗口的请求 |
| `update:choice` | `{ id, index }` | `{ ok }` | 应用内提示框：渲染层回传用户点击的按钮下标（`id` 由主进程下发）；`id` 过期 / 不匹配返回 `{ ok:false }`，只接受来自更新窗口的请求 |
| `settings:get` | — | `settings` | |
| `settings:set` | `patch` | 合并后的 `settings` | 副作用：写盘 + 广播 + 可能修改登录项 |
| `ssh:list` | — | `{ hosts, detected }` | 读 `~/.ssh/config`；每个 host 含 `group`（分组名，未分组为 `''`）与 `hasPassword`（是否已存密码，见 §5.1）字段 |
| `ssh:edit` | `{ alias }` | `{ ok, error? }` | 主面板 SSH 条目的编辑图标：隐藏主面板、打开设置窗口的 SSH 分区，并让该主机直接进入编辑表单（设置窗口未打开时等渲染层挂载后再发 `settings:edit-ssh`）；别名缺失返回错误 |
| `ssh:connect` | `{ alias, inTerminal? }` | `{ ok, command?, error? }` | 按 alias 查表并拼 `ssh …`：`inTerminal: true`（终端窗口头部的 SSH 下拉）**强制注入当前置顶终端窗口**、不受 `sshBuiltinTerminal` 影响；省略时按 `settings.sshBuiltinTerminal` 决定走置顶终端或 iTerm |
| `ssh:detect` | `{ alias }` | `{ queued }` | 异步，结果经 `ssh:detected` 回传（兼容保留） |
| `ssh:detect-host` | `{ alias?, hostName, user?, port?, identityFile?, proxyJump?, password?, useStoredPassword? }` | `{ ok, alias, info }` | 对任意主机（可尚未保存）同步探测，结果写入缓存并广播。**支持密码认证**：用 `password`（表单填的明文密码）优先，为空且 `useStoredPassword !== false` 时回退到该别名已保存的加密密码（主进程解密后用于这次探测，不外传） |
| `ssh:get-detected` | — | `{ [alias]: { os, family, label, at } }` | 读取探测缓存 |
| `terminal:open` | — | `{ ok }` | **新开**一扇置顶终端窗口（落在当前桌面；不复用 / 不拉取别的桌面的窗口，§3.9） |
| `terminal:start` | `{ cols, rows }` | `{ ok, id, cols, rows, shell }` | 新建交互终端会话（真实 PTY + 默认登录 shell） |
| `terminal:input` | `{ id, data }` | `{ ok }` | 把 xterm 的键盘输入写进 PTY |
| `terminal:resize` | `{ id, cols, rows }` | `{ ok }` | 同步 PTY 尺寸（`TIOCSWINSZ`） |
| `terminal:interrupt` | `{ id }` | `{ ok }` | 向终端发送 Ctrl-C |
| `terminal:kill` | `{ id }` | `{ ok }` | 结束会话 |
| `terminal:copy-text` | `{ text }` | `{ ok }` | 右键快速编辑「复制」：把文本写入系统剪贴板（`clipboard.writeText`）；空文本返回 `{ ok: false }`；只接受来自终端窗口本身的请求 |
| `terminal:paste-text` | — | `{ ok, text }` | 右键快速编辑「粘贴」：读取系统剪贴板文本返回给渲染层，由 `term.paste()` 注入 shell；只接受来自终端窗口本身的请求 |
| `terminal:ball-restore` | — | `{ ok }` | 悬浮球点击：把该终端窗口从圆形小窗放大回原窗口（恢复 bounds / 最小尺寸 / 可缩放 / 置顶并 `focus`，见 §3.9-12）；只接受来自该终端窗口本身的请求 |
| `sftp:connect` | `{ target, username?, host?, port?, auth?: 'password' \| 'key', password?, identityFile? }` | `{ ok, id?, home?, target?, error?, code? }` | 新建一条 SFTP 会话。`target` = ssh 目标 token（命中 `~/.ssh/config` 时用记录里的 host / port / user / IdentityFile；ProxyJump 返回 `proxyjump`）。独立文件窗口还可传手动字段：`host` / `username` / `port` **显式字段优先于 config**；`auth: 'password'` 用 `password` 认证（**仅用于本次连接，不持久化**），`auth: 'key'` 用 `identityFile`（留空用 config / `~/.ssh/id_ed25519`）。返回会话 `id`（内嵌面板与独立窗口各持一个）；`code` ∈ `proxyjump`/`auth`/`timeout`/`sftp`/`connect`/`no-target`；只接受来自终端窗口或独立文件窗口的请求 |
| `sftp:list` | `{ id, path? }` | `{ ok, path, parent, home, entries?, code?, error? }` | 列远端目录（`entries[]` = `{ name, type: dir\|file\|link, size, mtime, mode }`，目录在前；`mode` 为 st_mode，用于渲染权限列）；`path` 省略 / `~` 取家目录；会话不存在返回 `code: 'not-connected'` |
| `sftp:download` | `{ id, path }` | `{ ok, path?, name?, error? }` | 下载远端文件到设置的下载目录（重名自动加 ` (n)`），返回本地绝对路径；过程中经 `sftp:progress` 回传进度 |
| `sftp:open` | `{ id, path }` | `{ ok, path?, name?, error? }` | 右键「从文件夹打开」：先下载（同 `sftp:download`，含进度回传），成功后由主进程 `shell.showItemInFolder` 在系统文件管理器中定位该文件；只接受来自终端窗口或独立文件窗口的请求 |
| `sftp:open-vscode` | `{ id, path }` | `{ ok, path?, name?, error? }` | 右键「从 VS Code 打开」：先下载（同 `sftp:download`，含进度回传），成功后由主进程用 **Visual Studio Code** 打开该文件（优先 `code` CLI，否则 `open -b com.microsoft.VSCode`）；打开失败返回 `{ ok: false, error }`；只接受来自终端窗口或独立文件窗口的请求 |
| `sftp:upload` | `{ id, localPath, remoteDir }` | `{ ok, name?, path?, error? }` | 把本地文件上传到远端目录（`remoteDir` 省略 / `~` 取家目录），同名覆盖；过程中经 `sftp:progress` 回传进度 |
| `sftp:close` | `{ id }` | `{ ok }` | 关闭指定 SFTP 会话（切换 ssh / 窗口销毁时调用） |
| `sftp:transfer-command` | `{ id, paths, recursive? }` | `{ ok, command?, error? }` | 生成把远端文件 / 目录传回本地下载目录的 `scp` 命令（`paths` 为数组，支持多选 → 多个源；目录加 `-r`，端口 22 / 默认私钥省略，远端路径加引号），**并写入系统剪贴板**；只接受终端窗口 / 独立文件窗口的请求 |
| `sftp:copy-path` | `{ paths }` | `{ ok, paths?, error? }` | 右键「复制路径」：把选中的远端绝对路径写入系统剪贴板（`paths` 为数组，多条按换行）；空数组返回 `{ ok: false }`；只接受终端窗口 / 独立文件窗口的请求 |
| `sftp:copy-text` | `{ text }` | `{ ok, error? }` | 文件列表 Cmd / Ctrl + C：把选中行导出的 CSV 文本写入系统剪贴板；空文本返回 `{ ok: false }`；只接受终端窗口 / 独立文件窗口的请求 |
| `cd-history:list` | `{ id }` | `{ ok, entries }` | 读取该 SFTP 会话所属 ssh 目标（`用户名@主机`）的 cd 历史；会话不存在 / 未连接返回空数组 |
| `cd-history:add` | `{ id, path }` | `{ ok, entries }` | 记录一次 cd 到的远端目录（去重、越新越靠前、最多 10 条，写 `cd-history.json`）；只接受终端窗口 / 独立文件窗口的请求 |
| `file-window:open` | `{ target?, path? }` | `{ ok }` | 打开 / 聚焦独立文件窗口；`target` 省略沿用上次目标，传**空串** = **不选中任何连接**（主面板「文件管理」按钮用），传别名 = 自动连接该主机（SSH 管理 `folder` 图标用）；`path` = 连接后要进入的初始目录（内嵌面板「分离为独立窗口」带过去当前目录）。已存在时把 `{ target, path }` 经 `file-window:target` 发过去 |
| `file-window:info` | — | `{ ok, target, path, settings }` | 独立文件窗口启动时读取初始目标 / 初始目录与当前设置；只接受来自该窗口的请求 |
| `file-window:close` | — | `{ ok }` | 销毁独立文件窗口（自绘红绿灯关闭按钮）；只接受来自该窗口的请求 |
| `file-window:set-top` | `{ value: boolean }` | `{ ok, alwaysOnTop }` | 独立文件窗口的置顶开关：写 `settings.fileWindowAlwaysOnTop`；**默认关**（普通窗口），持久 |
| `file-window:snap-size` | `{ height }` | `{ ok, height? }` | 保留兼容：独立文件窗口已**不再自动对齐整行高度**，渲染层不再调用；通道仍按工作区 / 最小高度夹取后设置内容高度；只接受来自该窗口的请求 |
| `files-layout:get` | — | `{ treeWidth, name, size, time, panelHeight }` | 读取文件管理布局（`file-layout.json`） |
| `files-layout:set` | `{ ...patch }` | 合并后的布局 | 合并写入文件管理布局（拖动分隔线 / 列宽时调用） |
| `terminal:export` | `{ text, name? }` | `{ ok, path?, canceled?, error? }` | 保存对话框 + 把终端文本写入本地文件 |
| `terminal:open-iterm` | — | `{ ok, command?, error? }` | 在 iTerm 中重放最后注入的命令并关闭终端窗口 |
| `terminal:set-top` | `{ value: boolean }` | `{ ok, alwaysOnTop }` | 终端窗口头部图钉：写 `settings.terminalAlwaysOnTop`，由 `window-manager` 的 settings 监听调 `setAlwaysOnTop(true, 'screen-saver')` / `setAlwaysOnTop(false)`；持久，下次打开沿用 |
| `shortcut:set` | `{ target: 'main' \| 'terminal', hotkey: string }` | `{ ok, hotkey, error? }` | 设置 → 快捷键 改绑主窗口 / 终端快捷键：先试注册（空串 = 注销），**成功才写 `settings.mainWindowHotkey` / `settings.terminalHotkey`**；失败返回 `{ ok: false, error }`（`unavailable` = 已被占用，`invalid-target` = target 非法）并保持原值 |
| `terminal:reset` | — | `{ ok, settings }` | 设置 → 终端 →「重置」：把终端相关设置（`terminalShell`/`terminalFontSize`/`terminalScrollback`/`terminalWindowWidth`/`terminalWindowHeight`/`terminalAlwaysOnTop`/`terminalCloseAction`/`sshBuiltinTerminal`/`sftpDownloadDir`/`terminalBallEnabled`/`terminalBallDelayMs`/`terminalBallSize`/`terminalBallIcon`/`terminalBallDark`/`terminalBallTransparent`）恢复为 `package.json` 里的默认值，并删除 `terminal-window.json`（记住的屏幕 / 位置 / 大小）；返回重置后的完整设置 |
| `terminal:destroy` | — | `{ ok }` | 会话结束后销毁终端窗口（渲染层在 shell `exit` 时调用）：**始终销毁，不受「关闭按钮行为=隐藏」影响**；只接受来自终端窗口本身的请求 |
| `terminal:snap-size` | `{ width?, height? }` | `{ ok, size?, deferred? }` | 渲染层按**实测余量**请求把窗口收到「整行 / 整列」：**拖动期间只挂起**（`deferred: true`），松手后由渲染层重新测量再对齐；偏差 > 60px 视为状态异常、不做。只接受来自终端窗口本身的请求 |
| `terminal:ensure-size` | `{ width, height }` | `{ ok, width?, height? }` | 打开内嵌文件面板时把本窗口**只放大不缩小**到至少给定内容尺寸（首次无布局记录时用，见 §3.9-10）；受屏幕工作区限制，不写回几何记忆；只接受来自终端窗口本身的请求 |
| `window:control` | `{ action: 'close' \| 'minimize' \| 'zoom' }` | `{ ok, action }` | 终端窗口自绘小红绿灯的窗口控制：只作用于**发起请求的那个窗口**（`BrowserWindow.fromWebContents(event.sender)`），未知 action 返回 `{ ok: false }`；`close` 在终端窗口上按「关闭按钮行为」收缩成悬浮球或销毁（见 §3.9-9） |
| `net-test:command` | `{ id, protocol, target, port, host? }` | `{ ok, command?, error? }` | 校验后把测试命令注入指定终端会话；`host` 为 SSH 别名时整条命令包一层 `ssh` |
| `ssh-config:read` | — | `hosts` | 每个 host 含 `group` 与 `hasPassword` 字段（见 §5.1） |
| `ssh-config:upsert` | `host`（含可选 `group`、`originalAlias`） | 更新后的 `hosts` | 保留未管理指令与注释；`group` 有值时写入 / 复用 `# group: <名称>` 注释并归入该分组，空串 / 缺省 = 未分组；改分组时把主机移动到目标分组末尾，分组清空后自动移除其注释标记 |
| `ssh-config:remove` | `alias` | 更新后的 `hosts` | 删除该分组最后一个主机后自动移除其 `# group:` 注释标记 |
| `ssh-config:rename-group` | `{ from, to }` | 更新后的 `hosts` | 把 config 中所有匹配 `from` 的 `# group:` 注释改成 `to`（不区分大小写）；空值 / 同名视为无操作；由设置 · SSH 的分组重命名图标调用 |
| `ssh-password:save` | `{ alias, password }` | `{ ok, error? }` | 把登录密码 **AES-256-GCM 加密**写入 `ssh-credentials.json`（密钥见 §5.1）；由设置 · SSH 的「保存」调用 |
| `ssh-password:remove` | `{ alias }` | `{ ok }` | 删除该别名的加密密码；由设置 · SSH 的「清除密码」调用 |
| `backup:export` | — | `{ ok, path?, canceled?, error? }` | 保存对话框导出**全部配置**（设置 + SSH 主机；SSH 密码为**明文**）为 JSON；由设置 · 导入 / 导出调用 |
| `backup:import` | — | `{ ok, settings, added, skipped, passwords?, canceled?, error? }` | 打开对话框选 JSON 并导入：**设置覆盖**当前值、**SSH 主机只新增**（别名已存在则跳过），随新增主机保存其密码；由设置 · 导入 / 导出调用 |
| `ssh-config:export` | — | `{ ok, path?, canceled?, error? }` | 经保存对话框导出 `~/.ssh/config` 副本 |
| `geo:lookup` | `ip`（IPv4 字符串） | `{ iso_3166, country, province, city, isp }` 或 `null` | 本地 `assets/geoip.json` 查询；内网返回 `{ isp: '保留地址' }`；**逐级回退**（省 / 市只有中国、台湾有数据，缺失不影响国家级结果；只有 ISP 命中时仅返回 `isp`；都不命中返回 `null`） |
| `devtools:open` | `'main' \| 'settings' \| 'terminal' \| 'file'` | `{ ok }` | 打开对应窗口的开发者工具（detach 模式；主面板会先显示，`'terminal'` / `'file'` 未打开时先打开对应窗口） |
| `clipboard:list` | — | `item[]`（最多 5 条） | 内存历史，含文本 / 图片缩略图 |
| `clipboard:copy` | `id` | `{ ok, error? }` | 文本用 `writeText`，图片用 `ClipboardItem` 写回 |
| `clipboard:clear` | — | `{ ok }` | 清空历史（不清空系统剪贴板） |
| `hash:text` | `text` | `{ md5, sha1, sha256 }` | 计算文本哈希 |
| `hash:file` | `file`（绝对路径） | `{ ok, hashes?, info?, error? }` | 流式计算文件哈希 |
| `nutrient:get` | — | `{ ok, products, tdee }` | 读取营养成分商品记录与 TDEE 最后状态 |
| `nutrient:save-product` | `{ name, energy, protein, fat, carbohydrate, sodium, total }` | `{ ok, products, tdee }` 或 `{ ok: false, error }` | 按商品名保存（忽略大小写去重、同名覆盖）；`name` 为空返回 `name-required` |
| `nutrient:delete-product` | `{ name }` | `{ ok, products, tdee }` 或 `{ ok: false, error }` | 按商品名删除记录（忽略大小写匹配）；不存在返回 `not-found` |
| `nutrient:save-tdee` | `{ sex, age, height, weight, activity, bmr, tdee }` | `{ ok, products, tdee }` | 保存 TDEE 输入与计算结果（覆盖最后状态） |
| `totp:list` | — | `account[]` | 列出 2FA 账号（**不含密钥**）：`{ id, title, subtitle, period, digits, algorithm }`，用于渲染卡片 |
| `totp:add` | `input`（`otpauth://` 链接或 Base32 密钥） | `{ ok, account? }` 或 `{ ok: false, error }` | 主进程校验并解析（`error` ∈ `empty`/`invalid-secret`/`invalid-url`/`unsupported-type`（非 TOTP）/`duplicate`），加密保存密钥并返回账号（不含密钥）；由 2FA 工具「添加」调用 |
| `totp:remove` | `id` | `{ ok }` | 删除该账号（含其加密密钥）；由卡片二次确认后调用 |
| `totp:codes` | — | `{ [id]: code }` | 返回全部账号**当前时间片**的 TOTP 验证码（主进程用 node `crypto` 计算，密钥不外传）；渲染层每 250ms 刷新倒计时、时间片切换时调用 |
| `dialog:open-file` | — | `{ path, name, size }` 或 `null` | 打开系统文件选择对话框 |
| `dialog:open-dir` | `{ defaultPath? }` | `{ path }` 或 `null` | 打开系统目录选择对话框（设置 → 终端 → SFTP 下载目录） |
| `dialog:open-files` | — | `{ paths: string[] }` | 多选文件对话框（文件管理「上传」按钮），返回本地绝对路径列表 |
| `log:write` | `text`（渲染→主 send） | — | 渲染层请求写日志：主进程用 `logger.info` 把文本同时输出到**控制台与当天日志文件**（终端窗口尺寸 / 字体 / 行高度量，见 §3.9-4） |

**send（渲染 → 主，单向）**

| 通道 | 说明 |
| --- | --- |
| `window:hide` | 隐藏主面板 |
| `window:open-settings` | 隐藏主面板并打开设置窗口；可选参数 `section`（如 `network`）指定初始分区，窗口已打开时直接切换 |
| `window:close-settings` | 关闭设置窗口 |
| `font-picker:close` | 关闭当前字体选择子窗口（仅关闭发起请求的窗口） |
| `terminal:ball-drag` | 悬浮球拖动（见 §3.9-12）：`{ phase: 'start', x, y }` 开始（主进程记下光标相对窗口的偏移后按光标移动窗口）／ `{ phase: 'end' }` 结束 |

**事件（主 → 渲染）**

| 通道 | 负载 | 说明 |
| --- | --- | --- |
| `settings:changed` | `settings` | 设置变更后广播到两个窗口 |
| `theme:changed` | `{ shouldUseDarkColors }` | 系统主题变化 |
| `ssh:detected` | `{ alias, os, family, label, at }` | 探测完成 |
| `clipboard:changed` | `item[]` | 剪贴板历史变化（主进程每约 1.2s 轮询系统剪贴板） |
| `terminal:data` | `{ id, type: 'data', data }` | PTY 输出（原样文本，含 ANSI），只发给拥有该会话的窗口 |
| `terminal:exit` | `{ id, type: 'exit', code, signal }` 或 `{ id, type: 'error', message }` | 会话结束 / 启动失败 |
| `terminal:session` | `{ id, type: 'session', ssh, target, busy }` | 本应用发起 SSH 连接后推送一次：`ssh` / `target` 为目标别名（供文件按钮与文件面板连接用），`busy` 恒为 `false`（保留字段）；**不再通过后台 `ps` 轮询检测**，手动敲入的 `ssh …` 不会触发；只发给对应终端窗口 |
| `terminal:ball` | `{ active, size, phase, duration, scaleX, scaleY }` | 悬浮球状态（见 §3.9-12）：`phase` ∈ `enter`（终端按缩放缩小）/ `settle`（切球或切终端）/ `grow`（终端从球 scale 放大）；`size` 球边长、`scaleX/scaleY` 起止缩放、`duration` 过渡时长。只发给对应终端窗口 |
| `terminal:ball-pin` | `{ value: boolean }` | `{ ok, value }` | 头栏「固定」按钮：设置该终端窗口是否**失焦不缩球**（`win.__ballPin`，仅当前窗口、不持久）；只接受来自该终端窗口本身的请求 |
| `terminal:recalibrate` | — | 拖动结束后请终端窗口重新测量并按整行对齐高度（拖动期间主进程不改窗口尺寸，见 §3.9-4） |
| `terminal:drag-active` | — | 主进程检测到终端窗口开始被拖动（`will-resize`）：渲染层据此在拖动期间不发对齐请求 |
| `terminal:zoom` | `'in' \| 'out' \| 'reset'` | 焦点在终端窗口时 `Cmd +/-/0` 的字号缩放（见 §5.3）；独立文件窗口不支持缩放 |
| `sftp:progress` | `{ id, direction: 'upload' \| 'download', name, transferred, total }` | SFTP 上传 / 下载进度，只发给发起该操作、拥有该会话的窗口（渲染层在状态栏显示进度条） |
| `file-window:target` | `{ target, path }` | 独立文件窗口已打开时，`file-window:open` 带目标再次调用 → 请它切换连接并进入 `path` |
| `ssh-config:changed` | `{ hosts }` | SSH 主机 / 分组增删改后广播（`ssh-config:upsert` / `remove` / `rename-group` 触发），终端窗口与独立文件窗口据此**实时刷新 SSH 下拉** |
| `settings:edit-ssh` | `{ alias }` | 设置窗口的 SSH 分区收到后打开该别名的编辑表单（由 `ssh:edit` 触发；等 hosts 加载完成再打开） |
| `update:progress` | 状态快照 | 下载进度变化（`percent` / `transferred` / `total` / `bytesPerSecond`），只发给更新窗口 |
| `update:downloaded` | 状态快照 | 下载完成（`phase: 'downloaded'`、`countdown: 60`），只发给更新窗口 |
| `update:countdown` | `{ countdown }` | 下载完成后的自动重启倒计时（每秒一次），只发给更新窗口 |
| `update:prompt` | 提示框对象或 `null` | 应用内提示框（`{ id, title, message, buttons, defaultId, cancelId }`）；`null` = 提示结束 / 切回下载进度，只发给更新窗口 |
| `settings:open-section` | `sectionId` | 请求设置窗口切换到指定分区（由 `window:open-settings` 的 `section` 触发） |

### 5.3 菜单与权限映射

- 托盘左键：切换主面板；托盘右键菜单：`打开设置`、`退出 Vessel`。
- **应用菜单**（`src/main/menu.js`）：自定义模板 = 应用菜单 / 编辑（撤销、剪切、拷贝、粘贴、全选；终端窗口另有**右键快速编辑**直接复制选区 / 粘贴剪贴板，见 §3.9-4，因此编辑菜单只是快捷键层面的补充）/ 视图（放大、缩小、实际大小、全屏、开发者工具）/ 窗口菜单。视图里的三个缩放项 **只显示快捷键、不向系统注册**（`registerAccelerator: false`），改由主进程 `before-input-event` 统一处理：`Cmd + = / +` / `Cmd + -` / `Cmd + 0` —— **焦点在置顶终端窗口时直接修改设置里的字号**（`terminal:zoom` → 写 `settings.terminalFontSize`，8–64px、默认 14px、持久化，改完重新 fit 并同步 PTY，并在头栏临时显示字号；同时改写 `--file-font-size`，文件管理部分一并缩放；**不改页面缩放因子**）；**焦点在独立文件窗口时不缩放**（字号固定 14px，`Cmd +/-` 无效）；其它窗口保持原来的整页缩放。两个悬浮窗口另外用 `setVisualZoomLevelLimits(1, 1)` 关掉 pinch 缩放、`zoom-changed` 把 `Cmd+滚轮` 也接到字号缩放上；页面缩放因子固定为 1，头栏 / 图标随字号按 10–20px / 20–32px 映射缩放。
- 不涉及系统权限申请（无摄像头/麦克风等）；SSH 连接依赖用户本机 iTerm 与 `~/.ssh/config`。

### 5.4 本地 HTTP API

- 无。应用不监听任何本地端口。

---
