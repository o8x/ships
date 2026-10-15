'use strict';

const { app, dialog } = require('electron');
const settings = require('./settings-service');
const logger = require('../utils/logger');

/* 自动更新（electron-updater + GitHub Releases）：
   - 启动后静默检查一次；发现新版本才「提示后下载」。
   - 下载完成再「提示后安装」；选稍后则退出时自动安装（autoInstallOnAppQuit）。
   - 设置 → Ships → 关于 可手动「检查更新」（会提示已是最新 / 失败原因）。
   仅打包后的 macOS / Windows 生效；开发模式不检查。 */

const COPY = {
  zh: {
    availableTitle: '发现新版本',
    availableMessage: (v, cur) => `发现新版本 v${v}（当前 v${cur}）。现在下载吗？`,
    download: '下载',
    later: '稍后',
    readyTitle: '更新已就绪',
    readyMessage: (v) => `v${v} 已下载完成。现在重启并安装吗？（选择「稍后」将在退出应用时自动安装）`,
    install: '重启安装',
    notAvailableTitle: '检查更新',
    notAvailable: '当前已是最新版本',
    errorTitle: '检查更新失败',
    errorMessage: (m) => `无法检查更新：${m}`,
    devMessage: '开发模式不检查更新',
  },
  en: {
    availableTitle: 'Update available',
    availableMessage: (v, cur) => `Version v${v} is available (current v${cur}). Download now?`,
    download: 'Download',
    later: 'Later',
    readyTitle: 'Update ready',
    readyMessage: (v) =>
      `v${v} has been downloaded. Restart and install now? (Choosing "Later" installs it when you quit.)`,
    install: 'Restart & install',
    notAvailableTitle: 'Check for updates',
    notAvailable: 'You are on the latest version',
    errorTitle: 'Update check failed',
    errorMessage: (m) => `Could not check for updates: ${m}`,
    devMessage: 'Update check is disabled in development',
  },
};

function copy() {
  return COPY[settings.get('locale') === 'en' ? 'en' : 'zh'];
}

let autoUpdater = null;
let promptWindow = null; // 手动检查时设置窗口，用作弹窗父级
let interactiveChecking = false;
let manualCheck = false;
let promptedVersion = '';

function supported() {
  return app.isPackaged && (process.platform === 'darwin' || process.platform === 'win32');
}

function loadUpdater() {
  if (autoUpdater) return autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (err) {
    logger.warn('[updater] electron-updater unavailable:', (err && err.message) || err);
    return null;
  }
  return autoUpdater;
}

function showBox(options) {
  const win = promptWindow && !promptWindow.isDestroyed() ? promptWindow : null;
  return win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
}

async function promptDownload(info) {
  const c = copy();
  const { response } = await showBox({
    type: 'info',
    buttons: [c.download, c.later],
    defaultId: 0,
    cancelId: 1,
    title: c.availableTitle,
    message: c.availableMessage(info.version, app.getVersion()),
  });
  if (response === 0) {
    autoUpdater.downloadUpdate().catch((err) => {
      logger.warn('[updater] download failed:', (err && err.message) || err);
    });
  }
}

async function promptInstall(info) {
  const c = copy();
  const { response } = await showBox({
    type: 'info',
    buttons: [c.install, c.later],
    defaultId: 0,
    cancelId: 1,
    title: c.readyTitle,
    message: c.readyMessage(info.version),
  });
  if (response === 0) {
    setImmediate(() => autoUpdater.quitAndInstall());
  }
}

/* 启动时调用一次。仅打包后生效；静默检查，有新版本才弹窗。 */
function initUpdater() {
  if (!supported()) return;
  const updater = loadUpdater();
  if (!updater) return;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;

  updater.on('update-available', (info) => {
    manualCheck = false;
    if (info && info.version && info.version === promptedVersion) return;
    promptedVersion = info && info.version;
    logger.info(`[updater] update available: ${info && info.version}`);
    promptDownload(info).catch(() => {});
  });
  updater.on('update-not-available', () => {
    logger.info('[updater] already up to date');
    if (manualCheck) {
      manualCheck = false;
      const c = copy();
      showBox({ type: 'info', buttons: ['OK'], defaultId: 0, title: c.notAvailableTitle, message: c.notAvailable }).catch(
        () => {}
      );
    }
  });
  updater.on('download-progress', (p) => {
    logger.file(`[updater] downloading ${Math.round((p && p.percent) || 0)}%`);
  });
  updater.on('update-downloaded', (info) => {
    logger.info(`[updater] downloaded: ${info && info.version}`);
    promptInstall(info).catch(() => {});
  });
  updater.on('error', (err) => {
    logger.warn('[updater] error:', (err && err.message) || err);
    if (manualCheck) {
      manualCheck = false;
      const c = copy();
      showBox({
        type: 'error',
        buttons: ['OK'],
        defaultId: 0,
        title: c.errorTitle,
        message: c.errorMessage((err && err.message) || String(err)),
      }).catch(() => {});
    }
  });

  // 启动 5s 后静默检查一次（不打扰）。
  setTimeout(() => {
    updater.checkForUpdates().catch((err) => {
      logger.warn('[updater] initial check failed:', (err && err.message) || err);
    });
  }, 5000);
}

/* 设置界面「检查更新」（手动）：会提示已最新 / 失败原因。 */
async function checkForUpdatesInteractive(win) {
  if (!supported()) {
    return { ok: false, error: 'unsupported', message: copy().devMessage };
  }
  const updater = loadUpdater();
  if (!updater) return { ok: false, error: 'unavailable' };
  if (interactiveChecking) return { ok: true, checking: true };
  interactiveChecking = true;
  promptWindow = win || promptWindow;
  manualCheck = true;
  try {
    await updater.checkForUpdates();
  } catch (err) {
    manualCheck = false;
    return { ok: false, error: (err && err.message) || String(err) };
  } finally {
    interactiveChecking = false;
  }
  return { ok: true };
}

module.exports = { initUpdater, checkForUpdatesInteractive, supported };
