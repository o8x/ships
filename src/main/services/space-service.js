'use strict';

// 读取 macOS 当前 Space（Mission Control 桌面）。
// 直接解析 com.apple.spaces（经 cfprefsd 取实时值），把每块显示器上的
// "Current Space" uuid 排序拼成一个可比较的签名（多显示器时任一屏幕切换都会变）。
//
// 用途（见 window-manager）：终端窗口打开 / 获得焦点时记录当前 Space；
// 失焦准备缩成悬浮球时，若当前 Space 已变（用户切了桌面），就不缩球、保持终端窗口原样。

const { spawn } = require('child_process');
const logger = require('../utils/logger');

const SPACES_DOMAIN = 'com.apple.spaces';
const DEFAULTS_BIN = '/usr/bin/defaults';
const PLUTIL_BIN = '/usr/bin/plutil';
// `defaults export` + `plutil` 都是本地小命令，正常几十毫秒；超时按读取失败处理。
const QUERY_TIMEOUT_MS = 1500;

let inflight = null;

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

/* 当前 Space 签名；读取失败 / 结构异常返回 null。并发调用共用同一次读取。 */
function currentSpaces() {
  if (inflight) return inflight;
  inflight = readSpacesJson()
    .then((parsed) => signatureOf(parsed))
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

module.exports = { currentSpaces, signatureOf };
