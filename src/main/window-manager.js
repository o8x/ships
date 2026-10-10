'use strict';

const fs = require('fs');
const path = require('path');
const { BrowserWindow, screen } = require('electron');
const { WINDOW, SETTINGS_WINDOW, TERMINAL_WINDOW, VIBRANCY, IPC } = require('../shared/constants');
const settings = require('./services/settings-service');
const { TERMINAL_WINDOW_FILE } = require('./utils/paths');
const { readJson, writeJson } = require('./utils/json-store');
const { clampNumber, displaySignature, displayBySignature, clampBounds } = require('./utils/window-geometry');
const logger = require('./utils/logger');

const RENDERER_DIR = path.join(__dirname, '..', 'renderer');
const PRELOAD_DIR = path.join(__dirname, '..', 'preload');

let mainWindow = null;
let settingsWindow = null;
let terminalWindow = null;
let trayRef = null;
let blurSuppressed = false;
let pinnedPositioned = false;
let terminalGeometryTimer = null;
let suppressTerminalSizeSave = false;
/* 终端窗口是否正在被拖动缩放：will-resize 在拖拽的每一帧都会触发，用它当「拖动中」信号，
   连续 350ms 没再收到就认为松手。**拖动期间一律不改窗口尺寸** —— 中途 setBounds 会打乱
   macOS 的拖拽跟踪（表现为越拖越小 / 反复跳变），所以把对齐请求先记下来、松手后再执行。 */
let terminalResizingUntil = 0;
let terminalResizeIdleTimer = null;
let terminalSnapPending = false;

function applyTerminalSnap(size) {
  const win = getTerminalWindow();
  if (!win || win.isMaximized() || win.isFullScreen() || !size) return;
  const [width, height] = win.getContentSize();
  win.setContentSize(size.width || width, size.height || height);
}

function flushPendingTerminalSnap() {
  terminalResizeIdleTimer = null;
  if (!terminalSnapPending || Date.now() < terminalResizingUntil) return;
  terminalSnapPending = false;
  // 拖动期间挂起的请求可能已经过期（用户又拖了一段），交给渲染层重新测量再对齐。
  const win = getTerminalWindow();
  if (win && !win.isDestroyed()) win.webContents.send(IPC.TERMINAL_RECALIBRATE);
}

function markTerminalResizing() {
  const first = Date.now() >= terminalResizingUntil;
  terminalResizingUntil = Date.now() + 350;
  if (terminalResizeIdleTimer) clearTimeout(terminalResizeIdleTimer);
  terminalResizeIdleTimer = setTimeout(flushPendingTerminalSnap, 380);
  // 告诉渲染层「正在拖动」：拖动期间它不会发对齐请求（中途改尺寸会打乱系统拖拽跟踪），
  // 直到鼠标重新回到内容区（说明松手了）才继续。
  if (first) {
    const win = getTerminalWindow();
    if (win && !win.isDestroyed()) win.webContents.send(IPC.TERMINAL_DRAG_ACTIVE);
  }
}

/* 渲染层按实测余量请求对齐尺寸（行 / 列都要刚好装下整格）：拖动中先挂起，
   松手后（或本来就空闲时）立即执行。 */
function requestTerminalSnap(payload) {
  const win = getTerminalWindow();
  if (!win || win.isMaximized() || win.isFullScreen()) return { ok: false };
  const [currentWidth, currentHeight] = win.getContentSize();
  const minWidth = Math.round(win.getMinimumSize()[0]) || 0;
  const minHeight = Math.round(win.getMinimumSize()[1]) || 0;
  const wantedWidth = Math.round(Number(payload && payload.width)) || currentWidth;
  const wantedHeight = Math.round(Number(payload && payload.height)) || currentHeight;
  // 安全上限：正常对齐最多只差一格（≤ 约 20px），偏差过大说明状态不对，宁可不做。
  const SNAP_LIMIT_PX = 60;
  const size = {};
  if (wantedWidth !== currentWidth && wantedWidth >= minWidth && Math.abs(wantedWidth - currentWidth) <= SNAP_LIMIT_PX) {
    size.width = wantedWidth;
  }
  if (wantedHeight !== currentHeight && wantedHeight >= minHeight && Math.abs(wantedHeight - currentHeight) <= SNAP_LIMIT_PX) {
    size.height = wantedHeight;
  }
  if (!Object.keys(size).length) return { ok: false, width: currentWidth, height: currentHeight };
  if (Date.now() < terminalResizingUntil) {
    terminalSnapPending = true;
    return { ok: true, deferred: true, size };
  }
  applyTerminalSnap(size);
  return { ok: true, size };
}

/* The terminal window size is a user setting (设置 → 终端 → 窗口大小); the value is
   also written back when the window is resized by hand, so the next open matches. */
