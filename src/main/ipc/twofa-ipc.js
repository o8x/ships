'use strict';

const { IPC } = require('../../shared/constants');
const totpService = require('../services/totp-service');

function registerTotpIpc(ipcMain) {
  ipcMain.handle(IPC.TOTP_LIST, () => totpService.list());
  ipcMain.handle(IPC.TOTP_ADD, (_event, input) => totpService.add(input));
  ipcMain.handle(IPC.TOTP_REMOVE, (_event, id) => totpService.remove(id));
  ipcMain.handle(IPC.TOTP_CODES, () => totpService.codes());
}

module.exports = { registerTotpIpc };
