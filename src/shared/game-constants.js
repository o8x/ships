'use strict';

const GAME_EMULATOR_VERSION = '4.2.3';
const GAME_EMULATOR_DIR = `assets/emulatorjs/${GAME_EMULATOR_VERSION}`;
const GAME_ROM_DIR = 'roms';
const GAME_PROFILE_DIR = 'profiles';
const GAME_BIOS_DIR = 'bios';
const GAME_FDS_BIOS_FILE = 'disksys.rom';
const GAME_LEGACY_PROFILE_DIR = 'profile';
const GAME_SAVE_INTERVAL_MS = 15000;
const GAME_CLOSE_TIMEOUT_MS = 3000;
const GAME_BLUR_PAUSE_DELAY_MS = 150;
const GAME_COVER_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
const GAME_SAVE_FILE = 'battery.srm';
const GAME_STATE_FILE = 'state.slot1';
const GAME_STATE_PREVIEW_FILE = 'state.slot1.png';
const GAME_HEADER_HEIGHT = 34;
const GAME_RECENT_LIMIT = 8;

const COMMON_ACTIONS = ['up', 'down', 'left', 'right', 'a', 'b', 'x', 'y', 'l', 'r'];

const ACTION_DEFS = {
  up: { label: 'Up', index: 4, n64Index: 19, n64Axis: true },
  down: { label: 'Down', index: 5, n64Index: 18, n64Axis: true },
  left: { label: 'Left', index: 6, n64Index: 17, n64Axis: true },
  right: { label: 'Right', index: 7, n64Index: 16, n64Axis: true },
  a: { label: 'A', index: 8 },
  b: { label: 'B', index: 0 },
  x: { label: 'X', index: 9 },
  y: { label: 'Y', index: 1 },
  l: { label: 'L', index: 10 },
  r: { label: 'R', index: 11 },
  start: { label: 'Start', index: 3 },
  select: { label: 'Select', index: 2 },
  dpadUp: { label: 'D-pad Up', index: 4 },
  dpadDown: { label: 'D-pad Down', index: 5 },
  dpadLeft: { label: 'D-pad Left', index: 6 },
  dpadRight: { label: 'D-pad Right', index: 7 },
  cUp: { label: 'C Up', index: 23, axis: true },
  cDown: { label: 'C Down', index: 22, axis: true },
  cLeft: { label: 'C Left', index: 21, axis: true },
  cRight: { label: 'C Right', index: 20, axis: true },
  z: { label: 'Z', index: 12 },
};

const GAME_ENGINES = [
  {
    id: 'fc',
    label: 'FC',
    core: 'fceumm',
    extensions: ['.nes', '.fds', '.unf', '.unif'],
    commonActions: ['up', 'down', 'left', 'right', 'a', 'b'],
    actions: [],
  },
  {
    id: 'gbc',
    label: 'GBC',
    core: 'gambatte',
    extensions: ['.gbc'],
    commonActions: ['up', 'down', 'left', 'right', 'a', 'b'],
    actions: [],
  },
  {
    id: 'gba',
    label: 'GBA',
    core: 'mgba',
    extensions: ['.gba'],
    commonActions: ['up', 'down', 'left', 'right', 'a', 'b', 'l', 'r'],
    actions: [],
  },
  {
    id: 'n64',
    label: 'N64',
    core: 'mupen64plus_next',
    extensions: ['.z64', '.n64', '.v64'],
    commonActions: ['up', 'down', 'left', 'right', 'a', 'b', 'l', 'r'],
    actions: ['dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight', 'z', 'cUp', 'cDown', 'cLeft', 'cRight'],
  },
  {
    id: 'sfc',
    label: 'SFC',
    core: 'snes9x',
    extensions: ['.sfc', '.smc', '.fig'],
    commonActions: ['up', 'down', 'left', 'right', 'a', 'b', 'x', 'y', 'l', 'r'],
    actions: [],
  },
];

const UNIQUE_ACTIONS = {
  n64: ['dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight', 'z', 'cUp', 'cDown', 'cLeft', 'cRight'],
};

const DEFAULT_COMMON_KEYS = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  a: 'Space',
  b: 'Mouse0',
  x: 'Mouse1',
  y: 'KeyJ',
  l: 'KeyQ',
  r: 'KeyE',
};

const TRADITIONAL_COMMON_KEYS = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  a: 'KeyZ',
  b: 'KeyX',
  x: 'KeyC',
  y: 'KeyV',
  l: 'KeyQ',
  r: 'KeyE',
};

const COMMON_KEY_PRESETS = {
  pc: Object.assign({}, DEFAULT_COMMON_KEYS),
  traditional: Object.assign({}, TRADITIONAL_COMMON_KEYS),
};

const DEFAULT_N64_KEYS = {
  dpadUp: 'ArrowUp',
  dpadDown: 'ArrowDown',
  dpadLeft: 'ArrowLeft',
  dpadRight: 'ArrowRight',
  z: 'Mouse1',
  cUp: 'KeyI',
  cDown: 'KeyK',
  cLeft: 'KeyJ',
  cRight: 'KeyL',
};