function terminalWindowSize() {
  return {
    width: clampNumber(settings.get('terminalWindowWidth'), TERMINAL_WINDOW.minWidth, 10000, TERMINAL_WINDOW.width),
    height: clampNumber(settings.get('terminalWindowHeight'), TERMINAL_WINDOW.minHeight, 10000, TERMINAL_WINDOW.height),
  };
}

/* 终端窗口几何记忆（单槽，terminal-window.json）：最近一次的屏幕 + 位置 + 尺寸。
   下次打开时那块屏幕还在（id / 分辨率 / 缩放一致）就沿用，否则用设置里的默认尺寸
   在该屏幕上居中显示。 */
let terminalState = readJson(TERMINAL_WINDOW_FILE, null);

/* 没有记忆（或记忆的屏幕已不在）时取鼠标所在屏幕：拉起终端的托盘 / 面板就在那上面。 */
function anchorDisplay() {
  try {
    return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  } catch (err) {
    return screen.getPrimaryDisplay();
  }
}

function terminalBoundsForOpen() {
  const size = terminalWindowSize();
  const saved = terminalState && terminalState.bounds ? terminalState : null;
  const min = { width: TERMINAL_WINDOW.minWidth, height: TERMINAL_WINDOW.minHeight };
  // 同一块屏幕还在 -> 沿用记忆；换屏 / 拔屏 / 无数据 -> 默认尺寸在当前屏幕居中。
  const matched = saved ? displayBySignature(screen.getAllDisplays(), saved.display) : null;
  if (matched) return clampBounds(saved.bounds, matched, size, min);
  return clampBounds(null, anchorDisplay(), size, min);
}

function applyTerminalWindowSize() {
  const size = terminalWindowSize();
  rememberTerminalSize(size);
  const win = getTerminalWindow();
  if (!win || win.isMaximized() || win.isFullScreen()) return;
  const [width, height] = win.getSize();
  if (width === size.width && height === size.height) return;
  suppressTerminalSizeSave = true;
  win.setSize(size.width, size.height);
  setTimeout(() => {
    suppressTerminalSizeSave = false;
  }, 500);
}

/* 改设置里的窗口大小后，记忆里的尺寸也要跟上，否则下次在同一块屏幕上打开会沿用旧尺寸。 */
function rememberTerminalSize(size) {
  if (!terminalState || !terminalState.bounds) return;
  if (terminalState.bounds.width === size.width && terminalState.bounds.height === size.height) return;
  terminalState = Object.assign({}, terminalState, {
    bounds: Object.assign({}, terminalState.bounds, { width: size.width, height: size.height }),
  });
  writeJson(TERMINAL_WINDOW_FILE, terminalState);
}

function saveTerminalWindowSize() {
  const win = getTerminalWindow();
  if (!win || suppressTerminalSizeSave || win.isMaximized() || win.isFullScreen()) return;
  const [width, height] = win.getSize();
  if (settings.get('terminalWindowWidth') === width && settings.get('terminalWindowHeight') === height) return;
  settings.set({ terminalWindowWidth: width, terminalWindowHeight: height });
}

/* 把窗口此刻的真实几何（位置 + 尺寸 + 所在屏幕）落盘；顺带把尺寸写回设置（既有行为）。
   落盘时读窗口当前值，而不是早先捕获的快照 —— 否则「刚拖动完又改了窗口大小」会被
   旧快照覆盖。 */
function saveTerminalGeometry() {
  const win = getTerminalWindow();
  if (!win || win.isMaximized() || win.isFullScreen()) return;
  // 设置写回自带 suppress 保护（避免程序化 setSize 触发回写循环），
  // 几何记忆不受影响：位置 / 尺寸总是记窗口此刻的真实值。
  saveTerminalWindowSize();
  const bounds = win.getBounds();
  const next = {
    display: displaySignature(screen.getDisplayMatching(bounds)),
    bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
  };
  if (!next.display) return;
  if (JSON.stringify(next) === JSON.stringify(terminalState)) return;
  terminalState = next;
  writeJson(TERMINAL_WINDOW_FILE, terminalState);
}

/* 拖动 / 缩放：停顿 400ms 落盘；窗口关闭时立刻落盘（见 openTerminalWindow 的 close）。 */
function scheduleTerminalGeometrySave() {
  if (terminalGeometryTimer) clearTimeout(terminalGeometryTimer);
  terminalGeometryTimer = setTimeout(() => {
    terminalGeometryTimer = null;
    saveTerminalGeometry();
  }, 400);
}

/* 忘掉记住的屏幕 / 位置 / 尺寸（设置 → 终端 → 重置）：删掉数据文件并清空内存里的记忆，
   下次打开就按设置里的默认尺寸居中。已打开的终端窗口保持原样，之后的移动 / 关闭会重新记录。 */
