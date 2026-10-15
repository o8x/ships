'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SSH_CREDENTIALS_FILE, SSH_CREDENTIALS_KEY_FILE } = require('../utils/paths');
const { readJson, writeJson } = require('../utils/json-store');
const logger = require('../utils/logger');

/* SSH 密码：**加密保存在本地**（不落明文、不用脚本 / 钥匙串）。
   - 密钥：SSH_CREDENTIALS_KEY_FILE（随机 32 字节，chmod 600，首次使用时生成）。
   - 数据：SSH_CREDENTIALS_FILE，结构 `{ entries: { [alias]: { iv, tag, data } } }`，
     全部 base64；AES-256-GCM。
   导出的备份文件里密码为明文（由用户自行保管）。 */

const ALGO = 'aes-256-gcm';

function supported() {
  return true;
}

let key = null;
function loadKey() {
  if (key) return key;
  try {
    const buf = Buffer.from(fs.readFileSync(SSH_CREDENTIALS_KEY_FILE, 'utf8').trim(), 'base64');
    if (buf.length === 32) {
      key = buf;
      return key;
    }
  } catch (err) {
    /* 文件不存在或不可读：生成新密钥 */
  }
  key = crypto.randomBytes(32);
  try {
    fs.mkdirSync(path.dirname(SSH_CREDENTIALS_KEY_FILE), { recursive: true, mode: 0o700 });
    fs.writeFileSync(SSH_CREDENTIALS_KEY_FILE, key.toString('base64'), { mode: 0o600 });
    fs.chmodSync(SSH_CREDENTIALS_KEY_FILE, 0o600);
  } catch (err) {
    logger.warn('[ssh-credentials] write key failed:', (err && err.message) || err);
  }
  return key;
}

let state = readJson(SSH_CREDENTIALS_FILE, null);
if (!state || typeof state !== 'object' || typeof state.entries !== 'object' || state.entries === null) {
  state = { entries: {} };
}

function persist() {
  writeJson(SSH_CREDENTIALS_FILE, { entries: state.entries });
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, loadKey(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}

function decrypt(entry) {
  if (!entry || !entry.iv || !entry.data) return '';
  try {
    const decipher = crypto.createDecipheriv(ALGO, loadKey(), Buffer.from(entry.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(entry.tag || '', 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(entry.data, 'base64')), decipher.final()]).toString('utf8');
  } catch (err) {
    logger.warn('[ssh-credentials] decrypt failed:', (err && err.message) || err);
    return '';
  }
}

function aliases() {
  return Object.keys(state.entries);
}

function has(alias) {
  const account = String(alias || '');
  return account !== '' && Object.prototype.hasOwnProperty.call(state.entries, account);
}

function save(alias, password) {
  const account = String(alias || '').trim();
  const secret = String(password == null ? '' : password);
  if (!account || !secret) return { ok: false, error: 'invalid' };
  state.entries[account] = encrypt(secret);
  persist();
  return { ok: true };
}

function get(alias) {
  const account = String(alias || '');
  const entry = state.entries[account];
  return entry ? decrypt(entry) : '';
}

function remove(alias) {
  const account = String(alias || '').trim();
  if (account && Object.prototype.hasOwnProperty.call(state.entries, account)) {
    delete state.entries[account];
    persist();
  }
  return { ok: true };
}

/* 备份导出用：明文密码表（仅内存，写进导出文件）。 */
function allPlaintext() {
  const out = {};
  for (const alias of Object.keys(state.entries)) {
    const value = decrypt(state.entries[alias]);
    if (value) out[alias] = value;
  }
  return out;
}

module.exports = { supported, has, get, aliases, save, remove, allPlaintext };
