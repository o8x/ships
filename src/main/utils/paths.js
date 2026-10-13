'use strict';

const os = require('os');
const path = require('path');

let DATA_DIR;
try {
  DATA_DIR = require('electron').app.getPath('userData');
} catch (err) {
  DATA_DIR = process.env.SHIPS_DATA_DIR || path.join(os.homedir(), '.ships');
}
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const SSH_DETECTED_FILE = path.join(DATA_DIR, 'ssh-detected.json');
const TERMINAL_WINDOW_FILE = path.join(DATA_DIR, 'terminal-window.json');
const FILE_WINDOW_FILE = path.join(DATA_DIR, 'file-window.json');
const FILE_LAYOUT_FILE = path.join(DATA_DIR, 'file-layout.json');
const FILE_WINDOW_LAYOUT_FILE = path.join(DATA_DIR, 'file-window-layout.json');
const LOG_FILE = path.join(DATA_DIR, 'ships.log');
const SSH_CONFIG_FILE = process.env.SHIPS_SSH_CONFIG || path.join(os.homedir(), '.ssh', 'config');

const DATA_FILES = [
  SETTINGS_FILE,
  SSH_DETECTED_FILE,
  TERMINAL_WINDOW_FILE,
  FILE_WINDOW_FILE,
  FILE_LAYOUT_FILE,
  FILE_WINDOW_LAYOUT_FILE,
  LOG_FILE,
];

function describeDataFiles() {
  return DATA_FILES.map((file) => ({ file, dir: path.dirname(file) }));
}

module.exports = {
  DATA_DIR,
  SETTINGS_FILE,
  SSH_DETECTED_FILE,
  TERMINAL_WINDOW_FILE,
  FILE_WINDOW_FILE,
  FILE_LAYOUT_FILE,
  FILE_WINDOW_LAYOUT_FILE,
  LOG_FILE,
  SSH_CONFIG_FILE,
  DATA_FILES,
  describeDataFiles,
};
