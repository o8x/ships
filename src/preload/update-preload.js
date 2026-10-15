'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const { IPC } = require('../shared/constants');

function on(channel, cb) {
  const listener = (_event, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api = {
  getSettings: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
  onThemeChanged: (cb) => on(IPC.THEME_CHANGED, cb),
  update: {
    state: () => ipcRenderer.invoke(IPC.UPDATE_STATE),
    cancel: () => ipcRenderer.invoke(IPC.UPDATE_CANCEL),
    install: () => ipcRenderer.invoke(IPC.UPDATE_INSTALL),
    onProgress: (cb) => on(IPC.UPDATE_PROGRESS, cb),
    onDownloaded: (cb) => on(IPC.UPDATE_DOWNLOADED, cb),
    onCountdown: (cb) => on(IPC.UPDATE_COUNTDOWN, cb),
  },
};

contextBridge.exposeInMainWorld('ships', api);
