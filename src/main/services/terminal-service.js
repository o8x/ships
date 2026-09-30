'use strict';

// Interactive terminal sessions: each one is a real PTY running the user's login
// shell, created by src/main/scripts/pty-bridge.py (Python stdlib, no node-pty native
// dependency). Used by the settings network test and by the always-on-top terminal
// window; every session has an id so several can live at once.

const fs = require('fs');
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const sshService = require('./ssh-service');
const logger = require('../utils/logger');

/* Packaged builds keep the app source inside app.asar, which is an archive — a
   script inside it cannot be executed. build.asarUnpack extracts this file into
   app.asar.unpacked, so rewrite the path when the app runs from an archive. */
function unpackedPath(file) {
  const marker = `${path.sep}app.asar${path.sep}`;
  return file.includes(marker) ? file.replace(marker, `${path.sep}app.asar.unpacked${path.sep}`) : file;
}

const BRIDGE = unpackedPath(path.join(__dirname, '..', 'scripts', 'pty-bridge.py'));
const PYTHON_CANDIDATES = ['/usr/bin/python3', '/opt/homebrew/bin/python3', '/usr/local/bin/python3'];
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

/* GUI apps inherit a minimal PATH, so probe the usual absolute locations before
   falling back to `python3` from PATH. */
function pythonBinary() {
  const override = String(process.env.SHIPS_PYTHON || '').trim();
  if (override) return override;
  for (const candidate of PYTHON_CANDIDATES) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch (err) {
      /* ignore */
    }
  }
  return 'python3';
}

const sessions = new Map();
let counter = 0;

function loginShell(preferred) {
  const wanted = String(preferred || '').trim();
  if (wanted) {
    try {
      if (fs.existsSync(wanted)) return wanted;
      logger.error(`[terminal] configured shell not found: ${wanted}`);
    } catch (err) {
      /* ignore */
    }
  }
  if (process.env.SHELL) return process.env.SHELL;
  try {
    const info = os.userInfo();
    if (info && info.shell) return info.shell;
  } catch (err) {
    /* ignore */
  }
  return '/bin/sh';
}

function childEnv() {
  const env = Object.assign({}, process.env, { TERM: 'xterm-256color' });
  const socket = sshService.getAgentSocket();
  if (socket) env.SSH_AUTH_SOCK = socket;
  return env;
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function start(payload, emit) {
  const cols = clamp(payload && payload.cols, 20, 500, DEFAULT_COLS);
  const rows = clamp(payload && payload.rows, 5, 200, DEFAULT_ROWS);
  const shell = loginShell(payload && payload.shell);
  const id = `t${Date.now().toString(36)}-${(counter += 1)}`;
  const python = pythonBinary();

  if (!fs.existsSync(BRIDGE)) {
    const message = `terminal bridge not found: ${BRIDGE}`;
    logger.error(`[terminal] ${message}`);
    if (emit) emit({ id, type: 'error', message });
    return { ok: false, id, error: message };
  }

  const child = spawn(python, [BRIDGE, shell, String(cols), String(rows)], {
    cwd: os.homedir(),
    env: childEnv(),
    stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
  });
  logger.file(`[terminal] session ${id} start ${cols}x${rows} shell=${shell} python=${python}`);

  const send = (message) => {
    if (emit) emit(Object.assign({ id }, message));
  };
  child.stdout.on('data', (chunk) => send({ type: 'data', data: chunk.toString('utf8') }));
  child.stderr.on('data', (chunk) => send({ type: 'data', data: chunk.toString('utf8') }));
  child.on('error', (err) => {
    logger.error(`[terminal] session ${id} failed: ${err.message}`);
    sessions.delete(id);
    send({ type: 'error', message: err.message });
  });
  child.on('close', (code, signal) => {
    sessions.delete(id);
    logger.file(`[terminal] session ${id} closed code=${code} signal=${signal || '-'}`);
    send({ type: 'exit', code, signal });
  });

  sessions.set(id, { id, child, emit, cols, rows });
  return { ok: true, id, cols, rows, shell };
}

function get(id) {
  return sessions.get(id) || null;
}

function write(id, data) {
  const entry = sessions.get(id);
  if (!entry || typeof data !== 'string' || !data) return false;
  try {
    entry.child.stdin.write(data);
    return true;
  } catch (err) {
    logger.error(`[terminal] session ${id} write failed: ${err.message}`);
    return false;
  }
}

function resize(id, cols, rows) {
  const entry = sessions.get(id);
  if (!entry) return false;
  const control = entry.child.stdio && entry.child.stdio[3];
  if (!control) return false;
  const safeCols = clamp(cols, 20, 500, DEFAULT_COLS);
  const safeRows = clamp(rows, 5, 200, DEFAULT_ROWS);
  try {
    control.write(`resize ${safeCols} ${safeRows}\n`);
    return true;
  } catch (err) {
    return false;
  }
}

function interrupt(id) {
  return write(id, '\u0003');
}

/* Type a command into a session: Ctrl-U clears the input line, CR accepts it so a
   previous command's unfinished output line cannot be overwritten. */
function inject(id, line) {
  if (!line) return false;
  return write(id, `\u0015\r${line}\r`);
}

function kill(id) {
  const entry = sessions.get(id);
  if (!entry) return false;
  sessions.delete(id);
  try {
    entry.child.kill();
  } catch (err) {
    /* ignore */
  }
  return true;
}

function killAll() {
  for (const id of Array.from(sessions.keys())) kill(id);
}

function count() {
  return sessions.size;
}

module.exports = { start, get, write, resize, interrupt, inject, kill, killAll, count, loginShell };
