'use strict';

const fs = require('fs');
const { app, shell, BrowserWindow, dialog } = require('electron');
const os = require('os');
const { IPC, VERSION, TERMINAL_WINDOW } = require('../../shared/constants');
const logger = require('../utils/logger');
const { DATA_DIR, LOG_DIR, todayLogFile, describeDataFiles } = require('../utils/paths');

function registerAppIpc(ipcMain) {
  ipcMain.handle(IPC.APP_INFO, () => ({
    version: VERSION,
    platform: process.platform,
    arch: process.arch,
    systemLocale: app.getLocale(),
    dataDir: DATA_DIR,
    dataFiles: describeDataFiles(),
    terminalScrollback: TERMINAL_WINDOW.scrollback,
  }));

  ipcMain.handle(IPC.OPEN_DATA_FOLDER, async () => {
    const err = await shell.openPath(DATA_DIR);
    if (err) return { ok: false, error: err };
    return { ok: true };
  });

  ipcMain.handle(IPC.OPEN_LOG, async () => {
    // 日志按天分文件：打开今天那一个（不存在就建个空文件；失败则退回日志目录）。
    const file = todayLogFile();
    try {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      if (!fs.existsSync(file)) fs.writeFileSync(file, '', 'utf8');
    } catch (err) {
      /* ignore */
    }
    if (shell.showItemInFolder) shell.showItemInFolder(file);
    const err = await shell.openPath(fs.existsSync(file) ? file : LOG_DIR);
    return err ? { ok: false, error: err } : { ok: true };
  });

  ipcMain.handle(IPC.OPEN_EXTERNAL, async (_event, url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return { ok: false, error: 'invalid url' };
    }
    await shell.openExternal(url);
    return { ok: true };
  });

  // Directory picker (settings → terminal → SFTP download directory).
  ipcMain.handle(IPC.DIALOG_OPEN_DIR, async (event, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const dialogOptions = { properties: ['openDirectory', 'createDirectory', 'showHiddenFiles'] };
    if (options && options.defaultPath) {
      const dir = String(options.defaultPath);
      dialogOptions.defaultPath = dir.startsWith('~') ? dir.replace(/^~/, os.homedir()) : dir;
    }
    const result = win ? await dialog.showOpenDialog(win, dialogOptions) : await dialog.showOpenDialog(dialogOptions);
    if (result.canceled || !result.filePaths.length) return null;
    return { path: result.filePaths[0] };
  });

  // Multi-file picker for SFTP upload (file manager's upload button).
  ipcMain.handle(IPC.DIALOG_OPEN_FILES, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const dialogOptions = { properties: ['openFile', 'multiSelections', 'showHiddenFiles'] };
    const result = win ? await dialog.showOpenDialog(win, dialogOptions) : await dialog.showOpenDialog(dialogOptions);
    if (result.canceled || !result.filePaths.length) return { paths: [] };
    return { paths: result.filePaths };
  });

  // 渲染层请求写日志：控制台 + ships.log（窗口尺寸 / 字体 / 行高等调试信息）。
  ipcMain.on(IPC.LOG_WRITE, (_event, text) => {
    logger.info(String(text == null ? '' : text));
  });
}

module.exports = { registerAppIpc };