function forgetTerminalGeometry() {
  terminalState = null;
  if (terminalGeometryTimer) {
    clearTimeout(terminalGeometryTimer);
    terminalGeometryTimer = null;
  }
  try {
    fs.rmSync(TERMINAL_WINDOW_FILE, { force: true });
  } catch (err) {
    logger.warn('remove terminal-window.json failed:', err.message);
  }
  logger.file('[terminal] window geometry memory cleared');
}

/* 关闭按钮行为：'hide' 只隐藏窗口（会话与 shell 都留着，快捷键再按即回），
   'destroy' 直接销毁（结束会话）。见 设置 → 终端 → 关闭按钮行为。 */
function terminalCloseAction() {
  return settings.get('terminalCloseAction') === 'hide' ? 'hide' : 'destroy';
}

/* 关闭按钮 / Cmd-W：按设置隐藏或销毁。 */
function closeTerminalWindow() {
  const win = getTerminalWindow();
  if (!win) return null;
  if (terminalCloseAction() === 'hide') {
    win.hide();
    return win;
  }
  destroyTerminalWindow();
  return null;
}

/* 强制销毁（会话结束 exit / iTerm 交接 / 关闭行为=destroy）：先落盘几何再 destroy，
   destroy 不触发 close 事件，因此不会被「隐藏」行为拦下。 */
function destroyTerminalWindow() {
  const win = getTerminalWindow();
  if (!win) return;
  saveTerminalGeometry();
  win.destroy();
}

/* 全局快捷键：已展示且在前台 → 隐藏；否则打开 / 聚焦（Steam 式悬浮 + 快速开关）。 */
function toggleTerminalWindow() {
  const win = getTerminalWindow();
  if (win && win.isVisible() && win.isFocused()) {
    win.hide();
    return win;
  }
  return openTerminalWindow();
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
    // 面板自身永远置顶（§8.1）：它必须浮在全屏应用之上，否则点托盘时系统只能
    // 切回普通桌面才显示得出来。与终端窗口的「置顶」开关无关。
    alwaysOnTop: true,
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

  // 加入所有桌面 + 全屏辅助：面板是菜单栏弹出层，要在任何桌面（含全屏应用之上）直接浮出。
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
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
  // 每次弹出都重新声明一次「所有桌面 + 全屏辅助 + 置顶」：窗口层级 / 桌面归属可能被
  // 系统或其它窗口影响，重新声明才能保证在当前界面（含全屏应用之上）直接浮出，
  // 而不是被系统切到别的桌面去显示。
  win.setAlwaysOnTop(true);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
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
    terminalWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    terminalWindow.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true, skipTransformProcessType: true });
    terminalWindow.show();
    terminalWindow.focus();
    return terminalWindow;
  }

  // 有同屏记忆就用记忆里的屏幕 / 位置 / 尺寸，否则默认尺寸居中（见 terminalBoundsForOpen）。
  const bounds = terminalBoundsForOpen();
  terminalWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
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
  terminalWindow.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true, skipTransformProcessType: true });
  // 系统红绿灯藏起来，改用头栏里自绘的小红绿灯（20px 头栏放不下系统的标准尺寸）。
  if (typeof terminalWindow.setWindowButtonVisibility === 'function') {
    terminalWindow.setWindowButtonVisibility(false);
  }
  terminalWindow.loadFile(path.join(RENDERER_DIR, 'terminal.html'));
  terminalWindow.on('resize', scheduleTerminalGeometrySave);
  terminalWindow.on('move', scheduleTerminalGeometrySave);
  // 只用来标记「正在拖动」：不拦截、不改尺寸，松手后再执行挂起的对齐请求
  terminalWindow.on('will-resize', markTerminalResizing);
  // 实际生效的几何（恢复时可能被夹取过）也记下来，保证记忆与窗口一致。
  scheduleTerminalGeometrySave();
  terminalWindow.once('ready-to-show', () => {
    terminalWindow.show();
    terminalWindow.focus();
  });
  // 关闭按钮 / Cmd-W：按「关闭按钮行为」隐藏或销毁；隐藏时窗口还活着（会话保留），
  // 会话结束（exit）与 iTerm 交接走 destroyTerminalWindow()，不受这里拦截。
  terminalWindow.on('close', (event) => {
    if (terminalCloseAction() === 'hide') {
      event.preventDefault();
      saveTerminalGeometry();
      terminalWindow.hide();
      return;
    }
    saveTerminalGeometry();
  });
  terminalWindow.on('closed', () => {
    terminalWindow = null;
    if (terminalGeometryTimer) {
      clearTimeout(terminalGeometryTimer);
      terminalGeometryTimer = null;
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
  forgetTerminalGeometry,
  requestTerminalSnap,
  terminalCloseAction,
  closeTerminalWindow,
  destroyTerminalWindow,
  toggleTerminalWindow,
  broadcast,
  setBlurSuppressed,
  applyPin,
  applyVibrancy,
};
