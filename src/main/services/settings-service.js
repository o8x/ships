'use strict';

const { EventEmitter } = require('events');
const { SETTINGS_FILE } = require('../utils/paths');
const { readJson, writeJson } = require('../utils/json-store');
const { DEFAULT_SETTINGS } = require('../../shared/constants');

class SettingsService extends EventEmitter {
  constructor() {
    super();
    this.data = Object.assign({}, DEFAULT_SETTINGS, readJson(SETTINGS_FILE, {}));
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
