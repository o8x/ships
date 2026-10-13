'use strict';

const fs = require('fs');
const path = require('path');
const { LOG_DIR, todayLogFile } = require('./paths');
const { LOG_RETENTION_DAYS } = require('../../shared/constants');

const DEBUG =
  process.env.SHIPS_DEBUG === '1' || process.argv.includes('--debug');

function stringify(value) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (err) {
    return String(value);
  }
}

/* 惰性清理：每天首次写日志时删掉保留期（默认 7 天）之前的日志文件。
   文件名形如 ships-YYYY-MM-DD.log，按文件名里的日期判断。 */
let lastPruneDay = '';
function pruneOldLogs() {
  const now = new Date();
  const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  if (day === lastPruneDay) return;
  lastPruneDay = day;
  const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
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

module.exports = { DEBUG, debug, info, warn, error, file, LOG_DIR, todayLogFile };
