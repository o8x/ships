'use strict';

const { app, shell } = require('electron');
const { IPC, VERSION } = require('../../shared/constants');
const { DATA_DIR, LOG_FILE, describeDataFiles } = require('../utils/paths');

function registerAppIpc(ipcMain) {
  ipcMain.handle(IPC.APP_INFO, () => ({
    version: VERSION,
    platform: process.platform,
    arch: process.arch,
    systemLocale: app.getLocale(),
    dataDir: DATA_DIR,
    dataFiles: describeDataFiles(),
  }));

  ipcMain.handle(IPC.OPEN_DATA_FOLDER, async () => {
    const err = await shell.openPath(DATA_DIR);
    if (err) return { ok: false, error: err };
    return { ok: true };
  });

  ipcMain.handle(IPC.OPEN_LOG, async () => {
    if (shell.showItemInFolder) shell.showItemInFolder(LOG_FILE);
    const err = await shell.openPath(LOG_FILE);
    return err ? { ok: false, error: err } : { ok: true };
  });

  ipcMain.handle(IPC.OPEN_EXTERNAL, async (_event, url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return { ok: false, error: 'invalid url' };
    }
    await shell.openExternal(url);
    return { ok: true };
  });
}

module.exports = { registerAppIpc };
