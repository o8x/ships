'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, protocol } = require('electron');
const settings = require('./settings-service');
const logger = require('../utils/logger');
const {
  GAME_EMULATOR_DIR,
  GAME_ROM_DIR,
  GAME_PROFILE_DIR,
  GAME_BIOS_DIR,
  GAME_FDS_BIOS_FILE,
  GAME_LEGACY_PROFILE_DIR,
  GAME_COVER_EXTENSIONS,
  GAME_SAVE_FILE,
  GAME_STATE_FILE,
  GAME_STATE_PREVIEW_FILE,
  GAME_RECENT_LIMIT,
  GAME_ENGINES,
} = require('../../shared/game-constants');
const { readJson, writeJson } = require('../utils/json-store');

const MIME_TYPES = {
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.html': 'text/html',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
};

let scanCache = null;

function expandHome(input) {
  const value = String(input == null ? '' : input).trim();
  if (!value) return '';
  if (value === '~') return require('os').homedir();
  if (value.startsWith('~/')) return path.join(require('os').homedir(), value.slice(2));
  return value;
}

function appRoot() {
  try {
    return app.getAppPath();
  } catch (err) {
    return path.join(__dirname, '..', '..', '..');
  }
}

function defaultWorkDir() {
  try {
    if (app.isPackaged) return path.join(app.getPath('userData'), 'games');
  } catch (err) {
    /* not in electron */
  }
  return path.join(appRoot(), 'assets', 'games');
}

function configuredWorkDir() {
  const custom = expandHome(settings.get('gameWorkDir'));
  return custom || defaultWorkDir();
}

function isDefaultWorkDir() {
  return !expandHome(settings.get('gameWorkDir'));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function ensureSkeleton(workDir) {
  const root = path.resolve(workDir);
  const stat = fs.statSync(root, { throwIfNoEntry: false });
  if (stat && !stat.isDirectory()) throw new Error('not-a-directory');
  ensureDir(root);
  ensureDir(path.join(root, GAME_ROM_DIR));
  ensureDir(path.join(root, GAME_BIOS_DIR));
  const profileDir = path.join(root, GAME_PROFILE_DIR);
  const legacyProfileDir = path.join(root, GAME_LEGACY_PROFILE_DIR);
  if (!fs.existsSync(profileDir) && !fs.existsSync(legacyProfileDir)) ensureDir(profileDir);
  for (const engine of GAME_ENGINES) ensureDir(path.join(root, GAME_ROM_DIR, engine.id));
  return root;
}

function validateWorkDir(input) {
  const raw = expandHome(input);
  const dir = raw ? path.resolve(raw) : defaultWorkDir();
  ensureSkeleton(dir);
  fs.accessSync(dir, fs.constants.W_OK);
  return dir;
}

function fdsBiosPath() {
  const raw = expandHome(settings.get('gameFdsBios'));
  if (!raw) return '';
  const file = path.resolve(raw);
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  return stat && stat.isFile() ? file : '';
}

function importFdsBios(input) {
  const raw = expandHome(input);
  if (!raw) return '';
  const source = path.resolve(raw);
  const stat = fs.statSync(source, { throwIfNoEntry: false });
  if (!stat || !stat.isFile()) throw new Error('not-a-file');
  const workDir = ensureSkeleton(configuredWorkDir());
  const dest = path.join(workDir, GAME_BIOS_DIR, GAME_FDS_BIOS_FILE);
  if (source !== dest) fs.copyFileSync(source, dest);
  return dest;
}

function sha1(value) {
  return crypto.createHash('sha1').update(String(value)).digest('hex');
}

function slugify(value) {
  const slug = String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'game';
}

function makeGameId(engineId, romKey, name) {
  const label = name || romKey.slice(0, -path.extname(romKey).length);
  return `${engineId}-${slugify(label)}-${sha1(`${engineId}/${romKey}`).slice(0, 8)}`;
}

function displayName(fileName) {
  return fileName.slice(0, -path.extname(fileName).length);
}

function extensionOf(fileName) {
  return path.extname(fileName).toLowerCase();
}

function isRomFile(fileName, extensions) {
  return extensions.includes(extensionOf(fileName));
}

function collectRomFiles(dir, extensions, out) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    return;
  }
  for (const entry of entries) {
    if (isHidden(entry.name) || entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectRomFiles(full, extensions, out);
    } else if (entry.isFile() && isRomFile(entry.name, extensions)) {
      out.push(full);
    }
  }
}

