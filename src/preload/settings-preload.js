'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const { IPC } = require('../shared/constants');
const { loadIcons, loadBallIcons } = require('./icons');

function on(channel, cb) {
  const listener = (_event, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api = {
  getInfo: () => ipcRenderer.invoke(IPC.APP_INFO),
  getSettings: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
  setSettings: (patch) => ipcRenderer.invoke(IPC.SETTINGS_SET, patch),
  onSettingsChanged: (cb) => on(IPC.SETTINGS_CHANGED, cb),
  onOpenSection: (cb) => on(IPC.SETTINGS_OPEN_SECTION, cb),
  onThemeChanged: (cb) => on(IPC.THEME_CHANGED, cb),
  openDataFolder: () => ipcRenderer.invoke(IPC.OPEN_DATA_FOLDER),
  openLog: () => ipcRenderer.invoke(IPC.OPEN_LOG),
  openConsole: () => ipcRenderer.invoke(IPC.OPEN_CONSOLE),
  clearData: () => ipcRenderer.invoke(IPC.CLEAR_DATA),
  checkUpdates: () => ipcRenderer.invoke(IPC.UPDATER_CHECK),
  openExternal: (url) => ipcRenderer.invoke(IPC.OPEN_EXTERNAL, url),
  closeSettings: () => ipcRenderer.send(IPC.WINDOW_CLOSE_SETTINGS),
  openDevTools: (target) => ipcRenderer.invoke(IPC.DEVTOOLS_OPEN, target),
  sshDetectHost: (host) => ipcRenderer.invoke(IPC.SSH_DETECT_HOST, host),
  sshGetDetected: () => ipcRenderer.invoke(IPC.SSH_GET_DETECTED),
  openFile: (options) => ipcRenderer.invoke(IPC.DIALOG_OPEN_FILE, options),
  openDirectory: (options) => ipcRenderer.invoke(IPC.DIALOG_OPEN_DIR, options),
  terminal: {
    start: (cols, rows, shell) => ipcRenderer.invoke(IPC.TERMINAL_START, { cols, rows, shell }),
    input: (id, data) => ipcRenderer.invoke(IPC.TERMINAL_INPUT, { id, data }),
    resize: (id, cols, rows) => ipcRenderer.invoke(IPC.TERMINAL_RESIZE, { id, cols, rows }),
    interrupt: (id) => ipcRenderer.invoke(IPC.TERMINAL_INTERRUPT, { id }),
    kill: (id) => ipcRenderer.invoke(IPC.TERMINAL_KILL, { id }),
    setHotkey: (hotkey) => ipcRenderer.invoke(IPC.TERMINAL_SET_HOTKEY, { hotkey }),
    reset: () => ipcRenderer.invoke(IPC.TERMINAL_RESET),
    onData: (cb) => on(IPC.TERMINAL_DATA, cb),
    onExit: (cb) => on(IPC.TERMINAL_EXIT, cb),
  },
  netTest: {
    command: (payload) => ipcRenderer.invoke(IPC.NET_TEST_COMMAND, payload),
  },
  sshConfig: {
    read: () => ipcRenderer.invoke(IPC.SSH_CONFIG_READ),
    upsert: (host) => ipcRenderer.invoke(IPC.SSH_CONFIG_UPSERT, host),
    remove: (alias) => ipcRenderer.invoke(IPC.SSH_CONFIG_REMOVE, alias),
    export: () => ipcRenderer.invoke(IPC.SSH_CONFIG_EXPORT),
  },
};

contextBridge.exposeInMainWorld('ships', api);
contextBridge.exposeInMainWorld('shipsIcons', loadIcons());
contextBridge.exposeInMainWorld('shipsBallIcons', loadBallIcons());
