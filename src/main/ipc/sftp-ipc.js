'use strict';

// SFTP handlers for the file manager. Every request must come from a window that is
// allowed to own an SFTP session (the terminal window's embedded panel or the
// detached file window).

const { clipboard } = require('electron');
const { IPC } = require('../../shared/constants');
const sftp = require('../services/sftp-service');
const wm = require('../window-manager');

function isAllowedSender(event) {
  const fileWin = wm.getFileWindow();
  const id = event.sender.id;
  return Boolean(
    wm.isTerminalWebContents(id) || (fileWin && !fileWin.isDestroyed() && fileWin.webContents.id === id)
  );
}

function registerSftpIpc(ipcMain) {
  ipcMain.handle(IPC.SFTP_CONNECT, (event, payload) => {
    if (!isAllowedSender(event)) return { ok: false, error: 'forbidden' };
    return sftp.connect(payload && payload.target, event.sender.id);
  });

  ipcMain.handle(IPC.SFTP_LIST, (event, payload) => {
    if (!isAllowedSender(event)) return { ok: false, error: 'forbidden' };
    return sftp.listDir(payload && payload.id, payload && payload.path);
  });

  ipcMain.handle(IPC.SFTP_DOWNLOAD, (event, payload) => {
    if (!isAllowedSender(event)) return { ok: false, error: 'forbidden' };
    const sender = event.sender;
    return sftp.download(payload && payload.id, payload && payload.path, (progress) =>
      sender.send(IPC.SFTP_PROGRESS, Object.assign({ id: payload && payload.id }, progress))
    );
  });

  ipcMain.handle(IPC.SFTP_UPLOAD, (event, payload) => {
    if (!isAllowedSender(event)) return { ok: false, error: 'forbidden' };
    const sender = event.sender;
    return sftp.upload(payload && payload.id, payload && payload.localPath, payload && payload.remoteDir, (progress) =>
      sender.send(IPC.SFTP_PROGRESS, Object.assign({ id: payload && payload.id }, progress))
    );
  });

  // 生成 scp 传输命令并复制到系统剪贴板（文件 / 目录右键菜单）。
  ipcMain.handle(IPC.SFTP_TRANSFER_COMMAND, (event, payload) => {
    if (!isAllowedSender(event)) return { ok: false };
    const result = sftp.transferCommand(payload && payload.id, payload && payload.path, Boolean(payload && payload.recursive));
    if (result && result.ok) clipboard.writeText(result.command);
    return result;
  });

  ipcMain.handle(IPC.SFTP_CLOSE, (event, payload) => {
    if (!isAllowedSender(event)) return { ok: false };
    return sftp.close(payload && payload.id);
  });
}

module.exports = { registerSftpIpc };
