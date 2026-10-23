'use strict';

const { dialog, shell } = require('electron');
const { IPC } = require('../../shared/constants');
const settings = require('../services/settings-service');
const games = require('../services/game-service');
const wm = require('../window-manager');
const {
  GAME_ENGINES,
  GAME_EMULATOR_VERSION,
  COMMON_ACTIONS,
  defaultCommonKeys,
  defaultGameKeymaps,
  defaultGameHotkeys,
  engineById,
} = require('../../shared/game-constants');

function isMainSender(event) {
  const win = wm.getMainWindow();
  return Boolean(win && !win.isDestroyed() && win.webContents.id === event.sender.id);
}

function isSettingsSender(event) {
  const win = wm.getSettingsWindow();
  return Boolean(win && !win.isDestroyed() && win.webContents.id === event.sender.id);
}

function isGameSender(event) {
  const win = wm.getGameWindow();
  return Boolean(win && !win.isDestroyed() && win.webContents.id === event.sender.id);
}

function currentGame(event) {
  if (!isGameSender(event)) return null;
  return wm.getGameWindowGame();
}

function sameGame(event, gameId) {
  const game = currentGame(event);
  return Boolean(game && String(game.id) === String(gameId)) ? game : null;
}

function gameSettingsPayload() {
  return {
    gameCommonKeys: settings.get('gameCommonKeys') || defaultCommonKeys(),
    gameKeymaps: settings.get('gameKeymaps') || defaultGameKeymaps(),
    gameHotkeys: settings.get('gameHotkeys') || defaultGameHotkeys(),
    gameVolume: Number(settings.get('gameVolume')),
    gameControlsHidden: Boolean(settings.get('gameControlsHidden')),
    hasFdsBios: Boolean(games.fdsBiosPath()),
    locale: settings.get('locale') || 'zh',
    theme: settings.get('theme') || 'system',
    accent: settings.get('accent') || '#2e6bfc',
  };
}

function normalizeBinding(value) {
  const text = String(value == null ? '' : value);
  if (!text) return '';
  if (text.length > 40) return null;
  if (!/^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-9]|2[0-4])|Arrow(Up|Down|Left|Right)|Space|Enter|Tab|Escape|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Meta(Left|Right)|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Numpad[0-9]|NumpadEnter|NumpadAdd|NumpadSubtract|Mouse[0-4])$/.test(
    text
  )) {
    return null;
  }
  return text;
}

function validateMap(map, allowedActions) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return { ok: false, error: 'invalid' };
  const next = {};
  const used = new Set();
  for (const action of allowedActions) {
    const binding = normalizeBinding(map[action]);
    if (binding === null) return { ok: false, error: 'invalid' };
    if (!binding) continue;
    if (used.has(binding)) return { ok: false, error: 'conflict' };
    used.add(binding);
    next[action] = binding;
  }
  return { ok: true, maps: next };
}

function commonBindingsFor(engine) {
  const common = settings.get('gameCommonKeys') || {};
  const map = {};
  for (const action of engine.commonActions || []) {
    if (common[action]) map[action] = common[action];
  }
  return map;
}

function hasDuplicateValues(map) {
  const values = Object.values(map).filter(Boolean);
  return new Set(values).size !== values.length;
}

function validateAgainstHotkeys(map) {
  const hotkeys = settings.get('gameHotkeys') || {};
  const hotValues = new Set(Object.values(hotkeys).filter(Boolean));
  for (const binding of Object.values(map)) {
    if (binding && hotValues.has(binding)) return false;
  }
  return true;
}

function validateCommonMap(map) {
  const checked = validateMap(map, COMMON_ACTIONS);
  if (!checked.ok) return checked;
  const keymaps = settings.get('gameKeymaps') || {};
  for (const engine of GAME_ENGINES) {
    const combined = {};
    for (const action of engine.commonActions || []) {
      if (checked.maps[action]) combined[action] = checked.maps[action];
    }
    Object.assign(combined, keymaps[engine.id] || {});
    if (hasDuplicateValues(combined)) return { ok: false, error: 'conflict' };
  }
  if (!validateAgainstHotkeys(checked.maps)) return { ok: false, error: 'conflict' };
  return checked;
}

function validateEngineMap(engine, map) {
  const checked = validateMap(map, engine.actions);
  if (!checked.ok) return checked;
  const combined = Object.assign({}, commonBindingsFor(engine), checked.maps);
  if (hasDuplicateValues(combined)) return { ok: false, error: 'conflict' };
  if (!validateAgainstHotkeys(combined)) return { ok: false, error: 'conflict' };
  return checked;
}

function validateAllKeymapsWithCommon(all, common) {
  const result = {};
  for (const engine of GAME_ENGINES) {
    const map = all && typeof all === 'object' ? all[engine.id] : null;
    const checked = validateMap(map, engine.actions);
    if (!checked.ok) return checked;
    const combined = {};
    for (const action of engine.commonActions || []) {
      if (common[action]) combined[action] = common[action];
    }
    Object.assign(combined, checked.maps);
    if (hasDuplicateValues(combined)) return { ok: false, error: 'conflict' };
    if (!validateAgainstHotkeys(combined)) return { ok: false, error: 'conflict' };
    result[engine.id] = checked.maps;
  }
  if (!validateAgainstHotkeys(common)) return { ok: false, error: 'conflict' };
  return { ok: true, maps: result };
}

