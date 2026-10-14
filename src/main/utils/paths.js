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
// 文件面板按 ssh 目标（用户名@主机）记录最近 cd 到的目录（见 cd-history-service）。
const CD_HISTORY_FILE = path.join(DATA_DIR, 'cd-history.json');
// 日志按天写入 LOG_DIR 下的 ships-YYYY-MM-DD.log（见 logger.js）。
// macOS 放到 ~/Library/Logs/Ships：Console.app 的「日志报告」会收录该目录（与 JetBrains/CLion 一致），
// 与用户数据目录分离；其它平台退回应用数据目录下的 logs/。
const LOG_DIR =
  process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Logs', 'Ships')
    : path.join(DATA_DIR, 'logs');
const SSH_CONFIG_FILE = process.env.SHIPS_SSH_CONFIG || path.join(os.homedir(), '.ssh', 'config');

function pad2(value) {
  return String(value).padStart(2, '0');
}

function logFileForDate(date) {
  const d = date instanceof Date ? date : new Date();
  return path.join(LOG_DIR, `ships-${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}.log`);
}

function todayLogFile() {
  return logFileForDate(new Date());
}

const DATA_FILES = [
  SETTINGS_FILE,
  SSH_DETECTED_FILE,
  TERMINAL_WINDOW_FILE,
  FILE_WINDOW_FILE,
  FILE_LAYOUT_FILE,
  FILE_WINDOW_LAYOUT_FILE,
  CD_HISTORY_FILE,
  LOG_DIR,
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
  CD_HISTORY_FILE,
  LOG_DIR,
  todayLogFile,
  logFileForDate,
  SSH_CONFIG_FILE,
  DATA_FILES,
  describeDataFiles,
};
