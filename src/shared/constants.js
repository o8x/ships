'use strict';

const pkg = require('../../package.json');

const APP_NAME = 'Vessel';
const appConfig = pkg.vessel || pkg.ships || {};

const IPC = {
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_CHANGED: 'settings:changed',
  SETTINGS_OPEN_SECTION: 'settings:open-section',
  SETTINGS_EDIT_SSH: 'settings:edit-ssh',

  APP_INFO: 'app:info',
  APP_LIST_FONTS: 'app:list-fonts',
  OPEN_DATA_FOLDER: 'app:open-data-folder',
  OPEN_LOG: 'app:open-log',
  OPEN_CONSOLE: 'app:open-console',
  CLEAR_DATA: 'app:clear-data',
  OPEN_EXTERNAL: 'app:open-external',
  OPEN_PATH: 'app:open-path',
  UPDATER_CHECK: 'app:check-updates',

  // 更新窗口：状态查询 / 取消 / 立即重启安装 / 提示框选择（invoke）与进度 / 下载完成 / 倒计时 / 提示（主→渲染）。
  UPDATE_STATE: 'update:state',
  UPDATE_CANCEL: 'update:cancel',
  UPDATE_INSTALL: 'update:install',
  UPDATE_CHOICE: 'update:choice',
  UPDATE_PROGRESS: 'update:progress',
  UPDATE_DOWNLOADED: 'update:downloaded',
  UPDATE_COUNTDOWN: 'update:countdown',
  UPDATE_PROMPT: 'update:prompt',

  WINDOW_HIDE: 'window:hide',
  WINDOW_OPEN_SETTINGS: 'window:open-settings',
  WINDOW_CLOSE_SETTINGS: 'window:close-settings',
  FONT_PICKER_OPEN: 'font-picker:open',
  FONT_PICKER_CLOSE: 'font-picker:close',
  WINDOW_CONTROL: 'window:control',
  LOG_WRITE: 'log:write',
  COPY_IMAGE: 'app:copy-image',
  SAVE_IMAGE: 'app:save-image',
  THEME_CHANGED: 'theme:changed',

  GEO_LOOKUP: 'geo:lookup',
  DEVTOOLS_OPEN: 'devtools:open',

  CLIPBOARD_LIST: 'clipboard:list',
  CLIPBOARD_COPY: 'clipboard:copy',
  CLIPBOARD_CLEAR: 'clipboard:clear',
  CLIPBOARD_CHANGED: 'clipboard:changed',

  HASH_TEXT: 'hash:text',
  HASH_FILE: 'hash:file',

  NUTRIENT_GET: 'nutrient:get',
  NUTRIENT_SAVE_PRODUCT: 'nutrient:save-product',
  NUTRIENT_DELETE_PRODUCT: 'nutrient:delete-product',
  NUTRIENT_SAVE_TDEE: 'nutrient:save-tdee',
  DIALOG_OPEN_FILE: 'dialog:open-file',

  // 2FA（TOTP）动态验证码：列账号 / 解析并添加 / 删除 / 取当前验证码。
  TOTP_LIST: 'totp:list',
  TOTP_ADD: 'totp:add',
  TOTP_REMOVE: 'totp:remove',
  TOTP_CODES: 'totp:codes',

  NET_TEST_COMMAND: 'net-test:command',

  TERMINAL_OPEN: 'terminal:open',
  TERMINAL_START: 'terminal:start',
  TERMINAL_INPUT: 'terminal:input',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_INTERRUPT: 'terminal:interrupt',
  TERMINAL_KILL: 'terminal:kill',
  TERMINAL_EXPORT: 'terminal:export',
  TERMINAL_OPEN_ITERM: 'terminal:open-iterm',
  TERMINAL_SET_TOP: 'terminal:set-top',
  SHORTCUT_SET: 'shortcut:set',
  TERMINAL_DESTROY: 'terminal:destroy',
  TERMINAL_RESET: 'terminal:reset',
  TERMINAL_SNAP_SIZE: 'terminal:snap-size',
  TERMINAL_ENSURE_SIZE: 'terminal:ensure-size',
  TERMINAL_RECALIBRATE: 'terminal:recalibrate',
  TERMINAL_DRAG_ACTIVE: 'terminal:drag-active',
  TERMINAL_ZOOM: 'terminal:zoom',
  TERMINAL_FOCUS_INPUT: 'terminal:focus-input',
  TERMINAL_DATA: 'terminal:data',
  TERMINAL_EXIT: 'terminal:exit',
  TERMINAL_SESSION: 'terminal:session',
  TERMINAL_BALL_ACTIVE: 'terminal:ball-active',
  TERMINAL_COPY_TEXT: 'terminal:copy-text',
  TERMINAL_PASTE_TEXT: 'terminal:paste-text',
  TERMINAL_BALL: 'terminal:ball',
  TERMINAL_BALL_DRAG: 'terminal:ball-drag',
  TERMINAL_BALL_RESTORE: 'terminal:ball-restore',
  TERMINAL_BALL_PIN: 'terminal:ball-pin',

  SFTP_CONNECT: 'sftp:connect',
  SFTP_LIST: 'sftp:list',
  SFTP_DOWNLOAD: 'sftp:download',
  SFTP_OPEN: 'sftp:open',
  SFTP_OPEN_VSCODE: 'sftp:open-vscode',
  SFTP_UPLOAD: 'sftp:upload',
  SFTP_CLOSE: 'sftp:close',
  SFTP_TRANSFER_COMMAND: 'sftp:transfer-command',
  SFTP_PROGRESS: 'sftp:progress',
  SFTP_COPY_PATH: 'sftp:copy-path',
  SFTP_COPY_TEXT: 'sftp:copy-text',

  CD_HISTORY_LIST: 'cd-history:list',
  CD_HISTORY_ADD: 'cd-history:add',

  FILES_LAYOUT_GET: 'files-layout:get',
  FILES_LAYOUT_SET: 'files-layout:set',

  FILE_WINDOW_OPEN: 'file-window:open',
  FILE_WINDOW_INFO: 'file-window:info',
  FILE_WINDOW_CLOSE: 'file-window:close',
  FILE_WINDOW_SET_TOP: 'file-window:set-top',
  FILE_WINDOW_SNAP_SIZE: 'file-window:snap-size',
  FILE_WINDOW_ZOOM: 'file-window:zoom',
  FILE_WINDOW_TARGET: 'file-window:target',

  DIALOG_OPEN_DIR: 'dialog:open-dir',
  DIALOG_OPEN_FILES: 'dialog:open-files',

  SSH_LIST: 'ssh:list',
  SSH_EDIT: 'ssh:edit',
  SSH_CONNECT: 'ssh:connect',
  SSH_DETECT: 'ssh:detect',
  SSH_DETECT_HOST: 'ssh:detect-host',
  SSH_GET_DETECTED: 'ssh:get-detected',
  SSH_DETECTED: 'ssh:detected',
  SSH_CONFIG_READ: 'ssh-config:read',
  SSH_CONFIG_UPSERT: 'ssh-config:upsert',
  SSH_CONFIG_REMOVE: 'ssh-config:remove',
  SSH_CONFIG_RENAME_GROUP: 'ssh-config:rename-group',
  SSH_CONFIG_EXPORT: 'ssh-config:export',
  SSH_PASSWORD_SAVE: 'ssh-password:save',
  SSH_PASSWORD_REMOVE: 'ssh-password:remove',

  BACKUP_EXPORT: 'backup:export',
  BACKUP_IMPORT: 'backup:import',
  // 主 → 渲染：SSH 主机 / 分组增删改后广播，让各处 SSH 下拉实时刷新。
  SSH_CONFIG_CHANGED: 'ssh-config:changed',
};

