'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { TOTP_ACCOUNTS_FILE, TOTP_ACCOUNTS_KEY_FILE } = require('../utils/paths');
const { readJson, writeJson } = require('../utils/json-store');
const logger = require('../utils/logger');

/* 2FA（TOTP）账号：**密钥加密保存在本地**（不落明文）。
   - 密钥：TOTP_ACCOUNTS_KEY_FILE（随机 32 字节，chmod 600，首次使用生成）。
   - 数据：TOTP_ACCOUNTS_FILE，结构 `{ accounts: [{ id, title, subtitle,
     period, digits, algorithm, secret: { iv, tag, data } }] }`，密文全 base64；AES-256-GCM。
   标题 / 副标题为非机密，明文保存；密钥明文只在内存与「列账号 / 添加」返回值里出现。 */

const ALGO = 'aes-256-gcm';
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DIGITS_DEFAULT = 6;
const PERIOD_DEFAULT = 30;
const ALGORITHM_DEFAULT = 'SHA1';
const ALGORITHMS = ['SHA1', 'SHA256', 'SHA512'];
const HMAC_HASHES = { SHA1: 'sha1', SHA256: 'sha256', SHA512: 'sha512' };

let key = null;
function loadKey() {
  if (key) return key;
  try {
    const buf = Buffer.from(fs.readFileSync(TOTP_ACCOUNTS_KEY_FILE, 'utf8').trim(), 'base64');
    if (buf.length === 32) {
      key = buf;
      return key;
    }
  } catch (err) {
    /* 文件不存在或不可读：生成新密钥 */
  }
  key = crypto.randomBytes(32);
  try {
    fs.mkdirSync(path.dirname(TOTP_ACCOUNTS_KEY_FILE), { recursive: true, mode: 0o700 });
    fs.writeFileSync(TOTP_ACCOUNTS_KEY_FILE, key.toString('base64'), { mode: 0o600 });
    fs.chmodSync(TOTP_ACCOUNTS_KEY_FILE, 0o600);
  } catch (err) {
    logger.warn('[totp] write key failed:', (err && err.message) || err);
  }
  return key;
}

let state = readJson(TOTP_ACCOUNTS_FILE, null);
if (!state || typeof state !== 'object' || !Array.isArray(state.accounts)) {
  state = { accounts: [] };
}

function persist() {
  writeJson(TOTP_ACCOUNTS_FILE, { accounts: state.accounts });
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
    logger.warn('[totp] decrypt failed:', (err && err.message) || err);
    return '';
  }
}

/* ------- 解析 / 校验 ------- */

function sanitizeText(value) {
  return String(value == null ? '' : value).replace(/[\r\n\t]+/g, ' ').trim();
}

/* base32 密钥规范化：去掉空白 / 连字符 / 结尾的 `=`，转大写；非法返回 null。 */
function normalizeSecret(raw) {
  const s = String(raw == null ? '' : raw)
    .replace(/[\s-]+/g, '')
    .replace(/=+$/, '')
    .toUpperCase();
  if (!s || s.length < 8) return null;
  for (const char of s) {
    if (BASE32_ALPHABET.indexOf(char) === -1) return null;
  }
  return s;
}

