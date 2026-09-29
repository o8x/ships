'use strict';

// Remote directory browser for the SSH tool: reuses one ssh2 connection per host
// (closed after an idle period), lists directories and opens iTerm inside them.

const path = require('path');
const { Client } = require('ssh2');
const sshService = require('./ssh-service');
const { buildListCommand, parseListing, dirsFirst } = require('../utils/ls-listing');
const { SSH_BROWSE_FILE } = require('../utils/paths');
const { readJson, writeJson } = require('../utils/json-store');
const { decodeUtf8WithEscapes } = require('../utils/utf8');
const logger = require('../utils/logger');

const IDLE_CLOSE_MS = 2 * 60 * 1000;
const EXEC_TIMEOUT_MS = 20000;

// alias -> { client, timer, closed }
const sessions = new Map();
// alias -> last directory the user opened (used to seed the next session)
const lastDirs = readJson(SSH_BROWSE_FILE, {});

function getLastDir(alias) {
  return (alias && lastDirs[alias]) || '';
}

function rememberDir(alias, dir) {
  if (!alias || !dir) return;
  lastDirs[alias] = dir;
  writeJson(SSH_BROWSE_FILE, lastDirs);
}

function parentOf(dir) {
  const value = String(dir || '');
  if (!value || value === '/') return '/';
  const parent = path.posix.dirname(value);
  return parent === '.' ? '/' : parent;
}

function closeSession(alias) {
  const entry = sessions.get(alias);
  if (!entry) return;
  sessions.delete(alias);
  clearTimeout(entry.timer);
  entry.closed = true;
  try {
    entry.client.end();
  } catch (err) {
    /* ignore */
  }
}

function armIdle(alias, entry) {
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => closeSession(alias), IDLE_CLOSE_MS);
}

function openSession(host) {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const entry = { client, timer: null, closed: false };
    const options = sshService.connectionOptions(host, {
      keepaliveInterval: 15000,
      keepaliveCountMax: 3,
    });
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      entry.closed = true;
      clearTimeout(entry.timer);
      try {
        client.end();
      } catch (err2) {
        /* ignore */
      }
      reject(err);
    };

    client.on('ready', () => {
      if (settled) return;
      settled = true;
      sessions.set(host.alias, entry);
      armIdle(host.alias, entry);
      logger.file(`[ssh] browse session ready (${host.alias} ${options.host}:${options.port})`);
      resolve(entry);
    });

    // A dropped session must never be reused: drop it from the cache either way.
    const onGone = (err) => {
      if (sessions.get(host.alias) === entry) sessions.delete(host.alias);
      fail(err);
    };
    client.on('error', (err) => {
      logger.error(`[ssh] browse connection error (${host.alias}): ${err.message}`);
      onGone(err);
    });
    client.on('close', () => onGone(new Error('connection closed')));

    logger.file(
      `[ssh] browse connecting ${host.alias} -> ${options.host}:${options.port} ` +
        `user=${options.username || '-'} agent=${options.agent || '-'}`
    );
    try {
      client.connect(options);
    } catch (err) {
      fail(err);
    }
  });
}

async function getSession(host) {
  const cached = sessions.get(host.alias);
  if (cached && !cached.closed) {
    armIdle(host.alias, cached);
    return cached;
  }
  return openSession(host);
}

function runExec(client, command) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), EXEC_TIMEOUT_MS);
    const done = (fn, value) => {
      clearTimeout(timer);
      fn(value);
    };
    client.exec(command, (err, stream) => {
      if (err) return done(reject, err);
      const outChunks = [];
      const errChunks = [];
      stream.on('data', (data) => {
        outChunks.push(data);
      });
      stream.stderr.on('data', (data) => {
        errChunks.push(data);
      });
      stream.on('close', (code) =>
        done(resolve, {
          code,
          out: decodeUtf8WithEscapes(Buffer.concat(outChunks)),
          errOut: decodeUtf8WithEscapes(Buffer.concat(errChunks)),
        })
      );
      stream.on('error', (streamErr) => done(reject, streamErr));
    });
  });
}

// Runs one command, retrying once on a fresh connection (stale sessions are common
// after sleep / network changes).
async function execCommand(host, command) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let entry = null;
    try {
      entry = await getSession(host);
      const result = await runExec(entry.client, command);
      armIdle(host.alias, entry);
      return result;
    } catch (err) {
      lastError = err;
      closeSession(host.alias);
      logger.error(`[ssh] browse exec failed (${host.alias}, attempt ${attempt + 1}): ${err.message}`);
    }
  }
  throw lastError || new Error('exec failed');
}

/* `dir` omitted seeds the view from the last opened directory's parent (or home). */
async function listDir(host, dir) {
  const remembered = getLastDir(host.alias);
  const start = dir || (remembered ? parentOf(remembered) : '');
  const target = start || '~';
  logger.file(`[ssh] list-dir(${host.alias}) dir=${target}`);
  let result;
  try {
    result = await execCommand(host, buildListCommand(sshService.shellQuote, start));
  } catch (err) {
    logger.error(`[ssh] list-dir(${host.alias} ${target}) failed: ${err.message}`);
    return { ok: false, code: err.message === 'timeout' ? 'timeout' : 'connect', error: err.message };
  }
  if (result.code !== 0) {
    const code = result.code === 3 ? 'noDir' : result.code === 4 ? 'noPath' : 'listFailed';
    const error = (result.errOut || '').trim() || `exit ${result.code}`;
    logger.error(`[ssh] list-dir(${host.alias} ${target}) -> ${error}`);
    return { ok: false, code, error };
  }
  // Raw listing is only written when running with SHIPS_DEBUG=1 / --debug.
  logger.debug(`[ssh] list-dir raw (${host.alias} ${target}):\n${result.out}`);
  const parsed = parseListing(result.out);
  if (!parsed.path) {
    logger.error(`[ssh] list-dir(${host.alias} ${target}) -> empty path`);
    return { ok: false, code: 'noPath', error: 'empty path' };
  }
  logger.file(
    `[ssh] list-dir(${host.alias} ${parsed.path}) -> ${parsed.entries.length} entries` +
      (parsed.truncated ? ' (truncated)' : '')
  );
  return {
    ok: true,
    path: parsed.path,
    parent: parentOf(parsed.path),
    // Folders first, then files — inside each group the remote `ls` order is kept.
    entries: dirsFirst(parsed.entries),
    truncated: parsed.truncated,
    lastDir: getLastDir(host.alias),
  };
}

/* Opens iTerm on the host inside dir (and remembers dir as the last one opened). */
async function openAt(host, dir) {
  if (dir) rememberDir(host.alias, dir);
  return sshService.openAt(host, dir);
}

function closeAll() {
  for (const alias of Array.from(sessions.keys())) closeSession(alias);
}

module.exports = { listDir, openAt, rememberDir, getLastDir, parentOf, closeAll };
