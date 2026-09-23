'use strict';

const { IPC } = require('../../shared/constants');
const store = require('../services/tool-state-service');

function registerStateIpc(ipcMain) {
  ipcMain.handle(IPC.STATE_GET, (_event, key) => store.get(key));
  ipcMain.handle(IPC.STATE_SET, (_event, key, value) => store.set(key, value));
  ipcMain.handle(IPC.STATE_CLEAR, (_event, key) => store.clear(key));
}

module.exports = { registerStateIpc };