function profileRoot(workDir) {
  const candidates = [path.join(workDir, GAME_PROFILE_DIR), path.join(workDir, GAME_LEGACY_PROFILE_DIR)];
  return candidates.find((dir) => fs.existsSync(dir)) || candidates[0];
}

function profileDirFor(game) {
  if (!game) return '';
  return path.join(profileRoot(game.workDir), game.id);
}

function ensureProfileDir(game) {
  const dir = profileDirFor(game);
  if (!dir) throw new Error('no-game');
  ensureDir(dir);
  return dir;
}

function coverFor(romPath) {
  const base = romPath.slice(0, -path.extname(romPath).length);
  for (const ext of GAME_COVER_EXTENSIONS) {
    const candidate = `${base}${ext}`;
    const stat = fs.statSync(candidate, { throwIfNoEntry: false });
    if (stat && stat.isFile()) return candidate;
  }
  return '';
}

function isHidden(name) {
  return name.startsWith('.');
}

function isSymbolicLink(file) {
  try {
    return fs.lstatSync(file).isSymbolicLink();
  } catch (err) {
    return true;
  }
}

function readGameMeta(game) {
  const dir = profileDirFor(game);
  if (!dir) return null;
  return readJson(path.join(dir, 'meta.json'), null);
}

function writeGameMeta(game, patch) {
  const dir = ensureProfileDir(game);
  const current = readJson(path.join(dir, 'meta.json'), null) || {};
  const next = Object.assign(
    {
      version: 1,
      gameId: game.id,
      engine: game.engine,
      romName: game.name,
      romRelativePath: game.romRelativePath,
      createdAt: Date.now(),
      lastPlayedAt: 0,
      playSeconds: 0,
    },
    current,
    patch || {}
  );
  writeJson(path.join(dir, 'meta.json'), next);
  return next;
}

function clientGame(game) {
  if (!game) return null;
  return {
    id: game.id,
    name: game.name,
    engine: game.engine,
    label: game.label,
    core: game.core,
    romRelativePath: game.romRelativePath,
    size: game.size,
    mtime: game.mtime,
    coverUrl: game.coverPath ? `game://cover/${encodeURIComponent(game.id)}` : '',
    romUrl: `game://rom/${encodeURIComponent(game.id)}`,
  };
}

function readPlayedAtMap(workDir) {
  const map = new Map();
  const dir = profileRoot(workDir);
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    return map;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const meta = readJson(path.join(dir, entry.name, 'meta.json'), null);
    const value = meta ? Number(meta.lastPlayedAt) : 0;
    if (Number.isFinite(value) && value > 0) map.set(entry.name, value);
  }
  return map;
}

