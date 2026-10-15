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
  terminalCloseAction,
  destroyTerminalWindow,
  startBallDrag,
  stopBallDrag,
  exitBallMode,
  shrinkTerminalToBall,
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
      // 终端窗口：关闭按钮行为 = 隐藏时收缩成「悬浮球」；否则销毁。其它窗口照旧关闭。
      if (isTerminalWindow(win)) {
        if (terminalCloseAction() === 'hide') shrinkTerminalToBall(win);
        else destroyTerminalWindow(win);
        return { ok: true, action };
      }
      win.close();
      return { ok: true, action };
    }
    if (action === 'minimize') {
      // 终端窗口禁用最小化。
      if (isTerminalWindow(win)) return { ok: false, action };
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

  // 悬浮球：拖动（按光标位置移动窗口）与点击放大回终端窗口。
  ipcMain.on(IPC.TERMINAL_BALL_DRAG, (event, payload) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (payload && payload.phase === 'start') startBallDrag(win, payload.x, payload.y);
    else stopBallDrag();
  });
  ipcMain.handle(IPC.TERMINAL_BALL_RESTORE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return { ok: false };
    exitBallMode(win, true);
    return { ok: true };
  });

  // 「固定」按钮（仅当前终端窗口，默认关）：开启后该窗口失焦不再缩成悬浮球。
  ipcMain.handle(IPC.TERMINAL_BALL_PIN, (event, payload) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed() || !isTerminalWindow(win)) return { ok: false };
    win.__ballPin = Boolean(payload && payload.value);
    return { ok: true, value: win.__ballPin };
  });
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
