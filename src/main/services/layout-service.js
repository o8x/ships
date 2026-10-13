'use strict';

// Persisted layout for the file manager. Two independent scopes so the embedded
// panel and the detached window keep separate records:
//   'panel'  -> file-layout.json        (terminal window's embedded panel)
//   'window' -> file-window-layout.json (detached file window)
// Stored as flat JSON objects (tree width, column widths, panel height).

const { FILE_LAYOUT_FILE, FILE_WINDOW_LAYOUT_FILE } = require('../utils/paths');
const { readJson, writeJson } = require('../utils/json-store');

const FILES = {
  panel: FILE_LAYOUT_FILE,
  window: FILE_WINDOW_LAYOUT_FILE,
};

const cache = new Map(); // scope -> data

function fileFor(scope) {
  return FILES[scope] || FILES.panel;
}

function get(scope) {
  const key = FILES[scope] ? scope : 'panel';
  if (!cache.has(key)) cache.set(key, readJson(fileFor(key), {}));
  return Object.assign({}, cache.get(key));
}

function set(scope, patch) {
  const key = FILES[scope] ? scope : 'panel';
  if (!patch || typeof patch !== 'object') return get(key);
  const current = get(key);
  const next = Object.assign({}, current, patch);
  if (JSON.stringify(next) === JSON.stringify(current)) return current;
  cache.set(key, next);
  writeJson(fileFor(key), next);
  return Object.assign({}, next);
}

module.exports = { get, set };
