'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const { app, dialog } = require('electron');
const settings = require('./settings-service');
const logger = require('../utils/logger');
const wm = require('../window-manager');
const { IPC, UPDATE_COUNTDOWN_SECONDS, APP_NAME } = require('../../shared/constants');
const pkg = require('../../../package.json');

/* 自动更新：
   - 用 electron-updater + GitHub Releases **只做版本检测**（读 latest-mac.yml，不需要签名）。
   - 发现新版本 → 提示后下载 → 小型不可关闭的前台下载窗口（进度条 + 取消 + 安装按钮）。
   - **macOS**：下载 `.dmg`（`模式 = dmg`），完成后按钮为「退出并安装」：退出本程序并挂载 DMG，
     由用户手动拖入 Applications 安装 —— 未签名 / ad-hoc 构建下也能更新（Squirrel 自动安装
     需要稳定的 Developer ID 签名）。
   - **Windows**：仍用 electron-updater 自动下载并 `quitAndInstall()`（模式 = auto）。
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
let downloadToken = null; // Windows（electron-updater）下载的取消令牌
let dmgRequest = null; // macOS DMG 下载的 http(s) 请求（可 destroy 取消）
let countdownTimer = null;
let countdownRemaining = 0;
const dl = {
  mode: 'auto', // 'dmg'（macOS：下载 DMG 手动安装）| 'auto'（Windows：electron-updater 自动安装）
  phase: 'idle', // 'idle' | 'downloading' | 'downloaded'
  version: '',
  percent: 0,
  transferred: 0,
  total: 0,
  bytesPerSecond: 0,
  countdown: 0,
  dmgPath: '',
  dmgName: '',
};

function snapshot() {
  return {
    mode: dl.mode,
    phase: dl.phase,
    version: dl.version,
    percent: dl.percent,
    transferred: dl.transferred,
    total: dl.total,
    bytesPerSecond: dl.bytesPerSecond,
    countdown: dl.countdown,
    dmgName: dl.dmgName,
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

/* ----------------------------- 下载窗口 ----------------------------- */

function reportProgress(transferred, total, bytesPerSecond) {
  if (dl.phase !== 'downloading') return;
  dl.transferred = Math.max(0, Number(transferred) || 0);
  dl.total = Math.max(0, Number(total) || 0);
  dl.percent = dl.total > 0 ? Math.max(0, Math.min(100, (dl.transferred / dl.total) * 100)) : dl.percent;
  if (Number.isFinite(bytesPerSecond) && bytesPerSecond >= 0) dl.bytesPerSecond = bytesPerSecond;
  wm.sendToUpdateWindow(IPC.UPDATE_PROGRESS, snapshot());
  logger.file(`[updater] downloading ${Math.round(dl.percent)}%`);
}

