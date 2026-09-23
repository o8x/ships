'use strict';

const { TOOL_STATE_FILE } = require('../utils/paths');
const { readJson, writeJson } = require('../utils/json-store');

let data = readJson(TOOL_STATE_FILE, {});

function get(key) {
  return data[key];
}

function set(key, value) {
  if (typeof key !== 'string' || !key) return false;
  if (value == null) {
    delete data[key];
  } else {
    data[key] = value;
  }
  writeJson(TOOL_STATE_FILE, data);
  return true;
}

function clear(key) {
  if (typeof key !== 'string' || !key) return false;
  delete data[key];
  writeJson(TOOL_STATE_FILE, data);
  return true;
}

function getAll() {
  return Object.assign({}, data);
}

module.exports = { get, set, clear, getAll };