function validateAllKeymaps(all) {
  return validateAllKeymapsWithCommon(all, settings.get('gameCommonKeys') || {});
}

function validateHotkeys(map) {
  const allowed = ['start', 'select', 'pause', 'quickSave', 'quickLoad', 'fastForward', 'fullscreen', 'mute', 'toggleControls'];
  const checked = validateMap(map, allowed);
  if (!checked.ok) return checked;
  const keymapValues = new Set();
  const common = settings.get('gameCommonKeys') || {};
  for (const binding of Object.values(common)) if (binding) keymapValues.add(binding);
  const keymaps = settings.get('gameKeymaps') || {};
  for (const engine of GAME_ENGINES) {
    const engineMap = keymaps[engine.id] || {};
    for (const binding of Object.values(engineMap)) if (binding) keymapValues.add(binding);
  }
  for (const binding of Object.values(checked.maps)) {
    if (binding && keymapValues.has(binding)) return { ok: false, error: 'conflict' };
  }
  return checked;
}

function registerGameIpc(ipcMain) {
  ipcMain.handle(IPC.GAME_SCAN, (event) => {
    if (!isMainSender(event) && !isSettingsSender(event)) return { ok: false, error: 'forbidden' };
    try {
      return games.scanWorkDir();
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle(IPC.GAME_OPEN, (event, payload) => {
    if (!isMainSender(event)) return { ok: false, error: 'forbidden' };
    const game = games.findGame(payload && payload.gameId);
    if (!game) return { ok: false, error: 'not-found' };
    try {
      try {
        games.touchGame(game);
      } catch (err) {
        void err;
      }
      wm.openGameWindow(game);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle(IPC.GAME_WINDOW_INFO, (event) => {
    if (!isGameSender(event)) return { ok: false, error: 'forbidden' };
    const game = wm.getGameWindowGame();
    if (!game) return { ok: false, error: 'not-found' };
    return {
      ok: true,
      game: games.clientGame(game),
      emulatorVersion: GAME_EMULATOR_VERSION,
      settings: gameSettingsPayload(),
    };
  });

  ipcMain.handle(IPC.GAME_SAVE_SRAM, (event, payload) => {
    const game = sameGame(event, payload && payload.gameId);
    if (!game) return { ok: false, error: 'forbidden' };
    try {
      games.saveSram(game, payload && payload.data);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle(IPC.GAME_LOAD_SRAM, (event, payload) => {
    const game = sameGame(event, payload && payload.gameId);
    if (!game) return { ok: false, error: 'forbidden' };
    try {
      const result = games.loadSram(game);
      return Object.assign({ ok: true }, result);
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle(IPC.GAME_SAVE_STATE, (event, payload) => {
    const game = sameGame(event, payload && payload.gameId);
    if (!game) return { ok: false, error: 'forbidden' };
    try {
      games.saveState(game, payload && payload.state, payload && payload.screenshot);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle(IPC.GAME_LOAD_STATE, (event, payload) => {
    const game = sameGame(event, payload && payload.gameId);
    if (!game) return { ok: false, error: 'forbidden' };
    try {
      const result = games.loadState(game);
      return Object.assign({ ok: true }, result);
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle(IPC.GAME_TOUCH, (event, payload) => {
    const game = sameGame(event, payload && payload.gameId);
    if (!game) return { ok: false, error: 'forbidden' };
    try {
      games.touchGame(game, payload && payload.playSeconds);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle(IPC.GAME_LOAD_READY, (event, payload) => {
    if (!isGameSender(event)) return { ok: false, error: 'forbidden' };
    const game = games.findGame(payload && payload.gameId);
    if (!game) return { ok: false, error: 'not-found' };
    wm.setGameWindowGame(game);
    return { ok: true };
  });

  ipcMain.handle(IPC.GAME_CLOSE_NOW, (event) => {
    if (!isGameSender(event)) return { ok: false, error: 'forbidden' };
    wm.closeGameWindowNow();
    return { ok: true };
  });

  ipcMain.handle(IPC.GAME_SELECT_WORKDIR, async (event) => {
    if (!isMainSender(event) && !isSettingsSender(event)) return null;
    const win = wm.getSettingsWindow() || wm.getMainWindow();
    const options = {
      title: 'Games',
      defaultPath: games.configuredWorkDir(),
      properties: ['openDirectory', 'createDirectory'],
    };
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths.length) return null;
    return { path: result.filePaths[0] };
  });

  ipcMain.handle(IPC.GAME_SET_WORKDIR, (event, payload) => {
    if (!isMainSender(event) && !isSettingsSender(event)) return { ok: false, error: 'forbidden' };
    const raw = String((payload && payload.path) || '').trim();
    try {
      const resolved = raw ? games.validateWorkDir(raw) : games.validateWorkDir('');
      settings.set({ gameWorkDir: raw ? resolved : '' });
      try {
        games.scanWorkDir();
      } catch (err) {
        /* scan will surface the error to the main tool */
      }
      wm.broadcast(IPC.GAME_WORKDIR_CHANGED, {
        workDir: games.configuredWorkDir(),
        resolvedWorkDir: resolved,
      });
      return {
        ok: true,
        workDir: games.configuredWorkDir(),
        resolvedWorkDir: resolved,
        isDefault: !raw,
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle(IPC.GAME_SELECT_BIOS, async (event) => {
    if (!isMainSender(event) && !isSettingsSender(event)) return null;
    const win = wm.getSettingsWindow() || wm.getMainWindow();
    const current = games.fdsBiosPath();
    const options = {
      title: 'disksys.rom',
      properties: ['openFile'],
      filters: [{ name: 'FDS BIOS', extensions: ['rom'] }],
    };
    if (current) options.defaultPath = current;
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths.length) return null;
    return { path: result.filePaths[0] };
  });

  ipcMain.handle(IPC.GAME_SET_BIOS, (event, payload) => {
    if (!isMainSender(event) && !isSettingsSender(event)) return { ok: false, error: 'forbidden' };
    const raw = String((payload && payload.path) || '').trim();
    try {
      const resolved = raw ? games.importFdsBios(raw) : '';
      settings.set({ gameFdsBios: resolved });
      return { ok: true, path: resolved };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle(IPC.GAME_OPEN_WORKDIR, async (event) => {
    if (!isMainSender(event) && !isSettingsSender(event)) return { ok: false, error: 'forbidden' };
    try {
      const dir = games.ensureSkeleton(games.configuredWorkDir());
      const error = await shell.openPath(dir);
      return error ? { ok: false, error } : { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle(IPC.GAME_OPEN_PROFILE, async (event, payload) => {
    let game = currentGame(event);
    if (!game && (isMainSender(event) || isSettingsSender(event))) {
      game = games.findGame(payload && payload.gameId);
    }
    if (!game) return { ok: false, error: 'not-found' };
    try {
      const dir = games.ensureProfileDir(game);
      const error = await shell.openPath(dir);
      return error ? { ok: false, error } : { ok: true, path: dir };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle(IPC.GAME_KEYMAP_SET, (event, payload) => {
    if (!isMainSender(event) && !isSettingsSender(event)) return { ok: false, error: 'forbidden' };
    if (payload && payload.common && payload.all) {
      const commonResult = validateMap(payload.common, COMMON_ACTIONS);
      if (!commonResult.ok) return commonResult;
      const result = validateAllKeymapsWithCommon(payload.all, commonResult.maps);
      if (!result.ok) return result;
      settings.set({ gameCommonKeys: commonResult.maps, gameKeymaps: result.maps });
      return { ok: true, maps: result.maps, common: commonResult.maps };
    }
    if (payload && payload.common) {
      const result = validateCommonMap(payload.common);
      if (!result.ok) return result;
      settings.set({ gameCommonKeys: result.maps });
      return { ok: true, maps: result.maps };
    }
    let result;
    if (payload && payload.all) {
      result = validateAllKeymaps(payload.all);
    } else {
      const engine = engineById(payload && payload.engine);
      if (!engine) return { ok: false, error: 'invalid-engine' };
      const checked = validateEngineMap(engine, payload && payload.maps);
      if (!checked.ok) return checked;
      result = {
        ok: true,
        maps: Object.assign({}, settings.get('gameKeymaps') || {}, { [engine.id]: checked.maps }),
      };
    }
    if (!result.ok) return result;
    settings.set({ gameKeymaps: result.maps });
    return { ok: true, maps: result.maps };
  });

  ipcMain.handle(IPC.GAME_HOTKEY_SET, (event, payload) => {
    if (!isMainSender(event) && !isSettingsSender(event)) return { ok: false, error: 'forbidden' };
    const result = validateHotkeys(payload && payload.maps);
    if (!result.ok) return result;
    settings.set({ gameHotkeys: result.maps });
    return { ok: true, maps: result.maps };
  });

  ipcMain.handle(IPC.GAME_SET_CONTROLS_HIDDEN, (event, payload) => {
    if (!isGameSender(event)) return { ok: false, error: 'forbidden' };
    const hidden = Boolean(payload && payload.hidden);
    settings.set({ gameControlsHidden: hidden });
    return { ok: true, hidden };
  });

  ipcMain.handle(IPC.GAME_FIT_WINDOW, (event, payload) => {
    if (!isGameSender(event)) return { ok: false, error: 'forbidden' };
    return wm.fitGameWindow(payload && payload.aspect);
  });

  ipcMain.handle(IPC.GAME_SET_VOLUME, (event, payload) => {
    if (!isGameSender(event)) return { ok: false, error: 'forbidden' };
    const value = Number(payload && payload.volume);
    const volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.7;
    settings.set({ gameVolume: volume });
    return { ok: true, volume };
  });
}

module.exports = { registerGameIpc };
