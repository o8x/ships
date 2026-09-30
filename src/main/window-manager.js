'use strict';

const path = require('path');
const { BrowserWindow, screen } = require('electron');
const { WINDOW, SETTINGS_WINDOW, TERMINAL_WINDOW, VIBRANCY, IPC } = require('../shared/constants');
const settings = require('./services/settings-service');
const logger = require('./utils/logger');

const RENDERER_DIR = path.join(__dirname, '..', 'renderer');
const PRELOAD_DIR = path.join(__dirname, '..', 'preload');

let mainWindow = null;
let settingsWindow = null;
let terminalWindow = null;
let trayRef = null;
let blurSuppressed = false;
let pinnedPositioned = false;
let terminalSizeSaving = null;
let suppressTerminalSizeSave = false;

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

/* The terminal window size is a user setting (设置 → 终端 → 窗口大小); the value is
   also written back when the window is resized by hand, so the next open matches. */
function terminalWindowSize() {
  return {
    width: clampNumber(settings.get('terminalWindowWidth'), TERMINAL_WINDOW.minWidth, 10000, TERMINAL_WINDOW.width),
    height: clampNumber(settings.get('terminalWindowHeight'), TERMINAL_WINDOW.minHeight, 10000, TERMINAL_WINDOW.height),
  };
}

function applyTerminalWindowSize() {
  const win = getTerminalWindow();
  if (!win || win.isMaximized() || win.isFullScreen()) return;
  const size = terminalWindowSize();
  const [width, height] = win.getSize();
  if (width === size.width && height === size.height) return;
  suppressTerminalSizeSave = true;
  win.setSize(size.width, size.height);
  setTimeout(() => {
    suppressTerminalSizeSave = false;
  }, 500);
}

function saveTerminalWindowSize() {
  const win = getTerminalWindow();
  if (!win || suppressTerminalSizeSave || win.isMaximized() || win.isFullScreen()) return;
  const [width, height] = win.getSize();
  if (settings.get('terminalWindowWidth') === width && settings.get('terminalWindowHeight') === height) return;
  settings.set({ terminalWindowWidth: width, terminalWindowHeight: height });
}

/* 终端窗口的置顶开关（头部图钉按钮 / settings.json 的 terminalAlwaysOnTop）。 */
function terminalAlwaysOnTop() {
  return settings.get('terminalAlwaysOnTop') !== false;
}

function applyTerminalAlwaysOnTop() {
  const win = getTerminalWindow();
  if (!win) return terminalAlwaysOnTop();
  if (terminalAlwaysOnTop()) win.setAlwaysOnTop(true, 'screen-saver');
  else win.setAlwaysOnTop(false);
  return terminalAlwaysOnTop();
}

// electron-liquid-glass is a macOS-only native addon (NSGlassEffectView, macOS
// 26+); load it lazily so non-macOS builds never touch it.
let liquidGlassModule;
let liquidGlassResolved = false;
function getLiquidGlass() {
  if (liquidGlassResolved) return liquidGlassModule;
  liquidGlassResolved = true;
  liquidGlassModule = null;
  if (process.platform !== 'darwin') return null;
  try {
    liquidGlassModule = require('electron-liquid-glass');
  } catch (err) {
    logger.warn('electron-liquid-glass unavailable:', err.message);
  }
  return liquidGlassModule;
}

function liquidGlassAvailable() {
  const lg = getLiquidGlass();
  try {
    return Boolean(lg && typeof lg.isGlassSupported === 'function' && lg.isGlassSupported());
  } catch (err) {
    return false;
  }
}

// Glass mode for the popover: 'liquid' (native Liquid Glass, macOS 26+),
// 'vibrancy' (hud NSVisualEffectView fallback) or 'off'.
function glassMode() {
  if (process.platform !== 'darwin' || !settings.get('vibrancy')) return 'off';
  return liquidGlassAvailable() ? 'liquid' : 'vibrancy';
}

// Apply Liquid Glass to a window (native NSGlassEffectView behind the content).
function applyLiquidGlass(win) {
  const lg = getLiquidGlass();
  if (!lg || !win || win.isDestroyed()) return;
  try {
    lg.addView(win.getNativeWindowHandle(), { cornerRadius: WINDOW.cornerRadius });
  } catch (err) {
    logger.warn('liquid glass addView failed:', err.message);
  }
}

