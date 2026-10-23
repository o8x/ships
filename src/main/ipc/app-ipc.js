'use strict';

const fs = require('fs');
const path = require('path');
const { app, shell, BrowserWindow, dialog, clipboard, ClipboardItem } = require('electron');
const os = require('os');
const { IPC, VERSION, TERMINAL_WINDOW } = require('../../shared/constants');
const logger = require('../utils/logger');
const updater = require('../services/updater-service');
const fontService = require('../services/font-service');
const {
  DATA_DIR,
  LOG_DIR,
  describeDataFiles,
  TERMINAL_WINDOW_FILE,
  FILE_WINDOW_FILE,
  GAME_WINDOW_FILE,
  FILE_LAYOUT_FILE,
  FILE_WINDOW_LAYOUT_FILE,
  CD_HISTORY_FILE,
  MAIN_WINDOW_FILE,
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

  // 系统字体列表（设置 → 终端 → 字体）。
  ipcMain.handle(IPC.APP_LIST_FONTS, () => fontService.listFonts());

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
      MAIN_WINDOW_FILE,
      TERMINAL_WINDOW_FILE,
      FILE_WINDOW_FILE,
      GAME_WINDOW_FILE,
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

  // 终端里的文件路径：在 Finder 中定位（目录 / 文件都只“显示在文件夹中”，不执行任何文件）。
  ipcMain.handle(IPC.OPEN_PATH, async (_event, target) => {
    const raw = String(target || '').trim();
    if (!raw || raw.includes('\0')) return { ok: false, error: 'invalid path' };
    let filePath = raw;
    if (filePath === '~') filePath = os.homedir();
    else if (filePath.startsWith('~/')) filePath = path.join(os.homedir(), filePath.slice(2));
    if (!path.isAbsolute(filePath)) return { ok: false, error: 'not absolute' };
    try {
      await fs.promises.access(filePath);
    } catch (err) {
      return { ok: false, error: 'not found' };
    }
    shell.showItemInFolder(filePath);
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

  // 渲染层请求写日志：控制台 + vessel.log（窗口尺寸 / 字体 / 行高等调试信息）。
  ipcMain.on(IPC.LOG_WRITE, (_event, text) => {
    logger.info(String(text == null ? '' : text));
  });

  // 把 PNG data URL 写进系统剪贴板（二维码工具「复制二维码」）。
  // Electron 44 的 clipboard 使用 W3C 风格 async write(ClipboardItem[])，不再有 writeImage。
  ipcMain.handle(IPC.COPY_IMAGE, async (_event, dataUrl) => {
    const value = String(dataUrl || '');
    if (!/^data:image\/png;base64,/.test(value)) return { ok: false, error: 'invalid' };
    try {
      const buffer = Buffer.from(value.split(',')[1] || '', 'base64');
      if (!buffer.length) return { ok: false, error: 'empty' };
      await clipboard.write([
        new ClipboardItem({ 'image/png': new Blob([buffer], { type: 'image/png' }) }),
      ]);
    } catch (err) {
      return { ok: false, error: (err && err.message) || 'error' };
    }
    return { ok: true };
  });

  // 把 PNG data URL 保存为本地文件（二维码工具「下载到本地」）。
  ipcMain.handle(IPC.SAVE_IMAGE, async (event, payload) => {
    const dataUrl = String((payload && payload.dataUrl) || '');
    if (!/^data:image\/png;base64,/.test(dataUrl)) return { ok: false, error: 'invalid' };
    const defaultName = String((payload && payload.name) || 'qrcode.png');
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = { defaultPath: defaultName, filters: [{ name: 'PNG', extensions: ['png'] }] };
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    try {
      fs.writeFileSync(result.filePath, Buffer.from(dataUrl.split(',')[1] || '', 'base64'));
    } catch (err) {
      return { ok: false, error: (err && err.message) || 'error' };
    }
    return { ok: true, path: result.filePath };
  });
}

module.exports = { registerAppIpc };