const WINDOW = Object.assign(
  {
    width: 400,
    height: 500,
    gapBelowTray: 2,
    cornerRadius: 10,
  },
  appConfig.window || {}
);

const SETTINGS_WINDOW = Object.assign(
  {
    width: 800,
    height: 600,
  },
  appConfig.settingsWindow || {}
);

// 窗口模式（非悬浮）的主窗口：固定 640×480 的标准窗口（不可缩放），仅位置可拖动。
const MAIN_WINDOW = Object.assign(
  {
    width: 640,
    height: 480,
  },
  appConfig.mainWindow || {}
);

// Always-on-top terminal window (floats above full-screen apps, Steam-style).
const TERMINAL_WINDOW = Object.assign(
  {
    width: 1024,
    height: 768,
    minWidth: 350,
    minHeight: 200,
    alwaysOnTop: true,
    scrollback: 10000,
    ballSize: 90,
    ballEnabled: true,
    ballDelayMs: 50,
    ballIcon: 'ball-11.svg',
    ballDark: true,
    ballTransparent: true,
  },
  appConfig.terminalWindow || {}
);

// Detached file-manager window (floats like the terminal window).
const FILE_WINDOW = Object.assign(
  {
    width: 900,
    height: 600,
    minWidth: 480,
    minHeight: 320,
    alwaysOnTop: false,
  },
  appConfig.fileWindow || {}
);

