'use strict';

const { app, nativeTheme } = require('electron');
const { IPC } = require('../../shared/constants');
const settings = require('../services/settings-service');
const { broadcast, applyPin } = require('../window-manager');
const logger = require('../utils/logger');

function applyLaunchAtLogin(enabled) {
  if (process.platform !== 'darwin') return;
  try {
    const next = Boolean(enabled);
    if (app.getLoginItemSettings().openAtLogin === next) return;
    app.setLoginItemSettings({ openAtLogin: next });
  } catch (err) {
    logger.warn('setLoginItemSettings failed:', err.message);
  }
}

function registerSettingsIpc(ipcMain) {
  ipcMain.handle(IPC.SETTINGS_GET, () => settings.getAll());

  ipcMain.handle(IPC.SETTINGS_SET, (_event, patch) => {
    const next = settings.set(patch);
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'launchAtLogin')) {
      applyLaunchAtLogin(patch.launchAtLogin);
    }
    return next;
  });

  settings.on('changed', (data, keys) => {
    broadcast(IPC.SETTINGS_CHANGED, data);
    if (!keys || keys.includes('pinWindow')) applyPin(Boolean(data.pinWindow));
  });

  nativeTheme.on('updated', () => {
    broadcast(IPC.THEME_CHANGED, { shouldUseDarkColors: nativeTheme.shouldUseDarkColors });
  });

  applyLaunchAtLogin(settings.get('launchAtLogin'));
}

module.exports = { registerSettingsIpc, applyLaunchAtLogin };