function setTray(tray) {
  trayRef = tray;
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;

  const mode = glassMode();
  const glassOptions =
    mode === 'vibrancy' ? { vibrancy: VIBRANCY.type, visualEffectState: VIBRANCY.state } : {};

  mainWindow = new BrowserWindow({
    width: WINDOW.width,
    height: WINDOW.height,
    show: false,
    frame: false,
    transparent: true,
    ...glassOptions,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: terminalAlwaysOnTop(),
    hasShadow: true,
    // Liquid Glass rounds itself; hud vibrancy needs the native rounded frame;
    // otherwise the CSS radius shapes the panel.
    roundedCorners: mode === 'vibrancy',
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

  if (mode === 'liquid') {
    const win = mainWindow;
    win.webContents.once('did-finish-load', () => applyLiquidGlass(win));
  }

  mainWindow.on('blur', () => {
    if (blurSuppressed) return;
    if (settings.get('pinWindow')) return;
    if (settingsWindow && settingsWindow.isFocused()) return;
    hideMainWindow();
  });

  mainWindow.on('closed', function onClosed() {
    if (mainWindow === this) mainWindow = null;
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
  // Menu bar app: only open from the tray (ignore launch-time activation).
  if (!trayRef) return;
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

// Toggle the native frosted glass. `vibrancy` and `roundedCorners` are
// creation-time only (and must match so the material is clipped correctly),
// so rebuild the popover — it is hidden while the settings window is open.
function applyVibrancy() {
  if (process.platform !== 'darwin') return;
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;
  if (win.isVisible()) win.hide();
  win.destroy();
  pinnedPositioned = false;
  createMainWindow();
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

function openSettingsWindow(section) {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    if (section) settingsWindow.webContents.send(IPC.SETTINGS_OPEN_SECTION, section);
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
    if (section) settingsWindow.webContents.send(IPC.SETTINGS_OPEN_SECTION, section);
  });
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  return settingsWindow;
}

/* Always-on-top terminal: floats above other apps and above full-screen spaces
   (Steam-overlay style), so it can be used without leaving a full-screen app. */
function openTerminalWindow() {
  if (terminalWindow && !terminalWindow.isDestroyed()) {
    // Re-opening: pull the window to the space the user is on now. Toggling
    // canJoinAllSpaces off again keeps it from following later space switches.
    terminalWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    terminalWindow.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true });
    terminalWindow.show();
    terminalWindow.focus();
    return terminalWindow;
  }

  const size = terminalWindowSize();
  terminalWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    minWidth: TERMINAL_WINDOW.minWidth,
    minHeight: TERMINAL_WINDOW.minHeight,
    title: 'Ships Terminal',
    titleBarStyle: 'hiddenInset',
    show: false,
    resizable: true,
    minimizable: true,
    maximizable: true,
    fullscreenable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(PRELOAD_DIR, 'main-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });
  // Pinching / Cmd+wheel must not scale the page (title bar + icons); the terminal
  // font is zoomed instead (see menu.js and the renderer's terminal:zoom handler).
  terminalWindow.webContents.setVisualZoomLevelLimits(1, 1);
  terminalWindow.webContents.on('zoom-changed', (event, zoomDirection) => {
    if (typeof event.preventDefault === 'function') event.preventDefault();
    terminalWindow.webContents.send(IPC.TERMINAL_ZOOM, zoomDirection === 'in' ? 'in' : 'out');
  });
  applyTerminalAlwaysOnTop();
  // Steam-like: the window is pinned on top and may float above a full-screen app,
  // but it must NOT join every space — it stays on the desktop it was opened on.
  // (false = no NSWindowCollectionBehaviorCanJoinAllSpaces, true = FullScreenAuxiliary)
  terminalWindow.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true });
  terminalWindow.loadFile(path.join(RENDERER_DIR, 'terminal.html'));
  terminalWindow.on('resize', () => {
    if (terminalSizeSaving) clearTimeout(terminalSizeSaving);
    terminalSizeSaving = setTimeout(() => {
      terminalSizeSaving = null;
      saveTerminalWindowSize();
    }, 400);
  });
  terminalWindow.once('ready-to-show', () => {
    terminalWindow.show();
    terminalWindow.focus();
  });
  terminalWindow.on('closed', () => {
    terminalWindow = null;
    if (terminalSizeSaving) {
      clearTimeout(terminalSizeSaving);
      terminalSizeSaving = null;
    }
  });
  return terminalWindow;
}

function getTerminalWindow() {
  if (!terminalWindow || terminalWindow.isDestroyed()) return null;
  return terminalWindow;
}

function closeSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
}

function getSettingsWindow() {
  if (!settingsWindow || settingsWindow.isDestroyed()) return null;
  return settingsWindow;
}

function broadcast(channel, payload) {
  // The always-on-top terminal window mirrors settings too (font size / scrollback /
  // theme / locale), so it must receive settings-changed broadcasts as well.
  const wins = [getMainWindow(), getSettingsWindow(), getTerminalWindow()];
  for (const win of wins) {
    if (win) win.webContents.send(channel, payload);
  }
}

function setBlurSuppressed(value) {
  blurSuppressed = Boolean(value);
}

// 设置 → 终端 → 窗口大小：改完立即作用到已打开的终端窗口。
settings.on('changed', (_data, keys) => {
  if (!Array.isArray(keys)) {
    applyTerminalWindowSize();
    return;
  }
  if (keys.includes('terminalWindowWidth') || keys.includes('terminalWindowHeight')) {
    applyTerminalWindowSize();
  }
  if (keys.includes('terminalAlwaysOnTop')) applyTerminalAlwaysOnTop();
});

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
  openTerminalWindow,
  getTerminalWindow,
  broadcast,
  setBlurSuppressed,
  applyPin,
  applyVibrancy,
};