/* 确认下载：用户点「下载」后打开下载窗口并开始下载。 */
async function promptDownload(info) {
  if (dl.phase !== 'idle') {
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
  dl.dmgPath = '';
  dl.dmgName = '';
  dl.dmgRequest = null;
  dl.phase = 'downloading';
  dl.version = (info && info.version) || dl.version;
  dl.percent = 0;
  dl.transferred = 0;
  dl.total = 0;
  dl.bytesPerSecond = 0;
  dl.countdown = 0;
  wm.openUpdateWindow();
  logger.info(`[updater] download start: ${dl.version} (mode=${dl.mode})`);
  if (dl.mode === 'dmg') {
    startDmgDownload().catch(() => {});
  } else {
    startAutoDownload();
  }
}

function startAutoDownload() {
  const updater = loadUpdater();
  if (!updater) return;
  downloadToken = new updaterModule.CancellationToken();
  const promise = autoUpdater.downloadUpdate(downloadToken);
  if (promise && typeof promise.catch === 'function') promise.catch(() => {});
}

/* ------------------------- macOS：下载 DMG ------------------------- */

/* owner / repo：
   1) 优先 package.json 的 build.publish（开发 / 未裁剪时）；
   2) 打包后 electron-builder 会裁剪 package.json 的 build 段，此时读它生成的
      Resources/app-update.yml（electron-updater 用它做版本检测，必然存在）。 */
let publishCache = null;

function publishConfig() {
  if (publishCache) return publishCache;
  // 打包后 package.json 的 build 段会被裁剪，产物前缀仍固定是应用名（Ships）。
  const productName = (pkg.build && pkg.build.productName) || APP_NAME;

  const publish = (pkg.build && pkg.build.publish) || [];
  const gh = publish.find((entry) => entry && entry.provider === 'github') || {};
  if (gh.owner && gh.repo) {
    publishCache = { owner: gh.owner, repo: gh.repo, productName };
    return publishCache;
  }

  try {
    const ymlPath = path.join(process.resourcesPath || '', 'app-update.yml');
    const yml = fs.readFileSync(ymlPath, 'utf8');
    const pick = (key) => {
      const match = new RegExp(`^\\s*${key}:\\s*(.+)\\s*$`, 'm').exec(yml);
      return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : '';
    };
    const owner = pick('owner');
    const repo = pick('repo');
    if (owner && repo) {
      publishCache = { owner, repo, productName };
      return publishCache;
    }
  } catch (err) {
    logger.file('[updater] read app-update.yml failed:', (err && err.message) || err);
  }

  publishCache = { owner: '', repo: '', productName };
  return publishCache;
}

/* 按产物命名规则拼出 DMG URL（`appname-vx.y.z-arch.dmg`，见 AGENTS「产物文件名规则」）。 */
function directDmgUrl(version) {
  const { owner, repo, productName } = publishConfig();
  if (!owner || !repo) return null;
  const name = `${productName}-v${version}-${process.arch}.dmg`;
  return { url: `https://github.com/${owner}/${repo}/releases/download/v${version}/${name}`, name };
}

/* GitHub Releases API：挑出与当前架构匹配的 dmg（命名规则变化时更稳）。 */
async function apiDmgUrl(version) {
  const { owner, repo } = publishConfig();
  if (!owner || !repo) return null;
  const data = await httpGetJson(`https://api.github.com/repos/${owner}/${repo}/releases/tags/v${version}`);
  const assets = Array.isArray(data && data.assets) ? data.assets : [];
  const dmgs = assets.filter((a) => a && typeof a.name === 'string' && a.name.toLowerCase().endsWith('.dmg'));
  const match = dmgs.find((a) => a.name.includes(`-${process.arch}.dmg`)) || dmgs[0];
  if (match && match.browser_download_url) return { url: match.browser_download_url, name: match.name };
  return null;
}

/* 目标 DMG：优先用 GitHub API 精确匹配，失败（限流 / 离线 / 命名变化）再按命名规则拼 URL。 */
async function resolveDmgUrl(version) {
  const direct = directDmgUrl(version);
  try {
    const viaApi = await apiDmgUrl(version);
    if (viaApi) return viaApi;
  } catch (err) {
    logger.file('[updater] resolve dmg via API failed:', (err && err.message) || err);
  }
  return direct;
}

/* 用 Node 原生 http(s) 发起请求并跟随重定向（而非 Electron `net`）。
   原因：`net` 走 Chromium 网络栈，会触及加密的 Cookie 存储（打包时翻转了
   EnableCookieEncryption fuse），从而弹出 macOS「钥匙串」访问授权框；Node 原生请求
   完全不碰 Chromium 会话 / Cookie，因此更新检查 / 下载不再触发该弹框。 */
function requestStream(url, redirects = 0, onRequest) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      reject(err);
      return;
    }
    const mod = parsed.protocol === 'http:' ? http : https;
    const req = mod.get(parsed, { headers: { 'User-Agent': 'Ships-Updater', Accept: '*/*' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
        res.resume();
        resolve(requestStream(new URL(res.headers.location, parsed).toString(), redirects + 1, onRequest));
        return;
      }
      resolve({ req, res });
    });
    if (typeof onRequest === 'function') onRequest(req);
    req.on('error', reject);
  });
}

async function httpGetJson(url) {
  const { res } = await requestStream(url);
  if (res.statusCode !== 200) {
    res.resume();
    throw new Error(`HTTP ${res.statusCode}`);
  }
  const chunks = [];
  for await (const chunk of res) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function startDmgDownload() {
  let target = null;
  try {
    target = await resolveDmgUrl(dl.version);
  } catch (err) {
    target = null;
  }
  if (dl.phase !== 'downloading') return; // 解析期间被取消
  if (!target) {
    failDownload();
    return;
  }
  const destPath = path.join(app.getPath('downloads'), target.name);
  dl.dmgPath = destPath;
  dl.dmgName = target.name;
  try {
    await downloadDmg(target.url, destPath);
  } catch (err) {
    if (dl.phase !== 'downloading') return; // 已取消
    logger.warn('[updater] dmg download failed:', (err && err.message) || err);
    failDownload();
    return;
  }
  if (dl.phase !== 'downloading') return;
  onDownloaded({ version: dl.version });
}

function downloadDmg(url, destPath) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let file = null;
    const cleanup = (err) => {
      if (settled) return;
      settled = true;
      dmgRequest = null;
      try {
        if (file) file.destroy();
      } catch (e) {
        /* ignore */
      }
      reject(err);
    };

    (async () => {
      let res;
      try {
        const stream = await requestStream(url, 0, (req) => {
          dmgRequest = req;
        });
        res = stream.res;
      } catch (err) {
        cleanup(err);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        cleanup(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      file = fs.createWriteStream(destPath);
      const total = Number(res.headers['content-length']) || 0;
      let transferred = 0;
      let lastTime = Date.now();
      let lastBytes = 0;
      let bytesPerSecond = 0;
      res.on('data', (chunk) => {
        transferred += chunk.length;
        file.write(chunk);
        const now = Date.now();
        if (now - lastTime >= 500) {
          bytesPerSecond = Math.round(((transferred - lastBytes) * 1000) / (now - lastTime));
          lastTime = now;
          lastBytes = transferred;
        }
        reportProgress(transferred, total, bytesPerSecond);
      });
      res.on('end', () => {
        file.end(() => {
          if (settled) return;
          settled = true;
          dmgRequest = null;
          resolve();
        });
      });
      res.on('error', cleanup);
    })();
  });
}

