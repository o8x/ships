'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { LOG_DIR, todayLogFile } = require('./paths');
const { LOG_RETENTION_DAYS } = require('../../shared/constants');

const DEBUG =
  process.env.SHIPS_DEBUG === '1' || process.argv.includes('--debug');

// 日志保留天数（可由设置覆盖，默认来自 package.json 的 ships.logRetentionDays）。
let retentionDays = LOG_RETENTION_DAYS;

// 是否把日志同时写入系统统一日志（macOS「控制台」App）。经常驻的 `logger` 子进程写入，
// 避免每行 fork 一次。仅在 macOS 且开启时生效。
let consoleAppEnabled = false;
let consoleAppProc = null;

function ensureConsoleAppProc() {
  if (process.platform !== 'darwin' || !consoleAppEnabled || consoleAppProc) return;
  try {
    consoleAppProc = spawn('/usr/bin/logger', ['-t', 'Ships'], { stdio: ['pipe', 'ignore', 'ignore'] });
    if (consoleAppProc.stdin) {
      consoleAppProc.stdin.on('error', () => {
        /* ignore EPIPE */
      });
    }
    consoleAppProc.on('error', () => {
      consoleAppProc = null;
    });
    consoleAppProc.on('exit', () => {
      consoleAppProc = null;
    });
  } catch (err) {
    consoleAppProc = null;
  }
}

function writeConsoleApp(line) {
  if (!consoleAppEnabled || process.platform !== 'darwin') return;
  ensureConsoleAppProc();
  if (!consoleAppProc || !consoleAppProc.stdin || !consoleAppProc.stdin.writable) return;
  try {
    consoleAppProc.stdin.write(line.endsWith('\n') ? line : `${line}\n`);
  } catch (err) {
    /* ignore */
  }
}

function stringify(value) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (err) {
    return String(value);
  }
}

/* 惰性清理：每天首次写日志时删掉保留期之前的日志文件。
   文件名形如 ships-YYYY-MM-DD.log，按文件名里的日期判断。 */
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
    const match = /^ships-(\d{4})-(\d{2})-(\d{2})\.log$/.exec(name);
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

// Always appended to today's log file (used for user-requested flows like SSH detection).
function file(...args) {
  const line = `${new Date().toISOString()} ${args.map(stringify).join(' ')}\n`;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    pruneOldLogs();
    fs.appendFileSync(todayLogFile(), line, 'utf8');
  } catch (err) {
    /* ignore log write failures */
  }
  writeConsoleApp(line.trimEnd());
  if (DEBUG) console.log(line.trimEnd());
}

function debug(...args) {
  if (DEBUG) {
    console.log('[ships][debug]', ...args);
    file('[debug]', ...args);
  }
}

function info(...args) {
  console.log('[ships]', ...args);
  file('[info]', ...args);
}

function warn(...args) {
  console.warn('[ships][warn]', ...args);
  file('[warn]', ...args);
}

function error(...args) {
  console.error('[ships][error]', ...args);
  file('[error]', ...args);
}

/* 设置日志保留天数（来自设置 logRetentionDays）。 */
function setRetentionDays(days) {
  const value = Number(days);
  if (Number.isFinite(value) && value > 0) retentionDays = value;
}

/* 设置是否把日志同时写入系统统一日志（macOS「控制台」App）。 */
function setConsoleApp(enabled) {
  consoleAppEnabled = Boolean(enabled) && process.platform === 'darwin';
  if (consoleAppEnabled) {
    ensureConsoleAppProc();
  } else if (consoleAppProc) {
    try {
      consoleAppProc.stdin.end();
    } catch (err) {
      /* ignore */
    }
    consoleAppProc = null;
  }
}

module.exports = {
  DEBUG,
  debug,
  info,
  warn,
  error,
  file,
  setRetentionDays,
  setConsoleApp,
  LOG_DIR,
  todayLogFile,
};