// 更新下载窗口：小、不可关闭、置顶的前台窗口（仅进度 / 取消 / 重启安装）。
const UPDATE_WINDOW = Object.assign(
  {
    width: 380,
    height: 150,
  },
  appConfig.updateWindow || {}
);

// 更新下载完成后自动重启安装的倒计时（秒）。
const UPDATE_COUNTDOWN_SECONDS = 60;

// 同一个全局快捷键同时绑定主窗口（双击）与终端（单击）时，用于区分单 / 双击的等待时间。
const SHORTCUT_DOUBLE_TAP_MS = 260;

// 拖动窗口时，窗口中心与屏幕（工作区）**垂直中线**（x 方向）对齐的「磁性吸附」（px，滞回）：
// 进入吸附的阈值 / 脱离吸附的释放阈值。用于终端窗口与窗口模式的主窗口；
// 只比较 x，不要求上下也居中。
const CENTER_SNAP = {
  xThreshold: 10,
  xRelease: 26,
};

// 日志保留天数（按天写文件，惰性删除更早的日志）。
const LOG_RETENTION_DAYS = Number.isFinite(appConfig.logRetentionDays) ? appConfig.logRetentionDays : 7;

// 文件面板：每个 ssh 目标（用户名@主机）记录最近 cd 到的目录数（去重、越新越靠前）。
const CD_HISTORY_MAX = Number.isFinite(appConfig.cdHistoryMax) ? appConfig.cdHistoryMax : 10;

// macOS only: NSVisualEffectMaterial used when the native frosted glass is on.
// 'hud' gives the strongly see-through, low-opacity look of the system HUD
// (Control Center style); 'content'/'under-window' are effectively opaque/gray.
const VIBRANCY = {
  type: 'hud',
  state: 'active',
};

