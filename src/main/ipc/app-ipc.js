'use strict';

const fs = require('fs');
const { app, shell, BrowserWindow, dialog } = require('electron');
const os = require('os');
const { IPC, VERSION, TERMINAL_WINDOW } = require('../../shared/constants');
const logger = require('../utils/logger');
const updater = require('../services/updater-service');
const {
  DATA_DIR,
  LOG_DIR,
  describeDataFiles,
  TERMINAL_WINDOW_FILE,
  FILE_WINDOW_FILE,
  FILE_LAYOUT_FILE,
  FILE_WINDOW_LAYOUT_FILE,
  CD_HISTORY_FILE,
} = require('../utils/paths');

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
    // 只打开日志文件夹（不再打开具体日志文件）。
    try {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    } catch (err) {
      /* ignore */
    }
    const err = await shell.openPath(LOG_DIR);
    return err ? { ok: false, error: err } : { ok: true };
  });

  // 打开 macOS「控制台」App（仅在「同步到控制台 App」开启时由设置界面调用）。
  ipcMain.handle(IPC.OPEN_CONSOLE, async () => {
    if (process.platform !== 'darwin') return { ok: false, error: 'unsupported' };
    const candidates = [
      '/System/Applications/Utilities/Console.app',
      '/Applications/Utilities/Console.app',
    ];
    for (const consolePath of candidates) {
      if (fs.existsSync(consolePath)) {
        const err = await shell.openPath(consolePath);
        return err ? { ok: false, error: err } : { ok: true };
      }
    }
    return { ok: false, error: 'not-found' };
  });

  // 一键清理「非业务数据」：窗口位置 / 尺寸、文件管理列宽与面板高度、cd 历史等。
  // 不动 settings.json（偏好 / 业务设置）、日志与 ~/.ssh/config。
  ipcMain.handle(IPC.CLEAR_DATA, () => {
    const files = [
      TERMINAL_WINDOW_FILE,
      FILE_WINDOW_FILE,
      FILE_LAYOUT_FILE,
      FILE_WINDOW_LAYOUT_FILE,
      CD_HISTORY_FILE,
    ];
    for (const file of files) {
      try {
        fs.rmSync(file, { force: true });
      } catch (err) {
        /* ignore */
      }
    }
    return { ok: true };
  });

  ipcMain.handle(IPC.OPEN_EXTERNAL, async (_event, url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return { ok: false, error: 'invalid url' };
    }
    await shell.openExternal(url);
    return { ok: true };
  });

  // 设置界面「检查更新」（手动）：由 updater-service 弹窗提示结果。
  ipcMain.handle(IPC.UPDATER_CHECK, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return updater.checkForUpdatesInteractive(win);
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
