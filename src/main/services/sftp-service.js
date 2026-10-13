'use strict';

// SFTP sessions for the file manager (embedded in the terminal window, and in the
// detached file window). Each session has an id so several connections can live at
// once (one per window). The target is a raw ssh destination token (`user@host`,
// `alias` or `user@alias`): a matching ~/.ssh/config entry wins (host / port / user /
// IdentityFile, per the ssh-manager records), otherwise we fall back to the user in
// the command and the default private key ~/.ssh/id_ed25519. ProxyJump is not
// supported by ssh2 and is reported as such.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Client } = require('ssh2');
const sshConfig = require('./ssh-config-service');
const sshService = require('./ssh-service');
const settings = require('./settings-service');
const logger = require('../utils/logger');

const READY_TIMEOUT_MS = 12000;
const KEEPALIVE_MS = 15000;
const DEFAULT_DOWNLOAD_DIR = '~/Downloads';
const DEFAULT_IDENTITY = '~/.ssh/id_ed25519';

// id -> { id, client, sftp, target, resolved, home, closed }
const sessions = new Map();
let counter = 0;

function expandHome(filePath) {
  const value = String(filePath || '');
  if (!value) return value;
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
}

function localUsername() {
  try {
    return os.userInfo().username || '';
  } catch (err) {
    return process.env.USER || '';
  }
}

function stripBrackets(host) {
  const value = String(host || '');
  if (value.startsWith('[') && value.endsWith(']')) return value.slice(1, -1);
  return value;
}

/* Raw terminal destination token -> connection fields. */
function resolveTarget(target) {
  const token = String(target || '').trim();
  if (!token) return { error: 'no-target' };
  const at = token.lastIndexOf('@');
  const typedUser = at >= 0 ? token.slice(0, at) : '';
  const hostPart = stripBrackets(at >= 0 ? token.slice(at + 1) : token);
  if (!hostPart) return { error: 'no-target' };

  let entry = null;
  try {
    entry = sshConfig.list().find((host) => host.alias === hostPart || host.hostName === hostPart) || null;
  } catch (err) {
    entry = null;
  }

  if (entry) {
    if (entry.proxyJump) return { error: 'proxyjump', target: token };
    return {
      target: token,
      host: entry.hostName,
      port: Number(entry.port) || 22,
      username: typedUser || entry.user || localUsername(),
      identityFile: entry.identityFile || DEFAULT_IDENTITY,
      alias: entry.alias,
    };
  }

  return {
    target: token,
    host: hostPart,
    port: 22,
    username: typedUser || localUsername(),
    identityFile: DEFAULT_IDENTITY,
    alias: '',
  };
}

function connectionOptions(resolved) {
  const options = {
    host: resolved.host,
    port: resolved.port,
    username: resolved.username || undefined,
    readyTimeout: READY_TIMEOUT_MS,
    keepaliveInterval: KEEPALIVE_MS,
    keepaliveCountMax: 3,
  };
  const agent = sshService.getAgentSocket();
  if (agent) options.agent = agent;
  const keyPath = expandHome(resolved.identityFile);
  if (keyPath) {
    try {
      if (fs.existsSync(keyPath)) options.privateKey = fs.readFileSync(keyPath);
    } catch (err) {
      logger.error(`[sftp] read identity file failed (${keyPath}): ${err.message}`);
    }
  }
  return options;
}

