'use strict';

const pkg = require('../../package.json');

const APP_NAME = 'Ships';
const ships = pkg.ships || {};

const IPC = {
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_CHANGED: 'settings:changed',

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

  NET_TEST_RUN: 'net-test:run',

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
    width: 720,
    height: 520,
  },
  ships.settingsWindow || {}
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
};

module.exports = {
  APP_NAME,
  VERSION: pkg.version,
  ships,
  IPC,
  WINDOW,
  SETTINGS_WINDOW,
  VIBRANCY,
  DEFAULT_SETTINGS,
};
