'use strict';

const pkg = require('../../package.json');

const APP_NAME = 'Ships';
const ships = pkg.ships || {};

const IPC = {
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_CHANGED: 'settings:changed',
  SETTINGS_OPEN_SECTION: 'settings:open-section',

  APP_INFO: 'app:info',
  OPEN_DATA_FOLDER: 'app:open-data-folder',
  OPEN_LOG: 'app:open-log',
  OPEN_CONSOLE: 'app:open-console',
  CLEAR_DATA: 'app:clear-data',
  OPEN_EXTERNAL: 'app:open-external',
  UPDATER_CHECK: 'app:check-updates',

  // 更新下载窗口：状态查询 / 取消 / 立即重启安装（invoke）与进度 / 下载完成 / 倒计时（主→渲染）。
  UPDATE_STATE: 'update:state',
  UPDATE_CANCEL: 'update:cancel',
  UPDATE_INSTALL: 'update:install',
  UPDATE_PROGRESS: 'update:progress',
  UPDATE_DOWNLOADED: 'update:downloaded',
  UPDATE_COUNTDOWN: 'update:countdown',

  WINDOW_HIDE: 'window:hide',
  WINDOW_OPEN_SETTINGS: 'window:open-settings',
  WINDOW_CLOSE_SETTINGS: 'window:close-settings',
  WINDOW_CONTROL: 'window:control',
  LOG_WRITE: 'log:write',
  THEME_CHANGED: 'theme:changed',

  GEO_LOOKUP: 'geo:lookup',
  DEVTOOLS_OPEN: 'devtools:open',

  CLIPBOARD_LIST: 'clipboard:list',
  CLIPBOARD_COPY: 'clipboard:copy',
  CLIPBOARD_CLEAR: 'clipboard:clear',
  CLIPBOARD_CHANGED: 'clipboard:changed',

  HASH_TEXT: 'hash:text',
  HASH_FILE: 'hash:file',
  DIALOG_OPEN_FILE: 'dialog:open-file',

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
  TERMINAL_SET_HOTKEY: 'terminal:set-hotkey',
  TERMINAL_DESTROY: 'terminal:destroy',
  TERMINAL_RESET: 'terminal:reset',
  TERMINAL_SNAP_SIZE: 'terminal:snap-size',
  TERMINAL_ENSURE_SIZE: 'terminal:ensure-size',
  TERMINAL_RECALIBRATE: 'terminal:recalibrate',
  TERMINAL_DRAG_ACTIVE: 'terminal:drag-active',
  TERMINAL_ZOOM: 'terminal:zoom',
  TERMINAL_DATA: 'terminal:data',
  TERMINAL_EXIT: 'terminal:exit',
  TERMINAL_SESSION: 'terminal:session',
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
  ships.window || {}
);

const SETTINGS_WINDOW = Object.assign(
  {
    width: 800,
    height: 600,
  },
  ships.settingsWindow || {}
);

// 窗口模式（非悬浮）的主窗口：固定 640×480 的标准窗口（不可缩放），仅位置可拖动。
const MAIN_WINDOW = Object.assign(
  {
    width: 640,
    height: 480,
  },
  ships.mainWindow || {}
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
    ballSize: 75,
    ballEnabled: true,
    ballDelayMs: 200,
    ballIcon: 'ball.svg',
    ballDark: true,
  },
  ships.terminalWindow || {}
);

// Detached file-manager window (floats like the terminal window).
const FILE_WINDOW = Object.assign(
  {
    width: 900,
    height: 600,
    minWidth: 480,
    minHeight: 320,
    alwaysOnTop: true,
  },
  ships.fileWindow || {}
);

// 更新下载窗口：小、不可关闭、置顶的前台窗口（仅进度 / 取消 / 重启安装）。
const UPDATE_WINDOW = Object.assign(
  {
    width: 380,
    height: 150,
  },
  ships.updateWindow || {}
);

// 更新下载完成后自动重启安装的倒计时（秒）。
const UPDATE_COUNTDOWN_SECONDS = 60;

// 拖动窗口时，窗口纵向中心与屏幕（工作区）纵向中心对齐的「磁性吸附」（px，滞回）：
// 进入吸附的阈值 / 脱离吸附的释放阈值。用于终端窗口与窗口模式的主窗口（简单提示）。
const CENTER_SNAP = {
  vThreshold: 10,
  vRelease: 26,
};