const DEFAULT_GAME_HOTKEYS = {
  start: 'Enter',
  select: 'ShiftLeft',
  pause: 'Escape',
  quickSave: 'F5',
  quickLoad: 'F9',
  fastForward: 'KeyF',
  fullscreen: 'F11',
  mute: 'KeyM',
  toggleControls: 'Tab',
};

const ACTION_LABELS = {
  up: { zh: '上', en: 'Up' },
  down: { zh: '下', en: 'Down' },
  left: { zh: '左', en: 'Left' },
  right: { zh: '右', en: 'Right' },
  a: { zh: 'A（确认 / 跳跃）', en: 'A (confirm / jump)' },
  b: { zh: 'B（取消 / 射击）', en: 'B (cancel / shoot)' },
  x: { zh: 'X', en: 'X' },
  y: { zh: 'Y', en: 'Y' },
  l: { zh: 'L', en: 'L' },
  r: { zh: 'R', en: 'R' },
  start: { zh: 'Start（确认）', en: 'Start (confirm)' },
  select: { zh: 'Select（选择）', en: 'Select' },
  dpadUp: { zh: '十字键上', en: 'D-pad up' },
  dpadDown: { zh: '十字键下', en: 'D-pad down' },
  dpadLeft: { zh: '十字键左', en: 'D-pad left' },
  dpadRight: { zh: '十字键右', en: 'D-pad right' },
  cUp: { zh: 'C 上', en: 'C up' },
  cDown: { zh: 'C 下', en: 'C down' },
  cLeft: { zh: 'C 左', en: 'C left' },
  cRight: { zh: 'C 右', en: 'C right' },
  z: { zh: 'Z', en: 'Z' },
};

const HOTKEY_LABELS = {
  start: { zh: 'Start（确认）', en: 'Start (confirm)' },
  select: { zh: 'Select（选择）', en: 'Select' },
  pause: { zh: '暂停 / 继续', en: 'Pause / resume' },
  quickSave: { zh: '保存即时存档', en: 'Save state' },
  quickLoad: { zh: '读取即时存档', en: 'Load state' },
  fastForward: { zh: '快速前进（按住）', en: 'Fast forward (hold)' },
  fullscreen: { zh: '全屏', en: 'Fullscreen' },
  mute: { zh: '静音', en: 'Mute' },
  toggleControls: { zh: '显示 / 隐藏控制区', en: 'Toggle controls' },
};

function defaultCommonKeys() {
  return Object.assign({}, DEFAULT_COMMON_KEYS);
}

function defaultKeymapFor(engineId) {
  if (engineId === 'n64') return Object.assign({}, DEFAULT_N64_KEYS);
  return {};
}

function defaultGameKeymaps() {
  const maps = {};
  for (const engine of GAME_ENGINES) maps[engine.id] = defaultKeymapFor(engine.id);
  return maps;
}

function defaultGameHotkeys() {
  return Object.assign({}, DEFAULT_GAME_HOTKEYS);
}

function engineById(engineId) {
  return GAME_ENGINES.find((engine) => engine.id === engineId) || null;
}

function actionMetaFor(engineId, action) {
  const def = ACTION_DEFS[action];
  if (!def) return null;
  if (engineId === 'n64' && def.n64Index != null) {
    return { index: def.n64Index, axis: Boolean(def.n64Axis) };
  }
  return { index: def.index, axis: Boolean(def.axis) };
}

module.exports = {
  GAME_EMULATOR_VERSION,
  GAME_EMULATOR_DIR,
  GAME_ROM_DIR,
  GAME_PROFILE_DIR,
  GAME_BIOS_DIR,
  GAME_FDS_BIOS_FILE,
  GAME_LEGACY_PROFILE_DIR,
  GAME_SAVE_INTERVAL_MS,
  GAME_CLOSE_TIMEOUT_MS,
  GAME_BLUR_PAUSE_DELAY_MS,
  GAME_COVER_EXTENSIONS,
  GAME_SAVE_FILE,
  GAME_STATE_FILE,
  GAME_STATE_PREVIEW_FILE,
  GAME_HEADER_HEIGHT,
  GAME_RECENT_LIMIT,
  COMMON_ACTIONS,
  ACTION_DEFS,
  ACTION_LABELS,
  HOTKEY_LABELS,
  UNIQUE_ACTIONS,
  GAME_ENGINES,
  DEFAULT_COMMON_KEYS,
  TRADITIONAL_COMMON_KEYS,
  COMMON_KEY_PRESETS,
  DEFAULT_N64_KEYS,
  DEFAULT_GAME_HOTKEYS,
  defaultCommonKeys,
  defaultKeymapFor,
  defaultGameKeymaps,
  defaultGameHotkeys,
  engineById,
  actionMetaFor,
};
