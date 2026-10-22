'use strict';

// 读取 macOS 当前 Space（Mission Control 桌面）。
// 优先调用 src/main/scripts/space-bridge.py（Python ctypes → SkyLight 私有 API
// `CGSCopyManagedDisplaySpaces`），拿到 WindowServer 的实时值；失败时回退到解析
// com.apple.spaces（`defaults export` 经 cfprefsd，切换 Space 后可能短暂仍是旧值）。
//
// 用途（见 window-manager）：终端窗口创建 / 从球展开时记录当前 Space；
// 失焦准备缩成悬浮球时，若当前 Space 已变（用户切了桌面），就不缩球、保持终端窗口原样。

const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const SPACES_DOMAIN = 'com.apple.spaces';
const DEFAULTS_BIN = '/usr/bin/defaults';
const PLUTIL_BIN = '/usr/bin/plutil';
// `defaults export` + `plutil` 都是本地小命令，正常几十毫秒；超时按读取失败处理。
const QUERY_TIMEOUT_MS = 1500;
// CGS 读取走 python3（与终端 PTY 桥相同的候选路径）；超时同样按失败回退。
const PYTHON_CANDIDATES = ['/usr/bin/python3', '/opt/homebrew/bin/python3', '/usr/local/bin/python3'];

/* Packaged builds keep the app source inside app.asar; scripts are extracted to
   app.asar.unpacked (see build.asarUnpack), so rewrite the path when needed. */
function unpackedPath(file) {
  const marker = `${path.sep}app.asar${path.sep}`;
  return file.includes(marker) ? file.replace(marker, `${path.sep}app.asar.unpacked${path.sep}`) : file;
}

const BRIDGE = unpackedPath(path.join(__dirname, '..', 'scripts', 'space-bridge.py'));

function pythonBinary() {
  const override = String(process.env.VESSEL_PYTHON || process.env.SHIPS_PYTHON || '').trim();
  if (override) return override;
  for (const candidate of PYTHON_CANDIDATES) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch (err) {
      /* ignore */
    }
  }
  return 'python3';
}

let inflight = null;

/* Live Space signature straight from WindowServer (immediate after switching). */
function readCgsSignature() {
  return new Promise((resolve) => {
    if (!fs.existsSync(BRIDGE)) {
      resolve(null);
      return;
    }
    execFile(
      pythonBinary(),
      [BRIDGE],
      { timeout: QUERY_TIMEOUT_MS, maxBuffer: 64 * 1024 },
      (err, stdout) => {
        if (err) {
          logger.file(`[space] cgs bridge failed: ${err.message}`);
          resolve(null);
          return;
        }
        const signature = String(stdout || '').trim();
        resolve(signature || null);
      }
    );
  });
}

/* com.apple.spaces → JSON：`defaults export` 从 cfprefsd 读实时 plist，
   `plutil` 只负责转成 JSON（不在主进程手写 plist 解析）。 */
function readSpacesJson() {
  return new Promise((resolve) => {
    let settled = false;
    let output = '';
    let errorOutput = '';
    let defaults = null;
    let plutil = null;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => {
      if (defaults) defaults.kill();
      if (plutil) plutil.kill();
      logger.file('[space] read com.apple.spaces timed out');
      finish(null);
    }, QUERY_TIMEOUT_MS);

    try {
      defaults = spawn(DEFAULTS_BIN, ['export', SPACES_DOMAIN, '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
      plutil = spawn(PLUTIL_BIN, ['-convert', 'json', '-o', '-', '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      finish(null);
      return;
    }

    defaults.stdout.pipe(plutil.stdin);
    defaults.stderr.on('data', (chunk) => {
      errorOutput += chunk;
    });
    plutil.stdout.on('data', (chunk) => {
      output += chunk;
    });
    plutil.stderr.on('data', (chunk) => {
      errorOutput += chunk;
    });
    // defaults 提前失败时 plutil 的 stdin 会 EPIPE，忽略即可。
    plutil.stdin.on('error', () => {});
    defaults.on('error', () => finish(null));
    plutil.on('error', () => finish(null));
    plutil.on('close', (code) => {
      if (code !== 0) {
        if (errorOutput) logger.file(`[space] read failed: ${errorOutput.trim()}`);
        finish(null);
        return;
      }
      try {
        finish(JSON.parse(output));
      } catch (err) {
        logger.file(`[space] parse failed: ${err.message}`);
        finish(null);
      }
    });
  });
}

/* 从 com.apple.spaces 的结构里取当前 Space 签名：
   SpacesDisplayConfiguration["Management Data"].Monitors[*]["Current Space"].uuid
   只保留真正有活动 Space 的显示器（旧的 / 未连接的显示器条目没有 Current Space）。 */
function signatureOf(parsed) {
  const config = parsed && parsed.SpacesDisplayConfiguration;
  const management = config && config['Management Data'];
  const monitors = management && management.Monitors;
  if (!Array.isArray(monitors)) return null;
  const uuids = [];
  for (const monitor of monitors) {
    const space = monitor && monitor['Current Space'];
    const uuid = space && space.uuid;
    if (typeof uuid === 'string' && uuid) uuids.push(uuid);
  }
  if (!uuids.length) return null;
  uuids.sort();
  return uuids.join('|');
}

/* 当前 Space 签名；读取失败 / 结构异常返回 null。并发调用共用同一次读取。
   先问 WindowServer（实时），失败再退回解析 com.apple.spaces（可能滞后）。 */
function currentSpaces() {
  if (inflight) return inflight;
  inflight = readCgsSignature()
    .then((signature) => (signature ? signature : readSpacesJson().then((parsed) => signatureOf(parsed))))
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

module.exports = { currentSpaces, signatureOf };
