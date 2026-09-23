'use strict';

const { dialog, BrowserWindow } = require('electron');
const os = require('os');
const { IPC } = require('../../shared/constants');
const hashService = require('../services/hash-service');

function registerHashIpc(ipcMain) {
  ipcMain.handle(IPC.HASH_TEXT, (_event, text) => hashService.hashText(text));

  ipcMain.handle(IPC.HASH_FILE, async (_event, file) => {
    if (typeof file !== 'string' || !file) return { ok: false, error: 'invalid file' };
    try {
      const hashes = await hashService.hashFile(file);
      return { ok: true, hashes, info: hashService.fileInfo(file) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle(IPC.DIALOG_OPEN_FILE, async (event, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const dialogOptions = { properties: ['openFile', 'showHiddenFiles'] };
    if (options && options.defaultPath) {
      const dir = String(options.defaultPath);
      dialogOptions.defaultPath = dir.startsWith('~') ? dir.replace(/^~/, os.homedir()) : dir;
    }
    const result = await dialog.showOpenDialog(win, dialogOptions);
    if (result.canceled || !result.filePaths.length) return null;
    const file = result.filePaths[0];
    try {
      return hashService.fileInfo(file);
    } catch (err) {
      return null;
    }
  });
}

module.exports = { registerHashIpc };
