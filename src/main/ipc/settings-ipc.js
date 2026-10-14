'use strict';

const { app, nativeTheme } = require('electron');
const { IPC } = require('../../shared/constants');
const settings = require('../services/settings-service');
const { broadcast, applyPin, applyVibrancy } = require('../window-manager');
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

// Keep the native window appearance (incl. the vibrancy material) in sync with
// the app theme, so forced light/dark also tints the frosted glass correctly.
function applyThemeSource(theme) {
  nativeTheme.themeSource = theme === 'dark' ? 'dark' : theme === 'light' ? 'light' : 'system';
}

// 日志设置：日志文件保留天数。
function applyLogSettings(data) {
  logger.setRetentionDays(data.logRetentionDays);
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
    if (!keys || keys.includes('vibrancy')) applyVibrancy(Boolean(data.vibrancy));
    if (!keys || keys.includes('theme')) applyThemeSource(data.theme);
    if (!keys || keys.includes('logRetentionDays')) applyLogSettings(data);
  });

  nativeTheme.on('updated', () => {
    broadcast(IPC.THEME_CHANGED, { shouldUseDarkColors: nativeTheme.shouldUseDarkColors });
  });

  applyLaunchAtLogin(settings.get('launchAtLogin'));
  applyThemeSource(settings.get('theme'));
  applyLogSettings(settings.getAll());
}

module.exports = { registerSettingsIpc, applyLaunchAtLogin };
