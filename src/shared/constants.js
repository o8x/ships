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
  OPEN_EXTERNAL: 'app:open-external',

  WINDOW_HIDE: 'window:hide',
  WINDOW_OPEN_SETTINGS: 'window:open-settings',
  WINDOW_CLOSE_SETTINGS: 'window:close-settings',
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
  TERMINAL_ZOOM: 'terminal:zoom',
  TERMINAL_DATA: 'terminal:data',
  TERMINAL_EXIT: 'terminal:exit',

  SSH_LIST: 'ssh:list',
  SSH_CONNECT: 'ssh:connect',
  SSH_DETECT: 'ssh:detect',
  SSH_DETECT_HOST: 'ssh:detect-host',
  SSH_GET_DETECTED: 'ssh:get-detected',
  SSH_DETECTED: 'ssh:detected',
  SSH_LIST_DIR: 'ssh:list-dir',
  SSH_OPEN_DIR: 'ssh:open-dir',
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
  sshBuiltinTerminal: ships.sshBuiltinTerminal !== false,
};

module.exports = {
  APP_NAME,
  VERSION: pkg.version,
  ships,
  IPC,
  WINDOW,
  SETTINGS_WINDOW,
  TERMINAL_WINDOW,
  VIBRANCY,
  DEFAULT_SETTINGS,
};
