'use strict';

const { app, ipcMain } = require('electron');
const { createTray } = require('./tray');
const wm = require('./window-manager');
const { registerAppIpc } = require('./ipc/app-ipc');
const { registerWindowIpc } = require('./ipc/window-ipc');
const { registerSettingsIpc } = require('./ipc/settings-ipc');
const { registerSshIpc } = require('./ipc/ssh-ipc');
const { registerGeoIpc } = require('./ipc/geo-ipc');
const { registerStateIpc } = require('./ipc/state-ipc');
const { registerClipboardIpc } = require('./ipc/clipboard-ipc');
const { registerHashIpc } = require('./ipc/hash-ipc');
const logger = require('./utils/logger');
const { DATA_FILES } = require('./utils/paths');
const { APP_NAME, VERSION, ships } = require('../shared/constants');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => wm.showMainWindow());
  app.whenReady().then(onReady);
}

function onReady() {
  if (process.platform === 'darwin' && app.dock && !ships.showDockIcon) {
    app.dock.hide();
  }

  registerAppIpc(ipcMain);
  registerWindowIpc(ipcMain);
  registerSettingsIpc(ipcMain);
  registerSshIpc(ipcMain);
  registerGeoIpc(ipcMain);
  registerStateIpc(ipcMain);
  registerClipboardIpc(ipcMain);
  registerHashIpc(ipcMain);

  wm.createMainWindow();

  const tray = createTray({
    onLeftClick: () => wm.toggleMainWindow(),
    onOpenSettings: () => wm.openSettingsWindow(),
  });
  wm.setTray(tray);

  printStartupInfo();
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
});

app.on('activate', () => {
  wm.showMainWindow();
});
