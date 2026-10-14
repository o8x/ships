'use strict';

const { CD_HISTORY_FILE } = require('../utils/paths');
const { readJson, writeJson } = require('../utils/json-store');
const { CD_HISTORY_MAX } = require('../../shared/constants');

// File-manager「cd 历史」：按 ssh 目标（用户名@主机）记录最近 cd 到的远端目录，
// 去重、越新越靠前、最多 CD_HISTORY_MAX 条，永久保存在本地 JSON 文件里。
// 仅记录通过 cd 到达的目录（终端 cd 跟随 / 「cd 到此目录」按钮），不记录手动浏览。

function list(key) {
  if (!key) return [];
  const data = readJson(CD_HISTORY_FILE, {});
  const entries = data && Array.isArray(data[key]) ? data[key] : [];
  return entries.filter((item) => typeof item === 'string');
}

function add(key, dirPath) {
  const path = String(dirPath || '');
  if (!key || !path) return list(key);
  const data = readJson(CD_HISTORY_FILE, {});
  const store = data && typeof data === 'object' ? data : {};
  const entries = Array.isArray(store[key]) ? store[key].filter((item) => item !== path) : [];
  entries.unshift(path);
  const next = entries.slice(0, CD_HISTORY_MAX);
  store[key] = next;
  writeJson(CD_HISTORY_FILE, store);
  return next;
}

module.exports = { list, add, CD_HISTORY_FILE };
