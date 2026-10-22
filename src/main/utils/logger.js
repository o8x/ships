'use strict';

const fs = require('fs');
const path = require('path');
const { LOG_DIR, todayLogFile } = require('./paths');
const { LOG_RETENTION_DAYS } = require('../../shared/constants');

/* 运行模式由「是否打包」决定，无需设置变量：
   - pnpm start / pnpm dev / `electron .` 等未打包运行 = 开发（调试）模式；
   - pkg / .app 等安装后运行 = 生产模式。
   环境变量 / --debug 仅作为手动覆盖（兼容既有用法）。 */
let packaged = true;
try {
  const electron = require('electron');
  if (electron && electron.app && typeof electron.app.isPackaged === 'boolean') {
    packaged = electron.app.isPackaged;
  }
} catch (err) {
  /* 非 Electron 环境（离线脚本）按生产模式处理 */
}

const DEV_MODE = !packaged;
const ENV_DEBUG =
  process.env.VESSEL_DEBUG === '1' || process.env.SHIPS_DEBUG === '1' || process.argv.includes('--debug');
const debugEnabled = DEV_MODE || ENV_DEBUG;

function isDebug() {
  return debugEnabled;
}

// 日志保留天数（可由设置覆盖，默认来自 package.json 的 vessel.logRetentionDays）。
let retentionDays = LOG_RETENTION_DAYS;

function stringify(value) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (err) {
    return String(value);
  }
}

/* 惰性清理：每天首次写日志时删掉保留期之前的日志文件。
   文件名形如 vessel-YYYY-MM-DD.log，按文件名里的日期判断。 */
let lastPruneDay = '';
function pruneOldLogs() {
  const now = new Date();
  const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  if (day === lastPruneDay) return;
  lastPruneDay = day;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let entries = [];
  try {
    entries = fs.readdirSync(LOG_DIR);
  } catch (err) {
    return;
  }
  for (const name of entries) {
    const match = /^(?:ships|vessel)-(\d{4})-(\d{2})-(\d{2})\.log$/.exec(name);
    if (!match) continue;
    const stamp = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00`).getTime();
    if (Number.isFinite(stamp) && stamp < cutoff) {
      try {
        fs.rmSync(path.join(LOG_DIR, name), { force: true });
      } catch (err) {
        /* ignore */
      }
    }
  }
}

// Append one line to today's log file (never touches the console).
function appendLine(args) {
  const line = `${new Date().toISOString()} ${args.map(stringify).join(' ')}\n`;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    pruneOldLogs();
    fs.appendFileSync(todayLogFile(), line, 'utf8');
  } catch (err) {
    /* ignore log write failures */
  }
  return line;
}

// Always appended to today's log file (used for user-requested flows like SSH detection).
// Debug mode mirrors the same line to the console exactly once.
function file(...args) {
  const line = appendLine(args);
  if (debugEnabled) console.log(line.trimEnd());
}

function debug(...args) {
  if (!debugEnabled) return;
  console.log('[vessel][debug]', ...args);
  appendLine(['[debug]', ...args]);
}

function info(...args) {
  console.log('[vessel]', ...args);
  appendLine(['[info]', ...args]);
}

function warn(...args) {
  console.warn('[vessel][warn]', ...args);
  appendLine(['[warn]', ...args]);
}

function error(...args) {
  console.error('[vessel][error]', ...args);
  appendLine(['[error]', ...args]);
}

/* 设置日志保留天数（来自设置 logRetentionDays）。 */
function setRetentionDays(days) {
  const value = Number(days);
  if (Number.isFinite(value) && value > 0) retentionDays = value;
}

module.exports = {
  debug,
  info,
  warn,
  error,
  file,
  isDebug,
  setRetentionDays,
  LOG_DIR,
  todayLogFile,
};

// 向后兼容：logger.DEBUG 仍可读取，但每次访问都返回当前开关状态。
Object.defineProperty(module.exports, 'DEBUG', { get: isDebug, enumerable: true });