function normalizeAlgorithm(raw) {
  const value = String(raw == null ? '' : raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (value === 'SHA256') return 'SHA256';
  if (value === 'SHA512') return 'SHA512';
  return ALGORITHM_DEFAULT;
}

function normalizeDigits(raw) {
  const value = parseInt(raw, 10);
  if (value === 6 || value === 8) return value;
  return DIGITS_DEFAULT;
}

function normalizePeriod(raw) {
  const value = parseInt(raw, 10);
  if (Number.isFinite(value) && value >= 1 && value <= 600) return value;
  return PERIOD_DEFAULT;
}

function parseOtpAuth(text) {
  let url;
  try {
    url = new URL(text);
  } catch (err) {
    return { ok: false, error: 'invalid-url' };
  }
  if (String(url.protocol).toLowerCase() !== 'otpauth:') return { ok: false, error: 'invalid-url' };
  if (String(url.host).toLowerCase() !== 'totp') return { ok: false, error: 'unsupported-type' };

  const secret = normalizeSecret(url.searchParams.get('secret'));
  if (!secret) return { ok: false, error: 'invalid-secret' };

  let label = url.pathname.replace(/^\/+/, '');
  try {
    label = decodeURIComponent(label);
  } catch (err) {
    /* 保留原 label */
  }
  label = sanitizeText(label);

  const issuerParam = sanitizeText(url.searchParams.get('issuer'));
  let issuer = issuerParam;
  let account = label;
  const sep = label.indexOf(':');
  if (sep >= 0) {
    const labelIssuer = sanitizeText(label.slice(0, sep));
    account = sanitizeText(label.slice(sep + 1));
    if (!issuer) issuer = labelIssuer;
  }

  return {
    ok: true,
    account: {
      title: issuer,
      subtitle: account,
      secret,
      period: normalizePeriod(url.searchParams.get('period')),
      digits: normalizeDigits(url.searchParams.get('digits')),
      algorithm: normalizeAlgorithm(url.searchParams.get('algorithm')),
    },
  };
}

/* 接受 `otpauth://` 链接或裸 base32 密钥；返回规范化账号（密钥仍为 base32）。 */
function parseInput(input) {
  const text = String(input == null ? '' : input).trim();
  if (!text) return { ok: false, error: 'empty' };
  if (/^otpauth:/i.test(text)) return parseOtpAuth(text);
  const secret = normalizeSecret(text);
  if (!secret) return { ok: false, error: 'invalid-secret' };
  return {
    ok: true,
    account: {
      title: '',
      subtitle: '',
      secret,
      period: PERIOD_DEFAULT,
      digits: DIGITS_DEFAULT,
      algorithm: ALGORITHM_DEFAULT,
    },
  };
}

/* ------- 对外能力 ------- */

function toPublic(entry) {
  return {
    id: entry.id,
    title: entry.title,
    subtitle: entry.subtitle,
    period: entry.period,
    digits: entry.digits,
    algorithm: entry.algorithm,
  };
}

function list() {
  return state.accounts.map(toPublic);
}

/* base32 → Buffer（TOTP 密钥）。 */
function base32Decode(secret) {
  const clean = String(secret || '')
    .replace(/=+$/, '')
    .toUpperCase()
    .replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const output = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error('invalid base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function counterBuffer(counter) {
  const buf = Buffer.alloc(8);
  let value = counter;
  for (let i = 7; i >= 0; i -= 1) {
    buf[i] = value % 256;
    value = Math.floor(value / 256);
  }
  return buf;
}

/* 计算某账号在当前时间片（counter）的 TOTP 验证码。 */
function generateCode(secret, digits, algorithm, counter) {
  const key = base32Decode(secret);
  const digest = crypto
    .createHmac(HMAC_HASHES[algorithm] || 'sha1', key)
    .update(counterBuffer(counter))
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/* 全部账号的当前验证码（`{ [id]: code }`）；密钥只在主进程内解密、不外传。 */
function codes() {
  const now = Math.floor(Date.now() / 1000);
  const out = {};
  for (const entry of state.accounts) {
    const secret = decrypt(entry.secret);
    if (!secret) continue;
    const period = entry.period || PERIOD_DEFAULT;
    try {
      out[entry.id] = generateCode(secret, entry.digits, entry.algorithm, Math.floor(now / period));
    } catch (err) {
      /* 跳过无法计算的账号 */
    }
  }
  return out;
}

function add(input) {
  const parsed = parseInput(input);
  if (!parsed.ok) return parsed;
  const account = parsed.account;
  if (state.accounts.some((entry) => decrypt(entry.secret) === account.secret)) {
    return { ok: false, error: 'duplicate' };
  }
  const entry = {
    id: crypto.randomUUID(),
    title: account.title,
    subtitle: account.subtitle,
    period: account.period,
    digits: account.digits,
    algorithm: account.algorithm,
    secret: encrypt(account.secret),
  };
  state.accounts.push(entry);
  persist();
  return { ok: true, account: toPublic(entry) };
}

function remove(id) {
  const target = String(id || '');
  const before = state.accounts.length;
  state.accounts = state.accounts.filter((entry) => entry.id !== target);
  if (state.accounts.length !== before) persist();
  return { ok: true };
}

module.exports = {
  list,
  add,
  remove,
  codes,
  parseInput,
  DIGITS_DEFAULT,
  PERIOD_DEFAULT,
  ALGORITHM_DEFAULT,
  ALGORITHMS,
};
