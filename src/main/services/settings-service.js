'use strict';

const { EventEmitter } = require('events');
const { SETTINGS_FILE } = require('../utils/paths');
const { readJson, writeJson } = require('../utils/json-store');
const { DEFAULT_SETTINGS } = require('../../shared/constants');
const {
  COMMON_ACTIONS,
  GAME_ENGINES,
  defaultCommonKeys,
  defaultGameKeymaps,
  defaultGameHotkeys,
} = require('../../shared/game-constants');

function normalizeGameSettings(data, stored) {
  const before = JSON.stringify({
    common: data.gameCommonKeys,
    maps: data.gameKeymaps,
    hotkeys: data.gameHotkeys,
  });
  const common = Object.assign({}, defaultCommonKeys(), data.gameCommonKeys || {});
  const oldMaps = stored && stored.gameKeymaps && typeof stored.gameKeymaps === 'object' ? stored.gameKeymaps : null;
  const oldHotkeys = stored && stored.gameHotkeys && typeof stored.gameHotkeys === 'object' ? stored.gameHotkeys : null;

  const legacyDpad = { up: 'dpadUp', down: 'dpadDown', left: 'dpadLeft', right: 'dpadRight' };
  if (!stored || !stored.gameCommonKeys) {
    for (const action of COMMON_ACTIONS) {
      for (const engine of GAME_ENGINES) {
        const source = legacyDpad[action] || action;
        const value = oldMaps && oldMaps[engine.id] ? oldMaps[engine.id][source] : '';
        if (value) {
          common[action] = value;
          break;
        }
      }
    }
  }

  const defaults = defaultGameKeymaps();
  const maps = {};
  for (const engine of GAME_ENGINES) {
    const old = oldMaps && oldMaps[engine.id] ? oldMaps[engine.id] : {};
    const next = {};
    for (const action of engine.actions) {
      const value = old[action] || (defaults[engine.id] && defaults[engine.id][action]) || '';
      if (value) next[action] = value;
    }
    maps[engine.id] = next;
  }

  const hotkeys = Object.assign({}, defaultGameHotkeys(), data.gameHotkeys || {});
  if (!stored || !stored.gameCommonKeys) {
    for (const action of ['start', 'select']) {
      if (oldHotkeys && oldHotkeys[action]) continue;
      for (const engine of GAME_ENGINES) {
        const value = oldMaps && oldMaps[engine.id] ? oldMaps[engine.id][action] : '';
        if (value) {
          hotkeys[action] = value;
          break;
        }
      }
    }
  }

  const combinedOk = (nextCommon, nextMaps, nextHotkeys) => {
    const hotValues = new Set(Object.values(nextHotkeys || {}).filter(Boolean));
    for (const engine of GAME_ENGINES) {
      const combined = {};
      for (const action of engine.commonActions || []) {
        if (nextCommon[action]) combined[action] = nextCommon[action];
      }
      Object.assign(combined, nextMaps[engine.id] || {});
      const values = Object.values(combined).filter(Boolean);
      if (new Set(values).size !== values.length) return false;
      for (const value of values) if (hotValues.has(value)) return false;
    }
    return true;
  };

  let finalCommon = common;
  let finalMaps = maps;
  let finalHotkeys = hotkeys;
  if (!combinedOk(finalCommon, finalMaps, finalHotkeys)) {
    finalCommon = defaultCommonKeys();
    finalMaps = defaultGameKeymaps();
  }
  if (!combinedOk(finalCommon, finalMaps, finalHotkeys)) {
    finalHotkeys = defaultGameHotkeys();
  }

  data.gameCommonKeys = finalCommon;
  data.gameKeymaps = finalMaps;
  data.gameHotkeys = finalHotkeys;

  const after = JSON.stringify({ common: finalCommon, maps: finalMaps, hotkeys: finalHotkeys });
  return before !== after;
}


class SettingsService extends EventEmitter {
  constructor() {
    super();
    const stored = readJson(SETTINGS_FILE, {});
    this.data = Object.assign({}, DEFAULT_SETTINGS, stored);
    const gameChanged = normalizeGameSettings(this.data, stored);
    // 独立文件窗口曾默认置顶，且没有界面开关；把旧版本遗留的 true 归一为「不置顶」。
    if (this.data.fileWindowAlwaysOnTop === true) {
      this.data.fileWindowAlwaysOnTop = false;
      writeJson(SETTINGS_FILE, this.data);
    } else if (gameChanged) {
      writeJson(SETTINGS_FILE, this.data);
    }
  }

  getAll() {
    return Object.assign({}, this.data);
  }

  get(key) {
    return this.data[key];
  }

  set(patch) {
    if (!patch || typeof patch !== 'object') return this.getAll();
    const next = Object.assign({}, this.data, patch);
    if (JSON.stringify(next) === JSON.stringify(this.data)) {
      return this.getAll();
    }
    this.data = next;
    writeJson(SETTINGS_FILE, this.data);
    this.emit('changed', this.getAll(), Object.keys(patch));
    return this.getAll();
  }
}

module.exports = new SettingsService();