function connect(target, ownerId) {
  const resolved = resolveTarget(target);
  if (resolved.error) return Promise.resolve({ ok: false, error: resolved.error, code: resolved.error });

  return new Promise((resolve) => {
    const client = new Client();
    const options = connectionOptions(resolved);
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const cleanup = () => {
      try {
        client.end();
      } catch (err) {
        /* ignore */
      }
    };

    logger.file(
      `[sftp] connecting ${resolved.target} -> ${options.host}:${options.port} ` +
        `user=${options.username || '-'} key=${options.privateKey ? 'yes' : 'no'} agent=${options.agent ? 'yes' : 'no'}`
    );

    client.on('ready', () => {
      client.sftp((err, sftp) => {
        if (err) {
          cleanup();
          logger.error(`[sftp] subsystem failed (${resolved.target}): ${err.message}`);
          finish({ ok: false, error: err.message, code: 'sftp' });
          return;
        }
        sftp.realpath('.', (rpErr, home) => {
          const homeDir = !rpErr && home ? home : '.';
          const id = `f${Date.now().toString(36)}-${(counter += 1)}`;
          const entry = { id, client, sftp, target: resolved.target, resolved, home: homeDir, closed: false, ownerId: ownerId || null };
          sessions.set(id, entry);
          client.on('close', () => {
            entry.closed = true;
            if (sessions.get(id) === entry) sessions.delete(id);
          });
          logger.file(`[sftp] ready ${id} (${resolved.target}) home=${homeDir}`);
          finish({ ok: true, id, home: homeDir, target: resolved.target });
        });
      });
    });

    client.on('error', (err) => {
      cleanup();
      const message = String((err && err.message) || 'error');
      const code = /authentication/i.test(message) ? 'auth' : /timed out|timeout/i.test(message) ? 'timeout' : 'connect';
      logger.error(`[sftp] connection error (${resolved.target}): ${message}`);
      finish({ ok: false, error: message, code });
    });

    try {
      client.connect(options);
    } catch (err) {
      cleanup();
      finish({ ok: false, error: err.message, code: 'connect' });
    }
  });
}

function get(id) {
  const entry = sessions.get(id);
  if (!entry || entry.closed) return null;
  return entry;
}

function close(id) {
  const entry = sessions.get(id);
  if (!entry) return { ok: true };
  entry.closed = true;
  sessions.delete(id);
  try {
    entry.client.end();
  } catch (err) {
    /* ignore */
  }
  logger.file(`[sftp] session closed (${id})`);
  return { ok: true };
}

function closeAll() {
  for (const id of Array.from(sessions.keys())) close(id);
}

/* Close every session owned by a window (called when that window is destroyed). */
function closeForOwner(ownerId) {
  if (ownerId == null) return;
  for (const entry of Array.from(sessions.values())) {
    if (entry.ownerId === ownerId) close(entry.id);
  }
}

/* Normalise a user-supplied path to an absolute one (expanding a leading `~`). */
function normalizeRemote(home, input) {
  const value = String(input == null ? '' : input).trim();
  if (!value) return home || '/';
  if (value === '~') return home || '/';
  if (value.startsWith('~/')) return `${home || ''}${value.slice(1)}`;
  if (value.startsWith('/')) return value;
  return `${home || ''}/${value}`;
}

function entryType(attrs) {
  if (!attrs) return 'file';
  if (typeof attrs.isDirectory === 'function' && attrs.isDirectory()) return 'dir';
  if (typeof attrs.isSymbolicLink === 'function' && attrs.isSymbolicLink()) return 'link';
  return 'file';
}

function listDir(id, dir) {
  const entry = get(id);
  if (!entry) return Promise.resolve({ ok: false, error: 'not-connected', code: 'not-connected' });
  const requested = normalizeRemote(entry.home, dir);
  const sftp = entry.sftp;
  return new Promise((resolve) => {
    sftp.realpath(requested, (rpErr, real) => {
      const base = !rpErr && real ? real : requested;
      sftp.readdir(base, (err, items) => {
        if (err) {
          const code = err.code === 2 ? 'noDir' : 'listFailed';
          resolve({ ok: false, code, error: err.message });
          return;
        }
        const entries = items.map((item) => {
          const attrs = item.attrs || {};
          return {
            name: item.filename,
            type: entryType(attrs),
            size: Number(attrs.size) || 0,
            mtime: (Number(attrs.mtime) || 0) * 1000,
            mode: Number(attrs.mode) || 0,
          };
        });
        entries.sort((a, b) => {
          const aDir = a.type === 'dir' ? 0 : 1;
          const bDir = b.type === 'dir' ? 0 : 1;
          if (aDir !== bDir) return aDir - bDir;
          return a.name.localeCompare(b.name);
        });
        const parent = base === '/' ? '/' : path.posix.dirname(base);
        resolve({ ok: true, path: base, parent, home: entry.home, entries });
      });
    });
  });
}