function scanWorkDir() {
  const workDir = ensureSkeleton(configuredWorkDir());
  const engines = [];
  const byId = new Map();

  for (const engine of GAME_ENGINES) {
    const engineDir = path.join(workDir, GAME_ROM_DIR, engine.id);
    let names = [];
    try {
      names = fs.readdirSync(engineDir);
    } catch (err) {
      logger.warn(`[games] cannot read ${engineDir}:`, err.message);
    }
    const games = [];
    const addGame = (romPath, name) => {
      let stat;
      try {
        stat = fs.statSync(romPath);
      } catch (err) {
        return;
      }
      if (!stat.isFile()) return;
      const romKey = path.relative(engineDir, romPath);
      const id = makeGameId(engine.id, romKey, name);
      const game = {
        id,
        name,
        engine: engine.id,
        label: engine.label,
        core: engine.core,
        romPath,
        romRelativePath: path.join(GAME_ROM_DIR, engine.id, romKey),
        coverPath: coverFor(romPath),
        size: stat.size,
        mtime: stat.mtimeMs,
        workDir,
      };
      games.push(game);
      byId.set(id, game);
    };
    for (const name of names) {
      if (isHidden(name)) continue;
      const full = path.join(engineDir, name);
      if (isSymbolicLink(full)) continue;
      let stat;
      try {
        stat = fs.statSync(full);
      } catch (err) {
        continue;
      }
      if (stat.isDirectory()) {
        const roms = [];
        collectRomFiles(full, engine.extensions, roms);
        roms.sort();
        for (const romPath of roms) addGame(romPath, name);
        continue;
      }
      if (!stat.isFile() || !isRomFile(name, engine.extensions)) continue;
      addGame(full, displayName(name));
    }
    games.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    engines.push({ id: engine.id, label: engine.label, games: games.map(clientGame) });
  }

  const playedAt = readPlayedAtMap(workDir);
  const recent = Array.from(byId.values())
    .map((game) => ({ game, lastPlayedAt: playedAt.get(game.id) || 0 }))
    .filter((entry) => entry.lastPlayedAt > 0)
    .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)
    .slice(0, GAME_RECENT_LIMIT)
    .map((entry) => clientGame(entry.game));
  if (recent.length) {
    engines.unshift({ id: 'recent', label: '', games: recent });
  }

  scanCache = { workDir, byId, at: Date.now() };
  return {
    ok: true,
    workDir: configuredWorkDir(),
    resolvedWorkDir: workDir,
    isDefault: isDefaultWorkDir(),
    engines,
  };
}

function findGame(gameId) {
  if (!gameId) return null;
  if (!scanCache) {
    try {
      scanWorkDir();
    } catch (err) {
      return null;
    }
  }
  let game = scanCache.byId.get(String(gameId));
  if (game) return game;
  try {
    scanWorkDir();
    game = scanCache.byId.get(String(gameId));
  } catch (err) {
    return null;
  }
  return game || null;
}

function getLastScan() {
  return scanCache;
}

function toBuffer(data) {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (Array.isArray(data)) return Buffer.from(data);
  return null;
}

function atomicWrite(file, data) {
  const buffer = toBuffer(data);
  if (!buffer) throw new Error('invalid-data');
  ensureDir(path.dirname(file));
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, buffer);
  fs.renameSync(tmp, file);
}

function saveSram(game, data) {
  const dir = ensureProfileDir(game);
  atomicWrite(path.join(dir, GAME_SAVE_FILE), data);
  writeGameMeta(game, { lastPlayedAt: Date.now() });
  return true;
}

function loadSram(game) {
  const dir = profileDirFor(game);
  if (!dir) return { exists: false };
  const file = path.join(dir, GAME_SAVE_FILE);
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  if (!stat || !stat.isFile()) return { exists: false };
  return { exists: true, data: fs.readFileSync(file) };
}

function saveState(game, state, screenshot) {
  const dir = ensureProfileDir(game);
  atomicWrite(path.join(dir, GAME_STATE_FILE), state);
  const preview = path.join(dir, GAME_STATE_PREVIEW_FILE);
  if (screenshot) atomicWrite(preview, screenshot);
  else fs.rmSync(preview, { force: true });
  writeGameMeta(game, { lastPlayedAt: Date.now() });
  return true;
}

function loadState(game) {
  const dir = profileDirFor(game);
  if (!dir) return { exists: false };
  const stateFile = path.join(dir, GAME_STATE_FILE);
  const previewFile = path.join(dir, GAME_STATE_PREVIEW_FILE);
  const stat = fs.statSync(stateFile, { throwIfNoEntry: false });
  if (!stat || !stat.isFile()) return { exists: false };
  const previewStat = fs.statSync(previewFile, { throwIfNoEntry: false });
  return {
    exists: true,
    state: fs.readFileSync(stateFile),
    screenshot: previewStat && previewStat.isFile() ? fs.readFileSync(previewFile) : null,
  };
}

