'use strict';

const { BrowserWindow } = require('electron');
const { IPC } = require('../../shared/constants');
const updater = require('../services/updater-service');
const { isUpdateWindow } = require('../window-manager');

function registerUpdateIpc(ipcMain) {
  // 下载窗口渲染层查询当前下载 / 倒计时状态（打开窗口或刷新时调用）。
  ipcMain.handle(IPC.UPDATE_STATE, (event) => {
    if (!isUpdateWindow(BrowserWindow.fromWebContents(event.sender))) return null;
    return updater.getUpdateState();
  });

  // 取消：下载阶段中止下载，已完成则停止倒计时、不立即重启（退出本次更新）。
  ipcMain.handle(IPC.UPDATE_CANCEL, (event) => {
    if (!isUpdateWindow(BrowserWindow.fromWebContents(event.sender))) return { ok: false };
    updater.cancelUpdate();
    return { ok: true };
  });

  // 立即重启并安装。
  ipcMain.handle(IPC.UPDATE_INSTALL, (event) => {
    if (!isUpdateWindow(BrowserWindow.fromWebContents(event.sender))) return { ok: false };
    updater.installNow();
    return { ok: true };
  });
}

module.exports = { registerUpdateIpc };
