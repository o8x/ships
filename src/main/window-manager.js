'use strict';

const path = require('path');
const { BrowserWindow, screen } = require('electron');
const { WINDOW, SETTINGS_WINDOW, IPC } = require('../shared/constants');
const settings = require('./services/settings-service');
const logger = require('./utils/logger');

const RENDERER_DIR = path.join(__dirname, '..', 'renderer');
const PRELOAD_DIR = path.join(__dirname, '..', 'preload');

let mainWindow = null;
let settingsWindow = null;
let trayRef = null;
let blurSuppressed = false;
let pinnedPositioned = false;

function setTray(tray) {
  trayRef = tray;
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;

  mainWindow = new BrowserWindow({
    width: WINDOW.width,
    height: WINDOW.height,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    roundedCorners: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(PRELOAD_DIR, 'main-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (mainWindow.setMovable) mainWindow.setMovable(Boolean(settings.get('pinWindow')));
  mainWindow.loadFile(path.join(RENDERER_DIR, 'index.html'));

  mainWindow.on('blur', () => {
    if (blurSuppressed) return;
    if (settings.get('pinWindow')) return;
    if (settingsWindow && settingsWindow.isFocused()) return;
    hideMainWindow();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

function getMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  return mainWindow;
}

function positionUnderTray() {
  const win = getMainWindow();
  if (!win || !trayRef) return;

  const trayBounds = trayRef.getBounds();
  const winBounds = win.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: trayBounds.x + Math.round(trayBounds.width / 2),
    y: trayBounds.y + Math.round(trayBounds.height / 2),
  });
  const work = display.workArea;

  let x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2);
  let y = Math.round(trayBounds.y + trayBounds.height + WINDOW.gapBelowTray);

  const margin = 4;
  x = Math.min(Math.max(x, work.x + margin), work.x + work.width - winBounds.width - margin);
  if (y + winBounds.height > work.y + work.height) {
    y = Math.max(work.y + margin, work.y + work.height - winBounds.height - margin);
  }

  win.setPosition(x, y, false);
}

function showMainWindow() {
  const win = getMainWindow() || createMainWindow();
  const pinned = Boolean(settings.get('pinWindow'));
  if (!pinned || !pinnedPositioned) positionUnderTray();
  win.show();
  win.focus();
  if (pinned) pinnedPositioned = true;
}

// Applies the pin (keep-on-top) behavior: when pinned the popover can be moved
// and keeps its position; when unpinned it hides and resets to the tray anchor.
function applyPin(pinned) {
  const win = getMainWindow();
  if (win && win.setMovable) win.setMovable(Boolean(pinned));
  if (pinned) {
    pinnedPositioned = true;
  } else {
    pinnedPositioned = false;
    hideMainWindow();
    positionUnderTray();
  }
}

function hideMainWindow() {
  const win = getMainWindow();
  if (win && win.isVisible()) win.hide();
}

function toggleMainWindow() {
  const win = getMainWindow() || createMainWindow();
  if (win.isVisible()) {
    hideMainWindow();
  } else {
    showMainWindow();
  }
}

function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    width: SETTINGS_WINDOW.width,
    height: SETTINGS_WINDOW.height,
    minWidth: 560,
    minHeight: 420,
    title: 'Ships',
    show: false,
    resizable: true,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 16 },
    webPreferences: {
      preload: path.join(PRELOAD_DIR, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  settingsWindow.loadFile(path.join(RENDERER_DIR, 'settings.html'));
  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
    settingsWindow.focus();
  });
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  return settingsWindow;
}

function closeSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
}

function getSettingsWindow() {
  if (!settingsWindow || settingsWindow.isDestroyed()) return null;
  return settingsWindow;
}

function broadcast(channel, payload) {
  const wins = [getMainWindow(), getSettingsWindow()];
  for (const win of wins) {
    if (win) win.webContents.send(channel, payload);
  }
}

function setBlurSuppressed(value) {
  blurSuppressed = Boolean(value);
}

module.exports = {
  setTray,
  createMainWindow,
  getMainWindow,
  showMainWindow,
  hideMainWindow,
  toggleMainWindow,
  openSettingsWindow,
  closeSettingsWindow,
  getSettingsWindow,
  broadcast,
  setBlurSuppressed,
  applyPin,
};
