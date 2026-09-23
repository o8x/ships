'use strict';

const { IPC } = require('../../shared/constants');
const {
  hideMainWindow,
  openSettingsWindow,
  closeSettingsWindow,
  getMainWindow,
  getSettingsWindow,
} = require('../window-manager');

function registerWindowIpc(ipcMain) {
  ipcMain.on(IPC.WINDOW_HIDE, () => hideMainWindow());
  ipcMain.on(IPC.WINDOW_OPEN_SETTINGS, () => {
    hideMainWindow();
    openSettingsWindow();
  });
  ipcMain.on(IPC.WINDOW_CLOSE_SETTINGS, () => closeSettingsWindow());

  ipcMain.handle(IPC.DEVTOOLS_OPEN, (_event, target) => {
    const win = target === 'settings' ? getSettingsWindow() : getMainWindow();
    if (!win) return { ok: false };
    if (target !== 'settings') win.show();
    win.webContents.openDevTools({ mode: 'detach' });
    return { ok: true };
  });
}

module.exports = { registerWindowIpc };
