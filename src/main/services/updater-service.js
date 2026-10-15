'use strict';

const { app, dialog } = require('electron');
const settings = require('./settings-service');
const logger = require('../utils/logger');
const wm = require('../window-manager');
const { IPC, UPDATE_COUNTDOWN_SECONDS } = require('../../shared/constants');

/* 自动更新（electron-updater + GitHub Releases）：
   - 启动后静默检查一次；发现新版本才「提示后下载」。
   - 用户确认下载后弹出一个**小型的、不可关闭的前台下载窗口**（进度条 + 取消 + 重启更新按钮）；
     下载完成后「重启更新」变为可用，并显示 60 秒倒计时自动重启安装。
   - 取消 = 退出本次更新（下载阶段会中止下载）。
   - 设置 → Ships → 关于 可手动「检查更新」（提示已是最新 / 暂时无法检查，不报技术错误）。
   仅打包后的 macOS / Windows 生效；开发模式不检查。 */

const COPY = {
  zh: {
    availableTitle: '发现新版本',
    availableMessage: (v, cur) => `发现新版本 v${v}（当前 v${cur}）。现在下载吗？`,
    download: '下载',
    later: '稍后',
    checkTitle: '检查更新',
    notAvailable: '当前已是最新版本',
    notCheckable: '暂时无法检查更新，请稍后再试',
    devMessage: '开发模式不检查更新',
  },
  en: {
    availableTitle: 'Update available',
    availableMessage: (v, cur) => `Version v${v} is available (current v${cur}). Download now?`,
    download: 'Download',
    later: 'Later',
    checkTitle: 'Check for updates',
    notAvailable: 'You are on the latest version',
    notCheckable: 'Unable to check for updates right now. Please try again later.',
    devMessage: 'Update check is disabled in development',
  },
};

function copy() {
  return COPY[settings.get('locale') === 'en' ? 'en' : 'zh'];
}

let updaterModule = null;
let autoUpdater = null;
let promptWindow = null; // 手动检查时设置窗口，用作弹窗父级
let interactiveChecking = false;
let manualCheck = false;
let promptedVersion = '';

// 下载窗口状态（可查询、可广播）。
let downloadToken = null;
let countdownTimer = null;
let countdownRemaining = 0;
const dl = {
  phase: 'idle', // 'idle' | 'downloading' | 'downloaded'
  version: '',
  percent: 0,
  transferred: 0,
  total: 0,
  bytesPerSecond: 0,
  countdown: 0,
};

function snapshot() {
  return {
    phase: dl.phase,
    version: dl.version,
    percent: dl.percent,
    transferred: dl.transferred,
    total: dl.total,
    bytesPerSecond: dl.bytesPerSecond,
    countdown: dl.countdown,
  };
}

function supported() {
  return app.isPackaged && (process.platform === 'darwin' || process.platform === 'win32');
}

