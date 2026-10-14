'use strict';

// Detached file-manager window + the persisted file-manager layout (shared with the
// embedded panel in the terminal window).

const { IPC } = require('../../shared/constants');
const wm = require('../window-manager');
const layout = require('../services/layout-service');
const settings = require('../services/settings-service');

function isFileSender(event) {
  const win = wm.getFileWindow();
  return Boolean(win && !win.isDestroyed() && win.webContents.id === event.sender.id);
}

function registerFileWindowIpc(ipcMain) {
  ipcMain.handle(IPC.FILE_WINDOW_OPEN, (_event, payload) => {
    const win = wm.openFileWindow(payload && payload.target, payload && payload.path);
    return { ok: Boolean(win) };
  });

  ipcMain.handle(IPC.FILE_WINDOW_INFO, (event) => {
    if (!isFileSender(event)) return { ok: false };
    return { ok: true, target: wm.getFileWindowTarget(), path: wm.getFileWindowPath(), settings: settings.getAll() };
  });

  ipcMain.handle(IPC.FILE_WINDOW_CLOSE, (event) => {
    if (!isFileSender(event)) return { ok: false };
    wm.closeFileWindow();
    return { ok: true };
  });

  ipcMain.handle(IPC.FILE_WINDOW_SET_TOP, (_event, payload) => {
    const value = Boolean(payload && payload.value);
    settings.set({ fileWindowAlwaysOnTop: value });
    return { ok: true, alwaysOnTop: value };
  });

  // 拖拽窗口后把内容高度收到「文件行整数倍」（渲染层按实测余量请求）。
  ipcMain.handle(IPC.FILE_WINDOW_SNAP_SIZE, (event, payload) => {
    if (!isFileSender(event)) return { ok: false };
    return wm.snapFileWindowContentSize(wm.getFileWindow(), payload && payload.height);
  });

  // scope: 'panel'（内嵌面板，默认）| 'window'（独立文件窗口）—— 两份独立记录。
  ipcMain.handle(IPC.FILES_LAYOUT_GET, (_event, payload) => layout.get(payload && payload.scope));
  ipcMain.handle(IPC.FILES_LAYOUT_SET, (_event, payload) =>
    layout.set(payload && payload.scope, payload && payload.patch)
  );
}

module.exports = { registerFileWindowIpc };