function uniqueLocalPath(baseDir, name) {
  let candidate = path.join(baseDir, name);
  if (!fs.existsSync(candidate)) return candidate;
  const ext = path.extname(name);
  const stem = ext ? name.slice(0, -ext.length) : name;
  for (let i = 1; i < 1000; i += 1) {
    candidate = path.join(baseDir, `${stem} (${i})${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  return path.join(baseDir, `${stem}-${Date.now()}${ext}`);
}

function downloadDir() {
  const configured = settings.get('sftpDownloadDir') || DEFAULT_DOWNLOAD_DIR;
  const dir = expandHome(configured);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    logger.error(`[sftp] cannot create download dir (${dir}): ${err.message}`);
  }
  return dir;
}

function download(id, remotePath, onProgress) {
  const entry = get(id);
  if (!entry) return Promise.resolve({ ok: false, error: 'not-connected' });
  const target = String(remotePath || '');
  if (!target) return Promise.resolve({ ok: false, error: 'no-path' });
  const name = path.posix.basename(target);
  const localPath = uniqueLocalPath(downloadDir(), name);
  const options = {};
  if (typeof onProgress === 'function') {
    options.step = (transferred, _chunk, total) => onProgress({ direction: 'download', name, transferred, total });
  }
  return new Promise((resolve) => {
    entry.sftp.fastGet(target, localPath, options, (err) => {
      if (err) {
        logger.error(`[sftp] download failed (${target}): ${err.message}`);
        resolve({ ok: false, error: err.message });
        return;
      }
      logger.file(`[sftp] downloaded ${target} -> ${localPath}`);
      resolve({ ok: true, path: localPath, name });
    });
  });
}

function isDefaultIdentity(file) {
  const value = String(file || '').trim();
  if (!value) return false;
  return expandHome(value) === expandHome(DEFAULT_IDENTITY);
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_@%+=:,./~-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

/* Build an scp command to transfer a remote file/dir to the local download dir
   (folder → add -r). Uses the session's resolved connection (port / user / key). */
function transferCommand(id, remotePath, recursive) {
  const entry = get(id);
  if (!entry) return { ok: false, error: 'not-connected' };
  const path = String(remotePath || '');
  if (!path) return { ok: false, error: 'no-path' };
  const resolved = entry.resolved;
  const parts = ['scp'];
  if (resolved.port && Number(resolved.port) !== 22) parts.push('-P', String(resolved.port));
  if (resolved.identityFile && !isDefaultIdentity(resolved.identityFile)) {
    parts.push('-i', shellQuote(expandHome(resolved.identityFile)));
  }
  if (recursive) parts.push('-r');
  const host = resolved.username ? `${resolved.username}@${resolved.host}` : resolved.host;
  parts.push(`${host}:${shellQuote(path)}`);
  const target = expandHome(settings.get('sftpDownloadDir') || DEFAULT_DOWNLOAD_DIR);
  parts.push(shellQuote(target));
  return { ok: true, command: parts.join(' ') };
}

function upload(id, localPath, remoteDir, onProgress) {
  const entry = get(id);
  if (!entry) return Promise.resolve({ ok: false, error: 'not-connected' });
  const from = String(localPath || '');
  if (!from) return Promise.resolve({ ok: false, error: 'no-file' });
  const name = path.basename(from);
  const dir = normalizeRemote(entry.home, remoteDir);
  const to = dir === '/' ? `/${name}` : `${dir}/${name}`;
  const options = {};
  if (typeof onProgress === 'function') {
    options.step = (transferred, _chunk, total) => onProgress({ direction: 'upload', name, transferred, total });
  }
  return new Promise((resolve) => {
    entry.sftp.fastPut(from, to, options, (err) => {
      if (err) {
        logger.error(`[sftp] upload failed (${from} -> ${to}): ${err.message}`);
        resolve({ ok: false, error: err.message });
        return;
      }
      logger.file(`[sftp] uploaded ${from} -> ${to}`);
      resolve({ ok: true, name, path: to });
    });
  });
}

module.exports = {
  connect,
  listDir,
  download,
  upload,
  transferCommand,
  close,
  closeAll,
  closeForOwner,
  _resolveTarget: resolveTarget,
  _normalizeRemote: normalizeRemote,
};
