'use strict';

const { ipcRenderer } = require('electron');
const { IPC } = require('../shared/constants');
const {
  GAME_ENGINES,
  GAME_EMULATOR_VERSION,
  GAME_EMULATOR_DIR,
  GAME_SAVE_INTERVAL_MS,
  GAME_BLUR_PAUSE_DELAY_MS,
  ACTION_DEFS,
  ACTION_LABELS,
  HOTKEY_LABELS,
  UNIQUE_ACTIONS,
  COMMON_ACTIONS,
  COMMON_KEY_PRESETS,
  DEFAULT_GAME_HOTKEYS,
  defaultCommonKeys,
  defaultGameKeymaps,
  defaultGameHotkeys,
} = require('../shared/game-constants');

function on(channel, cb) {
  const listener = (_event, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const games = {
  constants: {
    engines: GAME_ENGINES,
    emulatorVersion: GAME_EMULATOR_VERSION,
    emulatorDir: GAME_EMULATOR_DIR,
    saveIntervalMs: GAME_SAVE_INTERVAL_MS,
    blurPauseDelayMs: GAME_BLUR_PAUSE_DELAY_MS,
    actionDefs: ACTION_DEFS,
    actionLabels: ACTION_LABELS,
    hotkeyLabels: HOTKEY_LABELS,
    uniqueActions: UNIQUE_ACTIONS,
    commonActions: COMMON_ACTIONS,
    commonPresets: { pc: Object.assign({}, COMMON_KEY_PRESETS.pc), traditional: Object.assign({}, COMMON_KEY_PRESETS.traditional) },
    keyPresets: (() => {
      const pcMaps = defaultGameKeymaps();
      const traditionalMaps = {};
      for (const engine of GAME_ENGINES) {
        traditionalMaps[engine.id] = Object.assign({}, pcMaps[engine.id] || {});
      }
      traditionalMaps.n64 = Object.assign({}, traditionalMaps.n64 || {}, { z: 'KeyR' });
      return {
        pc: { common: defaultCommonKeys(), engines: pcMaps },
        traditional: { common: Object.assign({}, COMMON_KEY_PRESETS.traditional), engines: traditionalMaps },
      };
    })(),
    defaultCommonKeys: defaultCommonKeys(),
    defaultKeymaps: defaultGameKeymaps(),
    defaultHotkeys: defaultGameHotkeys(),
    defaultHotkeysRaw: DEFAULT_GAME_HOTKEYS,
  },
  scan: () => ipcRenderer.invoke(IPC.GAME_SCAN),
  open: (gameId) => ipcRenderer.invoke(IPC.GAME_OPEN, { gameId }),
  windowInfo: () => ipcRenderer.invoke(IPC.GAME_WINDOW_INFO),
  saveSram: (gameId, data) => ipcRenderer.invoke(IPC.GAME_SAVE_SRAM, { gameId, data }),
  loadSram: (gameId) => ipcRenderer.invoke(IPC.GAME_LOAD_SRAM, { gameId }),
  saveState: (gameId, state, screenshot) =>
    ipcRenderer.invoke(IPC.GAME_SAVE_STATE, { gameId, state, screenshot }),
  loadState: (gameId) => ipcRenderer.invoke(IPC.GAME_LOAD_STATE, { gameId }),
  touch: (gameId, playSeconds) => ipcRenderer.invoke(IPC.GAME_TOUCH, { gameId, playSeconds }),
  loadReady: (gameId) => ipcRenderer.invoke(IPC.GAME_LOAD_READY, { gameId }),
  closeNow: () => ipcRenderer.invoke(IPC.GAME_CLOSE_NOW),
  selectWorkdir: () => ipcRenderer.invoke(IPC.GAME_SELECT_WORKDIR),
  setWorkdir: (value) => ipcRenderer.invoke(IPC.GAME_SET_WORKDIR, { path: value }),
  selectBios: () => ipcRenderer.invoke(IPC.GAME_SELECT_BIOS),
  setBios: (value) => ipcRenderer.invoke(IPC.GAME_SET_BIOS, { path: value }),
  openWorkdir: () => ipcRenderer.invoke(IPC.GAME_OPEN_WORKDIR),
  openProfile: (gameId) => ipcRenderer.invoke(IPC.GAME_OPEN_PROFILE, { gameId }),
  setCommonKeys: (maps) => ipcRenderer.invoke(IPC.GAME_KEYMAP_SET, { common: maps }),
  setAllKeys: (common, all) => ipcRenderer.invoke(IPC.GAME_KEYMAP_SET, { common, all }),
  setKeymap: (engine, maps) => ipcRenderer.invoke(IPC.GAME_KEYMAP_SET, { engine, maps }),
  setAllKeymaps: (all) => ipcRenderer.invoke(IPC.GAME_KEYMAP_SET, { all }),
  setHotkeys: (maps) => ipcRenderer.invoke(IPC.GAME_HOTKEY_SET, { maps }),
  setControlsHidden: (hidden) => ipcRenderer.invoke(IPC.GAME_SET_CONTROLS_HIDDEN, { hidden }),
  setVolume: (volume) => ipcRenderer.invoke(IPC.GAME_SET_VOLUME, { volume }),
  fitWindow: (aspect) => ipcRenderer.invoke(IPC.GAME_FIT_WINDOW, { aspect }),
  onLoad: (cb) => on(IPC.GAME_LOAD, cb),
  onPrepareClose: (cb) => on(IPC.GAME_PREPARE_CLOSE, cb),
  onWorkdirChanged: (cb) => on(IPC.GAME_WORKDIR_CHANGED, cb),
  onFullscreen: (cb) => on(IPC.GAME_FULLSCREEN, cb),
};

module.exports = games;