function loadUpdater() {
  if (autoUpdater) return autoUpdater;
  try {
    updaterModule = require('electron-updater');
    autoUpdater = updaterModule.autoUpdater;
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

/* 确认下载：用户点「下载」后打开下载窗口并开始下载。 */
async function promptDownload(info) {
  if (dl.phase !== 'idle') {
    // 已在下载 / 已下载完成：直接把下载窗口拉到前台。
    wm.openUpdateWindow();
    return;
  }
  const c = copy();
  const { response } = await showBox({
    type: 'info',
    buttons: [c.download, c.later],
    defaultId: 0,
    cancelId: 1,
    title: c.availableTitle,
    message: c.availableMessage(info.version, app.getVersion()),
  });
  if (response === 0) startDownload(info);
}

function startDownload(info) {
  const updater = loadUpdater();
  if (!updater) return;
  dl.phase = 'downloading';
  dl.version = (info && info.version) || dl.version;
  dl.percent = 0;
  dl.transferred = 0;
  dl.total = 0;
  dl.bytesPerSecond = 0;
  dl.countdown = 0;
  downloadToken = new updaterModule.CancellationToken();
  wm.openUpdateWindow();
  logger.info(`[updater] download start: ${dl.version}`);
  const promise = autoUpdater.downloadUpdate(downloadToken);
  if (promise && typeof promise.catch === 'function') promise.catch(() => {});
}

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function installNow() {
  stopCountdown();
  const updater = loadUpdater();
  if (!updater) return;
  logger.info('[updater] quit and install');
  // 放行下载窗口的 close 拦截，避免拖住退出。
  const win = wm.getUpdateWindow();
  if (win) win.__forceClose = true;
  setImmediate(() => {
    try {
      autoUpdater.quitAndInstall();
    } catch (err) {
      logger.warn('[updater] quitAndInstall failed:', (err && err.message) || err);
    }
  });
}

function startCountdown() {
  stopCountdown();
  countdownRemaining = UPDATE_COUNTDOWN_SECONDS;
  dl.countdown = countdownRemaining;
  countdownTimer = setInterval(() => {
    countdownRemaining -= 1;
    dl.countdown = Math.max(0, countdownRemaining);
    wm.sendToUpdateWindow(IPC.UPDATE_COUNTDOWN, { countdown: dl.countdown });
    if (countdownRemaining <= 0) {
      stopCountdown();
      installNow();
    }
  }, 1000);
}

function resetDownloadState() {
  stopCountdown();
  downloadToken = null;
  dl.phase = 'idle';
  dl.percent = 0;
  dl.transferred = 0;
  dl.total = 0;
  dl.bytesPerSecond = 0;
  dl.countdown = 0;
}

/* 取消（下载窗口的「取消」按钮）：下载阶段中止下载；已完成则仅停止倒计时、不立即重启。 */
function cancelUpdate() {
  if (dl.phase === 'idle') {
    wm.closeUpdateWindow();
    return;
  }
  const wasDownloading = dl.phase === 'downloading';
  if (wasDownloading && downloadToken) {
    try {
      downloadToken.cancel();
    } catch (err) {
      /* ignore */
    }
  }
  logger.file(`[updater] download cancelled (downloading=${wasDownloading})`);
  resetDownloadState();
  wm.closeUpdateWindow();
}

function onDownloaded(info) {
  // 已取消 / 未在下载（例如取消后下载才结束的竞态）：忽略，不重开窗口。
  if (dl.phase !== 'downloading') return;
  dl.phase = 'downloaded';
  dl.version = (info && info.version) || dl.version;
  dl.percent = 100;
  dl.bytesPerSecond = 0;
  logger.info(`[updater] downloaded: ${info && info.version}`);
  wm.openUpdateWindow();
  // 先启动倒计时（写入 countdown 初值），再发快照，保证「下载完成」那一刻就有 60 秒。
  startCountdown();
  wm.sendToUpdateWindow(IPC.UPDATE_DOWNLOADED, snapshot());
}

/* 启动时调用一次。仅打包后生效；静默检查，有新版本才弹窗。 */
function initUpdater() {
  if (!supported()) return;
  const updater = loadUpdater();
  if (!updater) return;
  updater.autoDownload = false;
  /* 必须为 true：macOS 上 MacUpdater 只有在 download 完成时该标志为 true 才会让 Squirrel
     预取更新（否则 squirrelDownloadedUpdate 一直为 false，quitAndInstall() 会走「等 Squirrel
     再取一次」的分支，通常静默失败 —— 表现就是点「重启更新」毫无反应）。
     注意：MacUpdater 不注册 JS 的 quit 安装钩子，所以这里为 true 不会导致「取消后退出应用时
     自动安装」；安装只在下载窗口的「重启更新」/ 倒计时调用 quitAndInstall() 时发生。 */
  updater.autoInstallOnAppQuit = true;

  updater.on('update-available', (info) => {
    const wasManual = manualCheck;
    manualCheck = false;
    // 手动检查每次都要有反馈；启动时的静默检查对同一版本只提示一次，避免重复打扰。
    if (!wasManual && info && info.version && info.version === promptedVersion) return;
    promptedVersion = info && info.version;
    logger.info(`[updater] update available: ${info && info.version}`);
    promptDownload(info).catch(() => {});
  });
  updater.on('update-not-available', () => {
    logger.info('[updater] already up to date');
    if (!manualCheck) return;
    manualCheck = false;
    const c = copy();
    showBox({ type: 'info', buttons: ['OK'], defaultId: 0, title: c.checkTitle, message: c.notAvailable }).catch(
      () => {}
    );
  });
  updater.on('download-progress', (p) => {
    if (dl.phase !== 'downloading') return;
    dl.percent = Math.max(0, Math.min(100, Number(p && p.percent) || 0));
    dl.transferred = Number(p && p.transferred) || 0;
    dl.total = Number(p && p.total) || 0;
    dl.bytesPerSecond = Number(p && p.bytesPerSecond) || 0;
    wm.sendToUpdateWindow(IPC.UPDATE_PROGRESS, snapshot());
    logger.file(`[updater] downloading ${Math.round(dl.percent)}%`);
  });
  updater.on('update-downloaded', (info) => {
    onDownloaded(info);
  });
  updater.on('update-cancelled', () => {
    logger.file('[updater] download cancelled by updater');
  });
  updater.on('error', (err) => {
    // 详细错误只写日志；面向用户不报技术错误。
    logger.warn('[updater] error:', (err && err.message) || err);
    if (dl.phase === 'downloading') {
      // 下载失败：结束下载窗口并给一句友好提示。
      resetDownloadState();
      wm.closeUpdateWindow();
      const c = copy();
      showBox({ type: 'info', buttons: ['OK'], defaultId: 0, title: c.checkTitle, message: c.notCheckable }).catch(
        () => {}
      );
      return;
    }
    if (manualCheck) {
      manualCheck = false;
      const c = copy();
      showBox({
        type: 'info',
        buttons: ['OK'],
        defaultId: 0,
        title: c.checkTitle,
        message: c.notCheckable,
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

/* 设置界面「检查更新」（手动）：会提示已最新 / 暂时无法检查（不报技术错误）。 */
async function checkForUpdatesInteractive(win) {
  if (!supported()) {
    return { ok: false, error: 'unsupported', message: copy().devMessage };
  }
  const updater = loadUpdater();
  if (!updater) return { ok: false, error: 'unavailable', message: copy().notCheckable };
  // 正在下载 / 已完成：不重复检查，直接把下载窗口拉到前台。
  if (dl.phase !== 'idle') {
    wm.openUpdateWindow();
    return { ok: true };
  }
  if (interactiveChecking) return { ok: true, checking: true };
  interactiveChecking = true;
  promptWindow = win || promptWindow;
  manualCheck = true;
  try {
    await updater.checkForUpdates();
  } catch (err) {
    // 详细错误只写日志；「error」事件的处理器已给出手动检查的友好提示，这里不再重复。
    manualCheck = false;
    logger.warn('[updater] manual check failed:', (err && err.message) || err);
    return { ok: true };
  } finally {
    interactiveChecking = false;
  }
  // 兜底：整次检查没有触发任何事件（理论上仅当更新被停用），也要给用户一个反馈。
  if (manualCheck) {
    manualCheck = false;
    return { ok: false, error: 'no-result', message: copy().notCheckable };
  }
  return { ok: true };
}

/* 下载窗口渲染层查询当前状态（打开窗口 / 刷新时调用）。 */
function getUpdateState() {
  return snapshot();
}

module.exports = {
  initUpdater,
  checkForUpdatesInteractive,
  getUpdateState,
  cancelUpdate,
  installNow,
  supported,
};
