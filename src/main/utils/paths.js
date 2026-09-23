'use strict';

const os = require('os');
const path = require('path');
const { app } = require('electron');

const DATA_DIR = app.getPath('userData');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const SSH_DETECTED_FILE = path.join(DATA_DIR, 'ssh-detected.json');
const SSH_CONFIG_FILE = path.join(os.homedir(), '.ssh', 'config');

const DATA_FILES = [SETTINGS_FILE, SSH_DETECTED_FILE];

function describeDataFiles() {
  return DATA_FILES.map((file) => ({ file, dir: path.dirname(file) }));
}

module.exports = {
  DATA_DIR,
  SETTINGS_FILE,
  SSH_DETECTED_FILE,
  SSH_CONFIG_FILE,
  DATA_FILES,
  describeDataFiles,
};
