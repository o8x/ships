'use strict';

const DEBUG =
  process.env.SHIPS_DEBUG === '1' || process.argv.includes('--debug');

function debug(...args) {
  if (DEBUG) console.log('[ships][debug]', ...args);
}

function info(...args) {
  console.log('[ships]', ...args);
}

function warn(...args) {
  console.warn('[ships][warn]', ...args);
}

function error(...args) {
  console.error('[ships][error]', ...args);
}

module.exports = { DEBUG, debug, info, warn, error };
