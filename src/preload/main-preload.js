'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const { IPC } = require('../shared/constants');
const { loadIcons } = require('./icons');
const { get: getFlag } = require('./flags');

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
  onThemeChanged: (cb) => on(IPC.THEME_CHANGED, cb),
  hideWindow: () => ipcRenderer.send(IPC.WINDOW_HIDE),
  openSettings: () => ipcRenderer.send(IPC.WINDOW_OPEN_SETTINGS),
  openDataFolder: () => ipcRenderer.invoke(IPC.OPEN_DATA_FOLDER),
  openExternal: (url) => ipcRenderer.invoke(IPC.OPEN_EXTERNAL, url),
  geoLookup: (ip) => ipcRenderer.invoke(IPC.GEO_LOOKUP, ip),
  ssh: {
    list: () => ipcRenderer.invoke(IPC.SSH_LIST),
    connect: (payload) => ipcRenderer.invoke(IPC.SSH_CONNECT, payload),
    detect: (payload) => ipcRenderer.invoke(IPC.SSH_DETECT, payload),
    onDetected: (cb) => on(IPC.SSH_DETECTED, cb),
  },
};

contextBridge.exposeInMainWorld('ships', api);
contextBridge.exposeInMainWorld('shipsIcons', loadIcons());
contextBridge.exposeInMainWorld('shipsFlags', { get: (code, shape) => getFlag(code, shape) });
