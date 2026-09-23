'use strict';

const fs = require('fs');
const path = require('path');
const { LOG_FILE } = require('./paths');

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

// Always appended to ships.log (used for user-requested flows like SSH detection).
function file(...args) {
  const line = `${new Date().toISOString()} ${args.map(stringify).join(' ')}\n`;
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line, 'utf8');
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

module.exports = { DEBUG, debug, info, warn, error, file, LOG_FILE };