function abortDmgDownload() {
  if (dmgRequest) {
    try {
      dmgRequest.destroy();
    } catch (err) {
      /* ignore */
    }
    dmgRequest = null;
  }
}

/* ------------------------------ 倒计时 / 安装 ------------------------------ */

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
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

/* 「退出并安装」/ 倒计时到 0：macOS 挂载 DMG 让用户手动安装；Windows 走 quitAndInstall。 */
function installNow() {
  stopCountdown();
  const win = wm.getUpdateWindow();
  if (win) win.__forceClose = true;
  if (dl.mode === 'dmg') installDmg();
  else installAuto();
}

function installDmg() {
  const dmgPath = dl.dmgPath;
  logger.info(`[updater] quit and mount dmg: ${dmgPath}`);
  if (dmgPath && fs.existsSync(dmgPath)) {
    // detached：即使本进程随后退出，挂载 DMG / 打开 Finder 仍会完成。
    try {
      spawn('/usr/bin/open', [dmgPath], { detached: true, stdio: 'ignore' }).unref();
    } catch (err) {
      logger.warn('[updater] open dmg failed:', (err && err.message) || err);
    }
  }
  app.quit();
  // 兜底：万一 quit 未生效（例如窗口拦截），数秒后强制退出。
  setTimeout(() => {
    try {
      app.exit(0);
    } catch (err) {
      /* ignore */
    }
  }, 5000);
}

function installAuto() {
  const updater = loadUpdater();
  if (!updater) return;
  logger.info('[updater] quit and install');
  // 兜底重启：未签名环境下 Squirrel 可能静默失败、应用不退出。
  let fallback = setTimeout(() => {
    fallback = null;
    logger.warn('[updater] quitAndInstall had no effect; forcing relaunch');
    try {
      app.relaunch();
    } catch (err) {
      /* ignore */
    }
    app.quit();
  }, 6000);
  const clearFallback = () => {
    if (fallback) {
      clearTimeout(fallback);
      fallback = null;
    }
  };
  if (typeof app.once === 'function') app.once('before-quit', clearFallback);
  setImmediate(() => {
    try {
      autoUpdater.quitAndInstall();
    } catch (err) {
      logger.warn('[updater] quitAndInstall failed:', (err && err.message) || err);
      clearFallback();
      try {
        app.relaunch();
      } catch (e) {
        /* ignore */
      }
      app.quit();
    }
  });
}

function resetDownloadState() {
  stopCountdown();
  downloadToken = null;
  dmgRequest = null;
  dl.phase = 'idle';
  dl.percent = 0;
  dl.transferred = 0;
  dl.total = 0;
  dl.bytesPerSecond = 0;
  dl.countdown = 0;
  dl.dmgPath = '';
  dl.dmgName = '';
}

/* 取消（下载窗口的「取消」按钮）：下载阶段中止下载；已完成则仅停止倒计时、不立即安装。 */
function cancelUpdate() {
  if (dl.phase === 'idle') {
    wm.closeUpdateWindow();
    return;
  }
  const wasDownloading = dl.phase === 'downloading';
  if (wasDownloading) {
    if (dl.mode === 'dmg') {
      abortDmgDownload();
      if (dl.dmgPath) {
        try {
          fs.rmSync(dl.dmgPath, { force: true });
        } catch (err) {
          /* ignore */
        }
      }
    } else if (downloadToken) {
      try {
        downloadToken.cancel();
      } catch (err) {
        /* ignore */
      }
    }
  }
  logger.file(`[updater] download cancelled (downloading=${wasDownloading})`);
  resetDownloadState();
  wm.closeUpdateWindow();
}

function failDownload() {
  resetDownloadState();
  wm.closeUpdateWindow();
  const c = copy();
  showBox({ type: 'info', buttons: ['OK'], defaultId: 0, title: c.checkTitle, message: c.notCheckable }).catch(() => {});
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
  dl.mode = process.platform === 'darwin' ? 'dmg' : 'auto';
  updater.autoDownload = false;
  // Windows 自动安装需要该标志；macOS 不走 Squirrel 安装，无影响。
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
    // 仅 Windows（auto）用 electron-updater 下载时触发；macOS DMG 由 downloadDmg 汇报进度。
    if (dl.mode !== 'auto' || dl.phase !== 'downloading') return;
    reportProgress(Number(p && p.transferred) || 0, Number(p && p.total) || 0, Number(p && p.bytesPerSecond) || 0);
    dl.percent = Math.max(0, Math.min(100, Number(p && p.percent) || dl.percent));
  });
  updater.on('update-downloaded', (info) => {
    if (dl.mode !== 'auto') return;
    onDownloaded(info);
  });
  updater.on('update-cancelled', () => {
    logger.file('[updater] download cancelled by updater');
  });
  updater.on('error', (err) => {
    // 详细错误只写日志；面向用户不报技术错误。
    logger.warn('[updater] error:', (err && err.message) || err);
    if (dl.phase === 'downloading') {
      failDownload();
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
