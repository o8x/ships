'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, ipcMain } = require('electron');

/* 应用从 Ships 更名为 Vessel：首次启动时把旧数据目录 / 日志目录迁移到新名字，
   避免升级后丢失设置、SSH 密码、2FA、商品记录等。仅在目标不存在时执行。 */
(function migrateLegacyData() {
  if (!app.isPackaged) return;
  try {
    const newDataDir = app.getPath('userData');
    const oldDataDir = path.join(app.getPath('appData'), 'ships');
    if (oldDataDir !== newDataDir && !fs.existsSync(newDataDir) && fs.existsSync(oldDataDir)) {
      fs.renameSync(oldDataDir, newDataDir);
    }
    if (process.platform === 'darwin') {
      const newLogDir = path.join(os.homedir(), 'Library', 'Logs', 'Vessel');
      const oldLogDir = path.join(os.homedir(), 'Library', 'Logs', 'Ships');
      if (!fs.existsSync(newLogDir) && fs.existsSync(oldLogDir)) {
        fs.renameSync(oldLogDir, newLogDir);
      }
    }
  } catch (err) {
    /* best-effort：迁移失败不阻止应用启动 */
  }
})();

const { createTray } = require('./tray');
const wm = require('./window-manager');
const { registerAppIpc } = require('./ipc/app-ipc');
const { registerWindowIpc } = require('./ipc/window-ipc');
const { registerSettingsIpc } = require('./ipc/settings-ipc');
const { registerSshIpc } = require('./ipc/ssh-ipc');
const { registerGeoIpc } = require('./ipc/geo-ipc');
const { registerClipboardIpc } = require('./ipc/clipboard-ipc');
const { registerHashIpc } = require('./ipc/hash-ipc');
const { registerTotpIpc } = require('./ipc/twofa-ipc');
const { registerNetTestIpc } = require('./ipc/net-test-ipc');
const { registerNutrientIpc } = require('./ipc/nutrient-ipc');
const { registerTerminalIpc } = require('./ipc/terminal-ipc');
const { registerShortcutIpc } = require('./ipc/shortcut-ipc');
const { registerSftpIpc } = require('./ipc/sftp-ipc');
const { registerFileWindowIpc } = require('./ipc/file-window-ipc');
const { registerUpdateIpc } = require('./ipc/update-ipc');
const { registerBackupIpc } = require('./ipc/backup-ipc');
const { installApplicationMenu } = require('./menu');
const { requestLocalNetworkAccess } = require('./services/local-network-service');
const proxyService = require('./services/proxy-service');
const logger = require('./utils/logger');
const { DATA_FILES } = require('./utils/paths');
const { APP_NAME, VERSION, appConfig } = require('../shared/constants');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => wm.showMainWindow());
  app.whenReady().then(onReady);
}

function onReady() {
  if (process.platform === 'darwin' && app.dock && !appConfig.showDockIcon) {
    app.dock.hide();
  }

  registerAppIpc(ipcMain);
  registerWindowIpc(ipcMain);
  registerSettingsIpc(ipcMain);
  registerSshIpc(ipcMain);
  registerGeoIpc(ipcMain);
  registerClipboardIpc(ipcMain);
  registerHashIpc(ipcMain);
  registerTotpIpc(ipcMain);
  registerNetTestIpc(ipcMain);
  registerNutrientIpc(ipcMain);
  registerTerminalIpc(ipcMain);
  registerShortcutIpc(ipcMain);
  registerSftpIpc(ipcMain);
  registerFileWindowIpc(ipcMain);
  registerUpdateIpc(ipcMain);
  registerBackupIpc(ipcMain);

  installApplicationMenu();
  wm.createMainWindow();

  // 自动更新：打包后静默检查一次，发现新版本再提示下载 / 安装。
  require('./services/updater-service').initUpdater();

  const tray = createTray({
    onLeftClick: () => wm.toggleMainWindow(),
    onOpenSettings: () => wm.openSettingsWindow(),
  });
  wm.setTray(tray);

  printStartupInfo();
  // 启动时请求一次 macOS「本地网络」授权并保持 socket 30 秒；之后不再重复触发。
  requestLocalNetworkAccess();
  // 系统代理开关（默认关闭）：只在开启时解析 / 使用系统代理。
  proxyService.init();
}

function printStartupInfo() {
  logger.info(`${APP_NAME} v${VERSION} (${process.platform}/${process.arch})`);
  logger.info('data files:');
  for (const file of DATA_FILES) logger.info(`  - ${file}`);
}

app.on('window-all-closed', () => {
  // Menu bar app: keep running without windows.
});

app.on('before-quit', () => {
  require('./services/clipboard-service').stop();
  require('./services/sftp-service').closeAll();
  require('./services/terminal-service').killAll();
  require('./services/hotkey-service').unregisterAll();
});