function touchGame(game, playSeconds) {
  const seconds = Number(playSeconds);
  const patch = { lastPlayedAt: Date.now() };
  if (Number.isFinite(seconds) && seconds >= 0) patch.playSeconds = Math.round(seconds);
  writeGameMeta(game, patch);
  return true;
}

function resolveGameUrl(gameId) {
  const game = findGame(gameId);
  return game ? game.romPath : '';
}

function resolveCoverUrl(gameId) {
  const game = findGame(gameId);
  return game ? game.coverPath : '';
}

function emulatorRoot() {
  return path.join(appRoot(), GAME_EMULATOR_DIR);
}

function allowedAppRoots() {
  return [
    path.join(appRoot(), GAME_EMULATOR_DIR),
    path.join(appRoot(), 'src', 'renderer'),
  ].map((dir) => path.resolve(dir));
}

function resolveAppFile(rest) {
  const target = path.resolve(appRoot(), `.${rest.startsWith('/') ? rest : `/${rest}`}`);
  const roots = allowedAppRoots();
  if (!roots.some((root) => target === root || target.startsWith(`${root}${path.sep}`))) return '';
  return target;
}

function mimeFor(file) {
  return MIME_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

function fileResponse(request, file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch (err) {
    return new Response('Not Found', { status: 404 });
  }
  if (!stat.isFile()) return new Response('Not Found', { status: 404 });

  const headers = {
    'Content-Type': mimeFor(file),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  };
  const range = request.headers.get('range');
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : stat.size - 1;
      if (start <= end && start < stat.size) {
        const safeEnd = Math.min(end, stat.size - 1);
        const length = safeEnd - start + 1;
        const buffer = Buffer.alloc(length);
        const fd = fs.openSync(file, 'r');
        try {
          fs.readSync(fd, buffer, 0, length, start);
        } finally {
          fs.closeSync(fd);
        }
        return new Response(buffer, {
          status: 206,
          headers: Object.assign(headers, {
            'Content-Range': `bytes ${start}-${safeEnd}/${stat.size}`,
            'Content-Length': String(length),
          }),
        });
      }
      return new Response('Range Not Satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${stat.size}` },
      });
    }
  }
  const body = request.method === 'HEAD' ? null : fs.readFileSync(file);
  return new Response(body, {
    status: 200,
    headers: Object.assign(headers, { 'Content-Length': String(stat.size) }),
  });
}

function registerGameScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'game',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true,
      },
    },
  ]);
}

function registerGameProtocol() {
  protocol.handle('game', (request) => {
    let url;
    try {
      url = new URL(request.url);
    } catch (err) {
      return new Response('Bad Request', { status: 400 });
    }
    const host = url.hostname;
    const rest = decodeURIComponent(url.pathname);
    if (host === 'app') {
      const file = resolveAppFile(rest || '/');
      if (!file) return new Response('Forbidden', { status: 403 });
      return fileResponse(request, file);
    }
    if (host === 'rom') {
      const file = resolveGameUrl(rest.slice(1));
      if (!file) return new Response('Not Found', { status: 404 });
      return fileResponse(request, file);
    }
    if (host === 'cover') {
      const file = resolveCoverUrl(rest.slice(1));
      if (!file) return new Response('Not Found', { status: 404 });
      return fileResponse(request, file);
    }
    if (host === 'bios') {
      const file = fdsBiosPath();
      if (!file) return new Response('Not Found', { status: 404 });
      return fileResponse(request, file);
    }
    return new Response('Not Found', { status: 404 });
  });
}


module.exports = {
  defaultWorkDir,
  configuredWorkDir,
  isDefaultWorkDir,
  ensureSkeleton,
  validateWorkDir,
  fdsBiosPath,
  importFdsBios,
  scanWorkDir,
  clientGame,
  findGame,
  getLastScan,
  makeGameId,
  profileDirFor,
  ensureProfileDir,
  readGameMeta,
  writeGameMeta,
  saveSram,
  loadSram,
  saveState,
  loadState,
  touchGame,
  registerGameScheme,
  registerGameProtocol,
  emulatorRoot,
};
