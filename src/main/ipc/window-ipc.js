'use strict';

const { BrowserWindow } = require('electron');
const { IPC } = require('../../shared/constants');
const {
  hideMainWindow,
  openSettingsWindow,
  closeSettingsWindow,
  getMainWindow,
  getSettingsWindow,
  getTerminalWindow,
  isTerminalWindow,
  openTerminalWindow,
  closeTerminalWindow,
  getFileWindow,
  openFileWindow,
} = require('../window-manager');

function registerWindowIpc(ipcMain) {
  /* 自绘「小红绿灯」（终端窗口）：只作用于发起请求的那个窗口，能力最小化。 */
  ipcMain.handle(IPC.WINDOW_CONTROL, (event, payload) => {
    const action = payload && payload.action;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return { ok: false, action };
    if (action === 'close') {
      // 终端窗口：按「关闭按钮行为」隐藏或销毁；其它窗口照旧关闭
      if (isTerminalWindow(win)) closeTerminalWindow(win);
      else win.close();
      return { ok: true, action };
    }
    if (action === 'minimize') {
      win.minimize();
      return { ok: true, action };
    }
    if (action === 'zoom') {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
      return { ok: true, action };
    }
    return { ok: false, action };
  });

  ipcMain.on(IPC.WINDOW_HIDE, () => hideMainWindow());
  ipcMain.on(IPC.WINDOW_OPEN_SETTINGS, (_event, section) => {
    hideMainWindow();
    openSettingsWindow(typeof section === 'string' ? section : '');
  });
  ipcMain.on(IPC.WINDOW_CLOSE_SETTINGS, () => closeSettingsWindow());

  ipcMain.handle(IPC.DEVTOOLS_OPEN, (_event, target) => {
    // target: 'main'（悬浮面板）/ 'settings' / 'terminal'（置顶终端窗口）/ 'file'（独立文件窗口）；
    // 未打开时先打开对应窗口。
    const win =
      target === 'settings'
        ? getSettingsWindow()
        : target === 'terminal'
          ? getTerminalWindow() || openTerminalWindow()
          : target === 'file'
            ? getFileWindow() || openFileWindow()
            : getMainWindow();
    if (!win) return { ok: false };
    if (target !== 'settings') win.show();
    win.webContents.openDevTools({ mode: 'detach' });
    return { ok: true };
  });
}

module.exports = { registerWindowIpc };
