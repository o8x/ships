'use strict';

const { BrowserWindow } = require('electron');
const { IPC } = require('../../shared/constants');
const backup = require('../services/backup-service');

function registerBackupIpc(ipcMain) {
  // 导出全部配置（设置 + SSH 主机，密码明文）为 JSON 文件。
  ipcMain.handle(IPC.BACKUP_EXPORT, (event) =>
    backup.exportToFile(BrowserWindow.fromWebContents(event.sender))
  );
  // 导入并覆盖设置、只新增 SSH 主机。
  ipcMain.handle(IPC.BACKUP_IMPORT, (event) =>
    backup.importFromFile(BrowserWindow.fromWebContents(event.sender))
  );
}

module.exports = { registerBackupIpc };