const DEFAULT_SETTINGS = {
  locale: appConfig.defaultLocale || 'zh',
  theme: appConfig.defaultTheme || 'system',
  accent: appConfig.defaultAccent || '#2e6bfc',
  launchAtLogin: false,
  // 主界面模式：false = 窗口模式（默认，居中标准窗口）；true = 悬浮模式（托盘下方弹出面板）。
  floatMode: false,
  pinWindow: false,
  vibrancy: false,
  // Liquid Glass 表面透明度（0–100；越大越透明）。默认 80 = 现有观感。
  glassOpacity: 80,
  // 开发者模式：开启后设置页才显示「开发者」工具区，主界面版本号旁显示标记。
  developerMode: false,
  clipboardLimit: 3,
  clipboardPollMs: 1200,
  // terminal window / network test terminal
  terminalShell: (appConfig.terminalWindow && appConfig.terminalWindow.shell) || '',
  terminalFontSize: (appConfig.terminalWindow && appConfig.terminalWindow.fontSize) || 12,
  // 终端字体家族（空 = 使用系统等宽字体栈）。设置页通过 macOS 系统字体选择框选取。
  terminalFontFamily: (appConfig.terminalWindow && appConfig.terminalWindow.fontFamily) || '',
  terminalScrollback: (appConfig.terminalWindow && appConfig.terminalWindow.scrollback) || 10000,
  terminalWindowWidth: TERMINAL_WINDOW.width,
  terminalWindowHeight: TERMINAL_WINDOW.height,
  terminalAlwaysOnTop: TERMINAL_WINDOW.alwaysOnTop !== false,
  // 终端窗口关闭按钮的行为：'hide' 只隐藏窗口（会话保留），'destroy' 直接销毁（结束会话）
  terminalCloseAction: TERMINAL_WINDOW.closeAction === 'hide' ? 'hide' : 'destroy',
  // 全局快捷键（Electron accelerator，空字符串 = 不注册）：主窗口双击 / 终端单击
  mainWindowHotkey: TERMINAL_WINDOW.hotkey || 'CommandOrControl+Shift+Z',
  terminalHotkey: TERMINAL_WINDOW.hotkey || 'CommandOrControl+Shift+Z',
  sshBuiltinTerminal: appConfig.sshBuiltinTerminal !== false,
  // 遵循 macOS 系统代理 / PAC：开启后终端、SSH / SFTP、更新请求按系统代理转发；
  // 默认关闭，保持直连。SSH / SFTP 仅支持 SOCKS5 代理。
  followSystemProxy: false,
  // 终端窗口失焦缩成「悬浮球」：是否开启 + 延迟（毫秒）+ 球尺寸（px，宽高强制 1:1）
  terminalBallEnabled: TERMINAL_WINDOW.ballEnabled !== false,
  terminalBallDelayMs: Number.isFinite(TERMINAL_WINDOW.ballDelayMs) ? TERMINAL_WINDOW.ballDelayMs : 50,
  terminalBallSize: Number.isFinite(TERMINAL_WINDOW.ballSize) ? TERMINAL_WINDOW.ballSize : 90,
  // 悬浮球图标（assets/icons/ball/ 下的文件名）
  terminalBallIcon: TERMINAL_WINDOW.ballIcon || 'ball-11.svg',
  // 悬浮球底色是否为暗色（浅色/暗色底）；默认开，不跟随全局主题。图标始终保留原色。
  terminalBallDark: TERMINAL_WINDOW.ballDark !== false,
  // 悬浮球透明背景：默认开；开启后无底色 / 边框，拖动时显示一层淡背景。
  terminalBallTransparent: TERMINAL_WINDOW.ballTransparent !== false,
  // 内置终端文件面板：下载保存目录（默认 ~/Downloads）
  sftpDownloadDir: appConfig.sftpDownloadDir || '~/Downloads',
  // 独立文件窗口置顶
  fileWindowAlwaysOnTop: FILE_WINDOW.alwaysOnTop !== false,
  // 日志：日志文件保留天数（macOS 下日志写到 ~/Library/Logs/Vessel，Console.app 的
  //「日志报告」会直接收录，无需再做统一日志同步）。
  logRetentionDays: LOG_RETENTION_DAYS,
};

module.exports = {
  APP_NAME,
  VERSION: pkg.version,
  appConfig,
  IPC,
  WINDOW,
  MAIN_WINDOW,
  SETTINGS_WINDOW,
  TERMINAL_WINDOW,
  FILE_WINDOW,
  UPDATE_WINDOW,
  UPDATE_COUNTDOWN_SECONDS,
  SHORTCUT_DOUBLE_TAP_MS,
  CENTER_SNAP,
  LOG_RETENTION_DAYS,
  CD_HISTORY_MAX,
  VIBRANCY,
  DEFAULT_SETTINGS,
};
