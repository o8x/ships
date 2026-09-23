'use strict';

const { IPC } = require('../../shared/constants');
const {
  hideMainWindow,
  openSettingsWindow,
  closeSettingsWindow,
} = require('../window-manager');

function registerWindowIpc(ipcMain) {
  ipcMain.on(IPC.WINDOW_HIDE, () => hideMainWindow());
  ipcMain.on(IPC.WINDOW_OPEN_SETTINGS, () => {
    hideMainWindow();
    openSettingsWindow();
  });
  ipcMain.on(IPC.WINDOW_CLOSE_SETTINGS, () => closeSettingsWindow());
}

module.exports = { registerWindowIpc };
