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
  SSH_CONFIG_EXPORT: 'ssh-config:export',
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

// Always-on-top terminal window (floats above full-screen apps, Steam-style).
const TERMINAL_WINDOW = Object.assign(
  {
    width: 1024,
    height: 768,
    minWidth: 480,
    minHeight: 320,
    alwaysOnTop: true,
    scrollback: 10000,
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
  pinWindow: false,
  vibrancy: false,
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
  SETTINGS_WINDOW,
  TERMINAL_WINDOW,
  FILE_WINDOW,
  LOG_RETENTION_DAYS,
  CD_HISTORY_MAX,
  VIBRANCY,
  DEFAULT_SETTINGS,
};