// 日志保留天数（按天写文件，惰性删除更早的日志）。
const LOG_RETENTION_DAYS = Number.isFinite(ships.logRetentionDays) ? ships.logRetentionDays : 7;

// 文件面板：每个 ssh 目标（用户名@主机）记录最近 cd 到的目录数（去重、越新越靠前）。
const CD_HISTORY_MAX = Number.isFinite(ships.cdHistoryMax) ? ships.cdHistoryMax : 10;

// macOS only: NSVisualEffectMaterial used when the native frosted glass is on.
// 'hud' gives the strongly see-through, low-opacity look of the system HUD
// (Control Center style); 'content'/'under-window' are effectively opaque/gray.
const VIBRANCY = {
  type: 'hud',
  state: 'active',
};

const DEFAULT_SETTINGS = {
  locale: ships.defaultLocale || 'zh',
  theme: ships.defaultTheme || 'system',
  accent: ships.defaultAccent || '#2e6bfc',
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
  terminalShell: (ships.terminalWindow && ships.terminalWindow.shell) || '',
  terminalFontSize: (ships.terminalWindow && ships.terminalWindow.fontSize) || 12,
  terminalScrollback: (ships.terminalWindow && ships.terminalWindow.scrollback) || 10000,
  terminalWindowWidth: TERMINAL_WINDOW.width,
  terminalWindowHeight: TERMINAL_WINDOW.height,
  terminalAlwaysOnTop: TERMINAL_WINDOW.alwaysOnTop !== false,
  // 终端窗口关闭按钮的行为：'hide' 只隐藏窗口（会话保留），'destroy' 直接销毁（结束会话）
  terminalCloseAction: TERMINAL_WINDOW.closeAction === 'hide' ? 'hide' : 'destroy',
  // 打开置顶终端窗口的全局快捷键（Electron accelerator，空字符串 = 不注册）
  terminalHotkey: TERMINAL_WINDOW.hotkey || 'CommandOrControl+Shift+Z',
  sshBuiltinTerminal: ships.sshBuiltinTerminal !== false,
  // 终端窗口失焦缩成「悬浮球」：是否开启 + 延迟（毫秒）+ 球尺寸（px，宽高强制 1:1）
  terminalBallEnabled: TERMINAL_WINDOW.ballEnabled !== false,
  terminalBallDelayMs: Number.isFinite(TERMINAL_WINDOW.ballDelayMs) ? TERMINAL_WINDOW.ballDelayMs : 200,
  terminalBallSize: Number.isFinite(TERMINAL_WINDOW.ballSize) ? TERMINAL_WINDOW.ballSize : 75,
  // 悬浮球图标（assets/icons/ball/ 下的文件名）
  terminalBallIcon: TERMINAL_WINDOW.ballIcon || 'ball.svg',
  // 悬浮球底色是否为暗色（浅色/暗色底）；默认开，不跟随全局主题。图标始终保留原色。
  terminalBallDark: TERMINAL_WINDOW.ballDark !== false,
  // 内置终端文件面板：下载保存目录（默认 ~/Downloads）
  sftpDownloadDir: ships.sftpDownloadDir || '~/Downloads',
  // 独立文件窗口置顶
  fileWindowAlwaysOnTop: FILE_WINDOW.alwaysOnTop !== false,
  // 日志：日志文件保留天数（macOS 下日志写到 ~/Library/Logs/Ships，Console.app 的
  //「日志报告」会直接收录，无需再做统一日志同步）。
  logRetentionDays: LOG_RETENTION_DAYS,
};

module.exports = {
  APP_NAME,
  VERSION: pkg.version,
  ships,
  IPC,
  WINDOW,
  MAIN_WINDOW,
  SETTINGS_WINDOW,
  TERMINAL_WINDOW,
  FILE_WINDOW,
  UPDATE_WINDOW,
  UPDATE_COUNTDOWN_SECONDS,
  CENTER_SNAP,
  LOG_RETENTION_DAYS,
  CD_HISTORY_MAX,
  VIBRANCY,
  DEFAULT_SETTINGS,
};
