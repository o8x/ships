'use strict';

const { IPC } = require('../../shared/constants');
const clipboardService = require('../services/clipboard-service');
const { broadcast } = require('../window-manager');

function registerClipboardIpc(ipcMain) {
  ipcMain.handle(IPC.CLIPBOARD_LIST, () => clipboardService.list());
  ipcMain.handle(IPC.CLIPBOARD_COPY, (_event, id) => clipboardService.copy(id));
  ipcMain.handle(IPC.CLIPBOARD_CLEAR, () => clipboardService.clear());

  clipboardService.on('changed', (items) => broadcast(IPC.CLIPBOARD_CHANGED, items));
  clipboardService.start();
}

module.exports = { registerClipboardIpc };
