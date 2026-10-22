'use strict';

const fs = require('fs');
const path = require('path');
const { BrowserWindow, screen, nativeTheme, app } = require('electron');
const {
  WINDOW,
  MAIN_WINDOW,
  SETTINGS_WINDOW,
  TERMINAL_WINDOW,
  FILE_WINDOW,
  UPDATE_WINDOW,
  CENTER_SNAP,
  VIBRANCY,
  IPC,
  SPACE_CONFIRM_DELAY_MS,
} = require('../shared/constants');
const settings = require('./services/settings-service');
const { TERMINAL_WINDOW_FILE, FILE_WINDOW_FILE, MAIN_WINDOW_FILE } = require('./utils/paths');
const { readJson, writeJson } = require('./utils/json-store');
const { clampNumber, displaySignature, displayBySignature, clampBounds } = require('./utils/window-geometry');
const logger = require('./utils/logger');
const spaceService = require('./services/space-service');

const RENDERER_DIR = path.join(__dirname, '..', 'renderer');
const PRELOAD_DIR = path.join(__dirname, '..', 'preload');

// 终端窗口「悬浮球」尺寸（设置 → 终端，宽高强制 1:1，默认 90px，见 §3.9-12）。
const BALL_SIZE_DEFAULT = Number(TERMINAL_WINDOW.ballSize) || 90;
const BALL_SIZE_MIN = 10;
const BALL_SIZE_MAX = 2048;

function ballSize() {
  const value = Number(settings.get('terminalBallSize'));
  if (!Number.isFinite(value)) return BALL_SIZE_DEFAULT;
  return Math.max(BALL_SIZE_MIN, Math.min(BALL_SIZE_MAX, Math.round(value)));
}

let mainWindow = null;
let settingsWindow = null;
// 设置 → 终端 → 字体：非模态子窗口（挂在设置窗口上）。
let fontPickerWindow = null;
// 置顶终端窗口可以有多个（每次点主面板终端按钮都新开一个，落在当前桌面）。
const terminalWindows = new Set();
let lastTerminalWindow = null;
let fileWindow = null;
let updateWindow = null;
let fileWindowTarget = '';
let fileWindowPath = '';
let fileWindowOwnerId = null;
let trayRef = null;
let blurSuppressed = false;
let pinnedPositioned = false;
let terminalGeometryTimer = null;
let suppressTerminalSizeSave = false;
let fileWindowGeometryTimer = null;

// 应用正在退出：此时「关闭即隐藏」不再生效，让窗口正常关闭。
// 否则终端窗口在 hide 模式下会用 preventDefault() 拦下 close，导致 app.quit() 被中止
//（表现：点托盘「退出」有时退不掉）。
let isQuitting = false;
app.on('before-quit', () => {
  isQuitting = true;
  // macOS：`closable: false` 的窗口会让 app.quit() 卡住（窗口永不被关闭）。
  // 退出时临时放开可关闭，保证更新窗口 / 托盘退出都能真正退掉。
  const win = updateWindow;
  if (win && !win.isDestroyed() && typeof win.setClosable === 'function') {
    win.setClosable(true);
  }
});

/* 每个终端窗口各自的拖动 / 对齐状态：will-resize 每帧触发，连续 350ms 没再收到即松手；
   拖动期间不改尺寸（避免打乱 macOS 拖拽跟踪），挂起的对齐请求松手后交渲染层重测。 */
const terminalSnapState = new WeakMap(); // win -> { resizingUntil, idleTimer, pending }

function snapStateFor(win) {
  let state = terminalSnapState.get(win);
  if (!state) {
    state = { resizingUntil: 0, idleTimer: null, pending: false };
    terminalSnapState.set(win, state);
  }
  return state;
}

function isTerminalWindow(win) {
  return Boolean(win) && terminalWindows.has(win) && !win.isDestroyed();
}

function isTerminalWebContents(id) {
  for (const win of terminalWindows) {
    if (!win.isDestroyed() && win.webContents.id === id) return true;
  }
  return false;
}

function terminalWindowsList() {
  return Array.from(terminalWindows).filter((win) => !win.isDestroyed());
}

function getTerminalWindowForWebContents(id) {
  for (const win of terminalWindows) {
    if (!win.isDestroyed() && win.webContents.id === id) return win;
  }
  return null;
}

/* 窗口底色：与 styles/constants.css 的 `--color-bg` 一致（浅 #ffffff / 深 #1c1c1e）。
   拖动 / 缩放期间页面来不及重绘时，OS 会先显示窗口底色 —— 不设就会露出系统默认白底
   （深色模式下尤其明显）。 */
function effectiveThemeIsDark() {
  const theme = settings.get('theme') || 'system';
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return nativeTheme.shouldUseDarkColors;
}

function themeBackgroundColor() {
  return effectiveThemeIsDark() ? '#1c1c1e' : '#ffffff';
}

function applyThemeBackgrounds() {
  const color = themeBackgroundColor();
  // 终端窗口是透明无边框（底色由渲染层 #term-shell 画），不设原生 backgroundColor。
  for (const win of [getSettingsWindow(), getFileWindow(), getUpdateWindow()]) {
    if (win && !win.isDestroyed()) win.setBackgroundColor(color);
  }
  // 窗口模式的主窗口：仅「无玻璃」时不透明，底色跟随主题（避免拖动露白）；玻璃开启时保持透明。
  if (isWindowMode() && glassMode() === 'off') {
    const mw = getMainWindow();
    if (mw && !mw.isDestroyed()) mw.setBackgroundColor(color);
  }
}

function applyTerminalSnap(win, size) {
  if (!isTerminalWindow(win) || win.isMaximized() || win.isFullScreen() || !size) return;
  if (isBallMode(win)) return; // 悬浮球动画期间不做整格对齐（否则会与缩放动画抢尺寸 → 抖动）
  const [width, height] = win.getContentSize();
  win.setContentSize(size.width || width, size.height || height);
}

/* 拖拽空闲（松手）后：无论期间有没有挂起的对齐请求，都请渲染层重新测量并对齐。
   渲染层借这个信号清除「拖动中」标记 —— 否则拖完若鼠标不再移动，永远收不到 mousemove，
   就再也不会对齐了（行数没变时尤其明显）。 */
function flushPendingTerminalSnap(win) {
  const state = snapStateFor(win);
  state.idleTimer = null;
  state.pending = false;
  if (isTerminalWindow(win)) win.webContents.send(IPC.TERMINAL_RECALIBRATE);
}

function markTerminalResizing(win) {
  if (isBallMode(win)) return; // 悬浮球动画期间的 setBounds 不算「拖动 / 调整尺寸」
  const state = snapStateFor(win);
  const first = Date.now() >= state.resizingUntil;
  state.resizingUntil = Date.now() + 160;
  if (state.idleTimer) clearTimeout(state.idleTimer);
  state.idleTimer = setTimeout(() => flushPendingTerminalSnap(win), 180);
  if (first && isTerminalWindow(win)) win.webContents.send(IPC.TERMINAL_DRAG_ACTIVE);
}

/* 渲染层按实测余量请求对齐尺寸（行 / 列都要刚好装下整格）：拖动中先挂起，
   松手后（或本来就空闲时）立即执行。 */
function requestTerminalSnap(win, payload) {
  if (!isTerminalWindow(win) || win.isMaximized() || win.isFullScreen()) return { ok: false };
  if (isBallMode(win)) return { ok: false }; // 悬浮球动画期间不整格对齐
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
  const state = snapStateFor(win);
  if (Date.now() < state.resizingUntil) {
    state.pending = true;
    return { ok: true, deferred: true, size };
  }
  applyTerminalSnap(win, size);
  return { ok: true, size };
}

/* 打开内嵌文件面板时把终端窗口「只放大不缩小」到至少给定的内容尺寸（受屏幕工作区限制）。
   用于保证文件管理有足够空间；不写回设置里的窗口大小（suppress），但窗口的新尺寸会照常记入几何记忆。 */
function ensureTerminalContentSize(win, wanted) {
  if (!isTerminalWindow(win) || win.isMaximized() || win.isFullScreen()) return { ok: false };
  const width = Math.round(Number(wanted && wanted.width)) || 0;
  const height = Math.round(Number(wanted && wanted.height)) || 0;
  const [currentWidth, currentHeight] = win.getContentSize();
  const targetWidth = Math.max(currentWidth, width);
  const targetHeight = Math.max(currentHeight, height);
  if (targetWidth === currentWidth && targetHeight === currentHeight) {
    return { ok: true, width: currentWidth, height: currentHeight };
  }
  let area = { width: targetWidth, height: targetHeight };
  try {
    area = screen.getDisplayMatching(win.getBounds()).workAreaSize;
  } catch (err) {
    /* ignore */
  }
  const nextWidth = Math.min(targetWidth, area.width);
  const nextHeight = Math.min(targetHeight, area.height);
  suppressTerminalSizeSave = true;
  win.setContentSize(nextWidth, nextHeight);
  setTimeout(() => {
    suppressTerminalSizeSave = false;
  }, 500);
  return { ok: true, width: nextWidth, height: nextHeight };
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
  suppressTerminalSizeSave = true;
  for (const win of terminalWindowsList()) {
    if (win.isMaximized() || win.isFullScreen()) continue;
    const [width, height] = win.getSize();
    if (width === size.width && height === size.height) continue;
    win.setSize(size.width, size.height);
  }
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

function saveTerminalWindowSize(win) {
  if (!isTerminalWindow(win) || suppressTerminalSizeSave || win.isMaximized() || win.isFullScreen()) return;
  const [width, height] = win.getSize();
  if (settings.get('terminalWindowWidth') === width && settings.get('terminalWindowHeight') === height) return;
  settings.set({ terminalWindowWidth: width, terminalWindowHeight: height });
}

/* 把窗口此刻的真实几何（位置 + 尺寸 + 所在屏幕）落盘；顺带把尺寸写回设置（既有行为）。
   落盘时读窗口当前值，而不是早先捕获的快照 —— 否则「刚拖动完又改了窗口大小」会被
   旧快照覆盖。 */
function saveTerminalGeometry(win) {
  if (!isTerminalWindow(win) || win.isMaximized() || win.isFullScreen()) return;
  // 悬浮球模式下的尺寸 / 位置不入记忆（否则会把球的大小记进 terminal-window.json）。
  if (win.__ballActive) return;
  // 设置写回自带 suppress 保护（避免程序化 setSize 触发回写循环），
  // 几何记忆不受影响：位置 / 尺寸总是记窗口此刻的真实值（多窗口共用一份记忆，最后动的那扇为准）。
  saveTerminalWindowSize(win);
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
function scheduleTerminalGeometrySave(win) {
  if (terminalGeometryTimer) clearTimeout(terminalGeometryTimer);
  terminalGeometryTimer = setTimeout(() => {
    terminalGeometryTimer = null;
    saveTerminalGeometry(win);
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

/* 是否同时存在多扇终端窗口（>1）。多窗口时：关闭一律销毁、快捷键失效。 */
function hasMultipleTerminals() {
  return terminalWindowsList().length > 1;
}

/* 单扇时是否走「隐藏」：设置 = hide 且只有这一扇终端窗口。多窗口一律销毁。 */
function shouldHideOnClose() {
  return terminalCloseAction() === 'hide' && !hasMultipleTerminals();
}

/* 关闭按钮 / Cmd-W：单扇按「关闭按钮行为」收缩成悬浮球或销毁；多扇一律销毁。 */
function closeTerminalWindow(target) {
  const win = isTerminalWindow(target) ? target : getTerminalWindow();
  if (!win) return null;
  clearBallTimer(win);
  if (shouldHideOnClose()) {
    // 「隐藏」行为 = 收缩到悬浮球（球关闭时才真正隐藏窗口）。
    shrinkTerminalToBall(win);
    return win;
  }
  destroyTerminalWindow(win);
  return null;
}

/* 强制销毁（会话结束 exit / iTerm 交接 / 关闭行为=destroy）：先落盘几何再 destroy，
   destroy 不触发 close 事件，因此不会被「隐藏」行为拦下。 */
function destroyTerminalWindow(target) {
  const win = isTerminalWindow(target) ? target : getTerminalWindow();
  if (!win) return;
  // 即将销毁：不要因失焦（如 iTerm 交接、会话结束）触发缩球。
  win.__suppressBall = true;
  clearBallTimer(win);
  if (win.__ballSettleTimer) {
    clearTimeout(win.__ballSettleTimer);
    win.__ballSettleTimer = null;
  }
  if (win.__boundsTimer) {
    clearTimeout(win.__boundsTimer);
    win.__boundsTimer = null;
  }
  saveTerminalGeometry(win);
  logTerminalSpace(win, 'close');
  win.destroy();
}

/* 全局快捷键（Steam 式开关）：
   - 同时存在多扇终端窗口 → 失效（不响应）。
   - 只有一扇 → 「悬浮球 ↔ 终端」互相切换：球态放大回窗口；窗口态收缩成球；都不在前台则拉回。
   - 悬浮球关闭时回退为「关闭按钮行为」（隐藏 / 销毁）。
   - 一扇都没有 → 新开一扇（窗口永不跨桌面移动）。 */
function toggleTerminalWindow() {
  const wins = terminalWindowsList();
  if (wins.length > 1) return null;
  const win = wins[0] || null;
  if (!win) return openTerminalWindow();
  // 悬浮球：按快捷键 = 放大回原窗口。
  if (win.__ballActive) {
    exitBallMode(win, true);
    return win;
  }
  if (win.isVisible() && win.isFocused()) {
    // 窗口态：收缩成悬浮球（悬浮球关闭时回退为隐藏 / 销毁）。
    if (terminalBallEnabled()) {
      maybeEnterBall(win);
      return win;
    }
    if (terminalCloseAction() === 'hide') {
      win.hide();
      return win;
    }
    destroyTerminalWindow(win);
    return null;
  }
  win.show();
  win.focus();
  return win;
}

/* --------------------------- 终端窗口「悬浮球」 ---------------------------
   失去焦点（延迟一段时间、期间焦点回来就取消）后把窗口缩小成 ballSize()
   的圆形无标题栏窗口（CSS 画圆形），点击 / 快捷键再放大回原样。
   - 窗口以 frame:false + transparent:true 创建，圆形由 CSS 固定尺寸呈现（不随窗口变形为椭圆）。
   - 球缩到**窗口右上角**；若用户没拖动过球，放大时**原样恢复**原窗口 bounds（多次缩放位置不变）。
   - 缩小 / 放大用 JS 逐帧插值动画（时长可控、ease-in-out，比系统 animate 更慢更顺）。
   - 期间不改动几何记忆（terminal-window.json）。
   - 拖动由渲染层指针事件触发，主进程按光标位置移动窗口（这样「点击 vs 拖动」可区分）。 */
let ballDragTimer = null;
// 球的缩放动画时长（渲染层 CSS transform 过渡，可控且流畅）。
const BALL_ANIM_MS = 420;

function terminalBallEnabled() {
  return settings.get('terminalBallEnabled') !== false;
}
function terminalBallDelayMs() {
  const value = Number(settings.get('terminalBallDelayMs'));
  return Number.isFinite(value) && value >= 0 ? value : 50;
}

function isBallMode(win) {
  return Boolean(win && !win.isDestroyed() && win.__ballActive);
}

/* 记录窗口此刻所在的 Space（打开 / 从球放大回来时）。读取失败保留旧值，并把 Promise 挂在窗口上，
   供缩球前的检测等待「打开时的那次读取」完成。 */
function rememberTerminalSpace(win) {
  if (!isTerminalWindow(win)) return Promise.resolve('');
  const token = (win.__spaceToken || 0) + 1;
  win.__spaceToken = token;
  const promise = spaceService.currentSpaces().then((signature) => {
    if (!signature || !isTerminalWindow(win) || win.__spaceToken !== token) return '';
    win.__spaceId = signature;
    return signature;
  }).catch(() => '');
  win.__spacePromise = promise;
  return promise;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* 当前 Space 是否已从记录值切走。**宁可保守，不确定就不缩球**：
   - 没有记录 / 读取失败 → 返回 { unknown: true }（调用方保持窗口原样）；
   - 第一次读到与记录一致后，延迟 SPACE_CONFIRM_DELAY_MS 再读一次做确认——Space 刚切换时
     `com.apple.spaces` 可能还返回旧值，只读一次会把「切走了」误判成「没切」；
   - 两次读到相同才返回 null（允许缩球）。 */
async function detectSpaceChange(win) {
  let from = win.__spaceId || '';
  if (!from && win.__spacePromise) {
    try {
      from = (await win.__spacePromise) || '';
    } catch (err) {
      from = '';
    }
  }
  if (!from) return { from: '', to: '', unknown: true };

  const first = await spaceService.currentSpaces();
  if (!first) return { from, to: '', unknown: true };
  logger.debug(`[space] shrink check (${win.id}) from=${from} first=${first}`);
  if (first !== from) return { from, to: first };

  await delay(SPACE_CONFIRM_DELAY_MS);
  if (!isTerminalWindow(win) || win.isDestroyed()) return { from, to: '', unknown: true };
  const second = await spaceService.currentSpaces();
  if (!second) return { from, to: '', unknown: true };
  logger.debug(`[space] shrink check (${win.id}) from=${from} first=${first} second=${second}`);
  if (second !== from) return { from, to: second };
  return null;
}

function logSpaceChange(win, change) {
  if (change.unknown) {
    logger.file(
      `[terminal] keep window: space unknown (${win.id}) from=${change.from || 'unknown'}`
    );
    return;
  }
  logger.file(
    `[terminal] keep window: space changed (${win.id}) from=${change.from || 'unknown'} to=${change.to || 'unknown'}`
  );
}

/* 把窗口此刻所在桌面写进日志：终端窗口打开 / 关闭 / 缩成悬浮球 / 从悬浮球展开时各记一次。 */
function logTerminalSpace(win, action) {
  if (!win) return;
  const id = win.id;
  spaceService.currentSpaces().then(
    (signature) => {
      logger.file(`[terminal] ${action} (${id}) space=${signature || 'unknown'}`);
    },
    () => {
      logger.file(`[terminal] ${action} (${id}) space=unknown`);
    }
  );
}

/* 准备缩球：若用户已切到别的 Space（切桌面也会让终端失焦），不缩球、保持终端窗口原样。 */
async function maybeEnterBall(win) {
  if (!isTerminalWindow(win) || win.isDestroyed()) return false;
  const change = await detectSpaceChange(win);
  if (change) {
    logSpaceChange(win, change);
    return false;
  }
  if (!isTerminalWindow(win) || win.isDestroyed()) return false;
  enterBallMode(win);
  return true;
}

/* 把终端窗口「收起来」：悬浮球开启时收缩成悬浮球，否则真正隐藏窗口。
   所有「隐藏终端」的路径（关闭按钮 / 快捷键 / Cmd-W）都走这里，统一成收缩到悬浮球。
   返回 Promise<boolean>：true = 已收成球 / 隐藏，false = 因切换了 Space（或窗口已失效）保持原样。 */
async function shrinkTerminalToBall(win) {
  if (!isTerminalWindow(win) || win.isDestroyed()) return false;
  if (terminalBallEnabled()) return maybeEnterBall(win);
  const change = await detectSpaceChange(win);
  if (change) {
    logSpaceChange(win, change);
    return false;
  }
  if (!isTerminalWindow(win) || win.isDestroyed()) return false;
  win.hide();
  logTerminalSpace(win, 'hide');
  return true;
}

function clearBallTimer(win) {
  if (win && win.__ballTimer) {
    clearTimeout(win.__ballTimer);
    win.__ballTimer = null;
  }
}
function clearBallSettleTimer(win) {
  if (win && win.__ballSettleTimer) {
    clearTimeout(win.__ballSettleTimer);
    win.__ballSettleTimer = null;
  }
}
function clearBoundsTimer(win) {
  if (win && win.__boundsTimer) {
    clearTimeout(win.__boundsTimer);
    win.__boundsTimer = null;
  }
}

function clampToWorkArea(bounds) {
  const area = screen.getDisplayMatching(bounds).workArea;
  const x = Math.min(Math.max(bounds.x, area.x), area.x + area.width - bounds.width);
  const y = Math.min(Math.max(bounds.y, area.y), area.y + area.height - bounds.height);
  return { x: Math.round(x), y: Math.round(y), width: bounds.width, height: bounds.height };
}

/* 球 = 窗口**右上角**的 size×size 方块。缩放动画由**渲染层 CSS transform**完成（`transform-origin: top right`），
   窗口尺寸只在动画首 / 尾各改一次，因此右上角严格不变、不会左右弹跳（原生窗口动画做不到精确锚点）。 */
function ballBoundsFor(orig, size) {
  return clampToWorkArea({ x: orig.x + orig.width - size, y: orig.y, width: size, height: size });
}

function enterBallMode(win) {
  if (!isTerminalWindow(win) || win.__ballActive || win.__exitingBall || win.isDestroyed()) return;
  const size = ballSize();
  win.__ballActive = true;
  win.__ballOrig = win.getBounds();
  win.__ballMoved = false;
  win.__ballBounds = ballBoundsFor(win.__ballOrig, size);
  // 注意：**不要**在这里调用 setVisibleOnAllWorkspaces / setAlwaysOnTop —— 变球是在「用户已切到
  // 别的桌面」之后（blur 延迟）触发的，此刻再动这些会把窗口重新分配到「当前活动桌面」，
  // 于是球会跟着切换桌面。桌面归属已在窗口获得焦点时用「true→false」固定，这里保持不动；
  // 窗口尺寸也只在动画尾（settle）改一次，减少中途对窗口的改动。
  // 窗口保持原尺寸，渲染层用 CSS 把终端从 1 缩到球大小（transform，GPU、不跳）。
  const scaleX = size / win.__ballOrig.width;
  const scaleY = size / win.__ballOrig.height;
  win.webContents.send(IPC.TERMINAL_BALL, { active: true, size, phase: 'enter', duration: BALL_ANIM_MS, scaleX, scaleY });
  // 提前切到球（终端缩到接近球大小时就隐藏，避免尾段那一下卡顿）。
  clearBallSettleTimer(win);
  win.__ballSettleTimer = setTimeout(() => {
    win.__ballSettleTimer = null;
    if (win.isDestroyed() || !win.__ballActive) return;
    win.setMinimumSize(size, size);
    win.setBounds(win.__ballBounds, false);
    if (typeof win.setResizable === 'function') win.setResizable(false);
    win.webContents.send(IPC.TERMINAL_BALL, { active: true, size, phase: 'settle' });
  }, Math.round(BALL_ANIM_MS * 0.6));
  logger.file(`[terminal] entered ball mode (${win.id}) size=${size}`);
  logTerminalSpace(win, 'ball');
}

function exitBallMode(win, focus) {
  if (!isTerminalWindow(win) || !win.__ballActive || win.__exitingBall || win.isDestroyed()) return;
  win.__exitingBall = true;
  clearBallSettleTimer(win);
  const orig = win.__ballOrig || win.getBounds();
  const size = ballSize();
  // 没拖动过球 → 原样恢复；拖动过 → 以球的位置为右上角展开回原尺寸（夹回工作区）。
  const current = win.getBounds();
  const restore = win.__ballMoved
    ? clampToWorkArea({ x: current.x + size - orig.width, y: current.y, width: orig.width, height: orig.height })
    : orig;
  // 窗口一次性还原到原尺寸（此刻只显示球，右上角不变，看不到跳变），渲染层再用 CSS 把终端从球大小放大。
  win.setBounds(restore, false);
  const scaleX = size / restore.width;
  const scaleY = size / restore.height;
  win.webContents.send(IPC.TERMINAL_BALL, { active: false, size, phase: 'grow', duration: BALL_ANIM_MS, scaleX, scaleY });
  clearBoundsTimer(win);
  win.__boundsTimer = setTimeout(() => {
    win.__boundsTimer = null;
    if (win.isDestroyed()) return;
    win.__ballActive = false;
    win.__ballBounds = null;
    win.__ballOrig = null;
    win.__exitingBall = false;
    if (typeof win.setResizable === 'function') win.setResizable(true);
    win.setMinimumSize(TERMINAL_WINDOW.minWidth, TERMINAL_WINDOW.minHeight);
    if (terminalAlwaysOnTop()) win.setAlwaysOnTop(true, 'screen-saver');
    else win.setAlwaysOnTop(false);
    win.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true, skipTransformProcessType: true });
    win.webContents.send(IPC.TERMINAL_BALL, { active: false, size, phase: 'settle' });
    saveTerminalGeometry(win);
    if (focus !== false) win.focus();
    rememberTerminalSpace(win);
    logger.file(`[terminal] exited ball mode (${win.id})`);
    logTerminalSpace(win, 'expand');
  }, BALL_ANIM_MS);
}

function startBallDrag(win, x, y) {
  if (!isTerminalWindow(win) || !win.__ballActive || win.__exitingBall) return;
  win.__ballMoved = true;
  const b = win.getBounds();
  const offX = Number(x) - b.x;
  const offY = Number(y) - b.y;
  stopBallDrag();
  ballDragTimer = setInterval(() => {
    if (win.isDestroyed() || !win.__ballActive) {
      stopBallDrag();
      return;
    }
    const pt = screen.getCursorScreenPoint();
    win.setPosition(Math.round(pt.x - offX), Math.round(pt.y - offY), false);
  }, 16);
}

function stopBallDrag() {
  if (ballDragTimer) {
    clearInterval(ballDragTimer);
    ballDragTimer = null;
  }
}

/* 终端窗口的置顶开关（头部图钉按钮 / settings.json 的 terminalAlwaysOnTop）。 */
function terminalAlwaysOnTop() {
  return settings.get('terminalAlwaysOnTop') !== false;
}

function applyTerminalAlwaysOnTop() {
  const on = terminalAlwaysOnTop();
  for (const win of terminalWindowsList()) {
    if (on) win.setAlwaysOnTop(true, 'screen-saver');
    else win.setAlwaysOnTop(false);
  }
  return on;
}

function getFocusedTerminalWindow() {
  for (const win of terminalWindows) {
    if (!win.isDestroyed() && win.isFocused()) return win;
  }
  return null;
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

/* ------------------------------- 主窗口模式 -------------------------------
   悬浮模式（settings.floatMode = true）：托盘下方的无边框透明弹出面板（原行为）。
   窗口模式（默认，floatMode = false）：当前桌面中央的标准窗口，普通层级、不跨桌面，
   位置 / 尺寸记入 main-window.json，下次还原；关闭按钮 = 隐藏（应用常驻托盘）。 */
function isFloatMode() {
  return settings.get('floatMode') === true;
}

function isWindowMode() {
  return !isFloatMode();
}

// 窗口模式固定 640×480（不可缩放）。
function mainWindowSize() {
  return { width: MAIN_WINDOW.width, height: MAIN_WINDOW.height };
}

// 只持久化位置：{ x, y }（兼容旧版 { bounds: { x, y, width, height } }）。
let mainWindowState = readJson(MAIN_WINDOW_FILE, null);
let mainWindowGeometryTimer = null;

function savedMainWindowPosition() {
  if (!mainWindowState || typeof mainWindowState !== 'object') return null;
  const source =
    mainWindowState.bounds && typeof mainWindowState.bounds === 'object'
      ? mainWindowState.bounds
      : mainWindowState;
  const x = Number(source.x);
  const y = Number(source.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.trunc(x), y: Math.trunc(y) };
}

/* 只应用位置；屏幕 / 桌面不记忆 —— 在当前鼠标所在屏幕的工作区内夹取，
   显示时再通过「先加入所有桌面、后固定当前桌面」避免被拉回旧桌面。 */
function mainWindowBoundsForOpen() {
  const size = mainWindowSize();
  const position = savedMainWindowPosition();
  return clampBounds(position, anchorDisplay(), size, size);
}

function saveMainWindowPosition() {
  if (!isWindowMode()) return;
  const win = getMainWindow();
  if (!win || win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
  const b = win.getBounds();
  const next = { x: b.x, y: b.y };
  if (JSON.stringify(next) === JSON.stringify(mainWindowState)) return;
  mainWindowState = next;
  writeJson(MAIN_WINDOW_FILE, mainWindowState);
}

function scheduleMainWindowPositionSave() {
  if (mainWindowGeometryTimer) clearTimeout(mainWindowGeometryTimer);
  mainWindowGeometryTimer = setTimeout(() => {
    mainWindowGeometryTimer = null;
    saveMainWindowPosition();
  }, 400);
}

function forgetMainWindowGeometry() {
  mainWindowState = null;
  if (mainWindowGeometryTimer) {
    clearTimeout(mainWindowGeometryTimer);
    mainWindowGeometryTimer = null;
  }
  try {
    fs.rmSync(MAIN_WINDOW_FILE, { force: true });
  } catch (err) {
    /* ignore */
  }
}

/* 拖动窗口时，窗口中心与屏幕（工作区）的**垂直中线**（x 方向）对齐就轻微「卡」一下
   （磁性吸附，带滞回）：进入阈值内吸附到正中、拖动超过释放阈值才脱开。
   用于终端窗口与窗口模式的主窗口，仅改 x 坐标（不动尺寸、也不要求上下居中），
   左右拖动时即可感知。 */
const xCenterSnapped = new WeakMap();

function maybeSnapHorizontalCenter(win) {
  if (!win || win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
  if (win.__ballActive) return; // 终端悬浮球模式：不参与
  const bounds = win.getBounds();
  let area;
  try {
    area = screen.getDisplayMatching(bounds).workArea;
  } catch (err) {
    return;
  }
  const centeredX = Math.round(area.x + (area.width - bounds.width) / 2);
  const diff = bounds.x + bounds.width / 2 - (area.x + area.width / 2);
  const abs = Math.abs(diff);
  const snapped = xCenterSnapped.get(win) === true;

  if (snapped) {
    if (abs > CENTER_SNAP.xRelease) {
      xCenterSnapped.set(win, false);
      return;
    }
    if (bounds.x !== centeredX) win.setPosition(centeredX, bounds.y, false);
    return;
  }
  if (abs <= CENTER_SNAP.xThreshold && bounds.x !== centeredX) {
    xCenterSnapped.set(win, true);
    win.setPosition(centeredX, bounds.y, false);
  }
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  return isFloatMode() ? createFloatWindow() : createWindowWindow();
}

/* 悬浮模式：托盘下方的无边框透明面板。 */
function createFloatWindow() {
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
  // 页面缩放固定为 1（Electron 会按 origin 记住缩放，历史缩放会让布局 / 尺寸计算错位）。
  mainWindow.webContents.setZoomFactor(1);
  mainWindow.webContents.on('did-finish-load', () => {
    try {
      mainWindow.webContents.setZoomFactor(1);
    } catch (err) {
      /* ignore */
    }
  });

  if (mode === 'liquid') {
    const win = mainWindow;
    win.webContents.once('did-finish-load', () => applyLiquidGlass(win));
  }

  mainWindow.on('blur', () => {
    if (blurSuppressed) return;
    if (settings.get('pinWindow')) return;
    // 打开设置窗口时主面板已先隐藏；若两者同时打开，失焦（包括焦点转到设置窗口）也照常隐藏。
    hideMainWindow();
  });

  mainWindow.on('closed', function onClosed() {
    if (mainWindow === this) mainWindow = null;
  });

  return mainWindow;
}

/* 窗口模式：当前桌面中央的标准窗口（hiddenInset 标题栏 + 系统红绿灯）。 */
function createWindowWindow() {
  const bounds = mainWindowBoundsForOpen();
  // Liquid Glass / 毛玻璃在窗口模式同样生效（与悬浮模式一致）。
  const glass = glassMode();
  logger.file(`[window-mode] create main window glass=${glass}`);
  const glassOptions =
    glass === 'vibrancy' ? { vibrancy: VIBRANCY.type, visualEffectState: VIBRANCY.state } : {};
  mainWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    title: 'Vessel',
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 16 },
    // 固定 640×480：不可缩放 / 最大化，但可拖动位置。
    resizable: false,
    movable: true,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    // 普通标准窗口层级：不常驻置顶（置顶只属于悬浮模式与终端 / 文件窗口）。
    // 仍固定在自己的桌面，切换桌面时不跟随。
    alwaysOnTop: false,
    // 玻璃开启时窗口透明（vibrancy 材质 / 原生玻璃视图透出），否则用主题底色。
    // 注意：窗口模式是**标准窗口**，必须保留系统圆角（`roundedCorners` 默认 true）——
    // 之前设成 false 会让 macOS 连标题栏 / 红绿灯一起去掉。
    transparent: glass !== 'off',
    ...glassOptions,
    backgroundColor: glass !== 'off' ? '#00000000' : themeBackgroundColor(),
    webPreferences: {
      preload: path.join(PRELOAD_DIR, 'main-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  // 普通窗口层级（不置顶）；先按单桌面窗口创建，显示时再「临时加入所有桌面 →
  // 绑定当前桌面」，避免被拉回旧 Space。
  mainWindow.setAlwaysOnTop(false);
  mainWindow.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true, skipTransformProcessType: true });
  mainWindow.loadFile(path.join(RENDERER_DIR, 'index.html'));
  mainWindow.webContents.setZoomFactor(1);
  mainWindow.webContents.on('did-finish-load', () => {
    try {
      mainWindow.webContents.setZoomFactor(1);
    } catch (err) {
      /* ignore */
    }
  });
  if (glass === 'liquid') {
    const win = mainWindow;
    win.webContents.once('did-finish-load', () => applyLiquidGlass(win));
  }
  mainWindow.on('move', () => {
    maybeSnapHorizontalCenter(mainWindow);
    scheduleMainWindowPositionSave();
  });
  // 关闭按钮 = 隐藏（应用常驻托盘）；退出应用时才真正关闭。
  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    saveMainWindowPosition();
    mainWindow.hide();
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
  if (isWindowMode()) {
    const win = getMainWindow() || createMainWindow();
    if (win.isMinimized && win.isMinimized()) win.restore();
    // 显示前先临时加入所有桌面，让窗口能在当前 Space 直接浮出；show / focus 后
    // 立刻绑定回当前桌面。之后切换桌面时窗口留在原桌面；再次从其它桌面打开
    // （隐藏状态）时又会先展开到当前桌面，因此不会被拉回旧桌面。
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    // 每次都放到当前鼠标所在屏幕（沿用保存的位置并夹回工作区；无记录则居中）。
    win.setBounds(mainWindowBoundsForOpen(), false);
    win.setAlwaysOnTop(false);
    win.show();
    win.focus();
    // 不用 app.focus({ steal: true })：它会激活应用并可能把系统切回窗口原来的 Space。
    if (typeof win.moveTop === 'function') win.moveTop();
    // 等窗口真正在当前 Space 上显示后再撤销「所有桌面」，把它绑定到当前桌面。
    setTimeout(() => {
      if (win.isDestroyed()) return;
      win.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true, skipTransformProcessType: true });
    }, 60);
    return;
  }
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

// 切换「悬浮模式 / 窗口模式」：窗口创建项不同，需销毁重建（此时主窗口通常已隐藏）。
function rebuildMainWindowForMode() {
  const win = getMainWindow();
  if (win) win.destroy();
  mainWindow = null;
  pinnedPositioned = false;
  createMainWindow();
}

// Applies the pin (keep-on-top) behavior: when pinned the popover can be moved
// and keeps its position; when unpinned it hides and resets to the tray anchor.
// 仅悬浮模式有效。
function applyPin(pinned) {
  if (isWindowMode()) return;
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
// 悬浮模式与窗口模式都支持：切换时销毁重建窗口（此时通常已隐藏）。
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
  if (isWindowMode()) {
    // 窗口模式：始终「显示 / 带到前台」（再次点击切到它所在的桌面），不做隐藏切换。
    showMainWindow();
    return;
  }
  const win = getMainWindow() || createMainWindow();
  if (win.isVisible()) {
    hideMainWindow();
  } else {
    showMainWindow();
  }
}

function openSettingsWindow(section, editSshAlias) {
  const targetSection = editSshAlias ? 'ssh' : section;
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    if (targetSection) settingsWindow.webContents.send(IPC.SETTINGS_OPEN_SECTION, targetSection);
    if (editSshAlias) {
      const sendEdit = () => {
        if (settingsWindow && !settingsWindow.isDestroyed()) {
          settingsWindow.webContents.send(IPC.SETTINGS_EDIT_SSH, { alias: editSshAlias });
        }
      };
      setTimeout(sendEdit, 80);
      setTimeout(sendEdit, 400);
    }
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    width: SETTINGS_WINDOW.width,
    height: SETTINGS_WINDOW.height,
    minWidth: 560,
    minHeight: 420,
    title: 'Vessel',
    show: false,
    resizable: true,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 16 },
    backgroundColor: themeBackgroundColor(),
    webPreferences: {
      preload: path.join(PRELOAD_DIR, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  settingsWindow.loadFile(path.join(RENDERER_DIR, 'settings.html'));
  settingsWindow.webContents.setZoomFactor(1);
  settingsWindow.webContents.on('did-finish-load', () => {
    try {
      settingsWindow.webContents.setZoomFactor(1);
    } catch (err) {
      /* ignore */
    }
  });
  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
    settingsWindow.focus();
    if (targetSection) settingsWindow.webContents.send(IPC.SETTINGS_OPEN_SECTION, targetSection);
    if (editSshAlias) {
      const sendEdit = () => {
        if (settingsWindow && !settingsWindow.isDestroyed()) {
          settingsWindow.webContents.send(IPC.SETTINGS_EDIT_SSH, { alias: editSshAlias });
        }
      };
      setTimeout(sendEdit, 400);
      setTimeout(sendEdit, 900);
    }
  });
  settingsWindow.on('closed', () => {
    settingsWindow = null;
    closeFontPickerWindow();
  });

  return settingsWindow;
}

/* 设置 → 终端 → 字体：非模态子窗口。挂在设置窗口上，不阻塞设置窗口操作。 */
function openFontPickerWindow() {
  if (fontPickerWindow && !fontPickerWindow.isDestroyed()) {
    fontPickerWindow.show();
    fontPickerWindow.focus();
    return fontPickerWindow;
  }

  fontPickerWindow = new BrowserWindow({
    width: 480,
    height: 620,
    minWidth: 380,
    minHeight: 420,
    parent: settingsWindow && !settingsWindow.isDestroyed() ? settingsWindow : undefined,
    modal: false,
    show: false,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Vessel',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 16 },
    backgroundColor: themeBackgroundColor(),
    webPreferences: {
      preload: path.join(PRELOAD_DIR, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  fontPickerWindow.loadFile(path.join(RENDERER_DIR, 'font-picker.html'));
  fontPickerWindow.webContents.setZoomFactor(1);
  fontPickerWindow.webContents.on('did-finish-load', () => {
    try {
      fontPickerWindow.webContents.setZoomFactor(1);
    } catch (err) {
      /* ignore */
    }
  });
  fontPickerWindow.once('ready-to-show', () => {
    fontPickerWindow.show();
    fontPickerWindow.focus();
  });
  fontPickerWindow.on('closed', () => {
    fontPickerWindow = null;
  });

  return fontPickerWindow;
}

function closeFontPickerWindow() {
  if (fontPickerWindow && !fontPickerWindow.isDestroyed()) fontPickerWindow.close();
}

function getFontPickerWindow() {
  return fontPickerWindow && !fontPickerWindow.isDestroyed() ? fontPickerWindow : null;
}

/* Always-on-top terminal: floats above other apps and above full-screen spaces
   (Steam-overlay style). 每次调用都新开一扇窗口，落在当前桌面 / 鼠标所在屏幕；
   窗口一旦打开就留在那个桌面，不会被拉去别的桌面（Steam 式独立窗口）。 */
function openTerminalWindow() {
  // 有同屏记忆就用记忆里的屏幕 / 位置 / 尺寸，否则默认尺寸居中（见 terminalBoundsForOpen）。
  const bounds = terminalBoundsForOpen();
  // 已有多扇时逐扇偏移一段，避免完全盖在一起（并夹回该屏幕工作区）。
  const openCount = terminalWindowsList().length;
  if (openCount > 0) {
    const display = screen.getDisplayMatching({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    });
    const area = display.workArea;
    const offset = openCount * 26;
    bounds.x = Math.min(Math.max(area.x, bounds.x + offset), area.x + area.width - bounds.width);
    bounds.y = Math.min(Math.max(area.y, bounds.y + offset), area.y + area.height - bounds.height);
  }
  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: TERMINAL_WINDOW.minWidth,
    minHeight: TERMINAL_WINDOW.minHeight,
    title: 'Vessel Terminal',
    // 无边框 + 透明：让窗口在「悬浮球」模式下能呈现圆形（圆角 / 圆形由 CSS 画，见 §3.9-12）。
    frame: false,
    transparent: true,
    hasShadow: false,
    // 圆角由 #term-shell 的 CSS 绘制；关掉系统圆角，否则系统会把窗口内容（含 CSS 边框）在四角裁掉一段。
    roundedCorners: false,
    // macOS：让「悬浮球」在其它应用（含全屏应用）之上时，**第一次点击**就直接落到窗口内容，
    // 而不是先激活应用、需要点两次才能展开。
    acceptFirstMouse: true,
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
  terminalWindows.add(win);
  lastTerminalWindow = win;
  // 创建时（页面还没加载完、窗口尚未 show）就读取并记录所在 Space：读取值代表「打开时」的桌面，
  // 避免 ready-to-show / focus 时用户已切换桌面，把切换后的桌面误记成原桌面。
  rememberTerminalSpace(win);
  const ownerId = win.webContents.id;

  // Pinching / Cmd+wheel must not scale the page (title bar + icons); the terminal
  // font is zoomed instead (see menu.js and the renderer's terminal:zoom handler).
  // 页面缩放固定为 1：否则 renderer 的 CSS px 与窗口内容尺寸（DIP）不再相等，
  // 整格对齐（按 innerWidth/Height 计算）会算错。Electron 会按 origin 记住缩放，
  // 这里每次加载都强制归 1。
  win.webContents.setVisualZoomLevelLimits(1, 1);
  win.webContents.setZoomFactor(1);
  win.webContents.on('did-finish-load', () => {
    try {
      win.webContents.setZoomFactor(1);
    } catch (err) {
      /* ignore */
    }
  });
  win.webContents.on('zoom-changed', (event, zoomDirection) => {
    if (typeof event.preventDefault === 'function') event.preventDefault();
    win.webContents.setZoomLevel(0);
    win.webContents.send(IPC.TERMINAL_ZOOM, zoomDirection === 'in' ? 'in' : 'out');
  });
  if (terminalAlwaysOnTop()) win.setAlwaysOnTop(true, 'screen-saver');
  else win.setAlwaysOnTop(false);
  // Steam-like: pinned on top + may float above a full-screen app, but must NOT join
  // every space — it stays on the desktop it was opened on.
  win.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true, skipTransformProcessType: true });
  win.loadFile(path.join(RENDERER_DIR, 'terminal.html'));
  win.on('focus', () => {
    win.__everFocused = true;
    lastTerminalWindow = win;
    clearBallTimer(win); // 延迟内焦点回来 → 取消缩球
    win.webContents.send(IPC.TERMINAL_FOCUS_INPUT);
    // 窗口此刻就在活动桌面上 → 用「先 true 再 false」把它**明确绑定到本桌面**
    // （只置 false 有时仍是 MoveToActiveSpace 行为，切桌面时会被拉到新桌面；先 true 再 false
    // 会重置为默认的「固定在本桌面」）。之后变球时不再动它，避免球跟着切换桌面。
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    win.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true, skipTransformProcessType: true });
    // 注意：**不要**在这里重新记录 Space。切桌面时窗口可能被系统短暂带到新桌面并重新获得焦点，
    // 若在 focus 时覆盖记录，检测就会把「已切走」误判成「没切」→ 仍然缩球。
    // 记录只取窗口创建时那一次（见 openTerminalWindow 中的 rememberTerminalSpace 调用）。
  });
  // 失去焦点 → 延迟后缩成圆形悬浮球（延时内焦点回来则取消；DevTools 打开 / iTerm 交接时不动）。
  win.on('blur', () => {
    if (isQuitting || win.__ballActive || win.__exitingBall || !win.__everFocused) return;
    if (win.__suppressBall || win.__ballPin || !win.isVisible()) return;
    if (!terminalBallEnabled()) return;
    if (win.webContents.isDevToolsOpened && win.webContents.isDevToolsOpened()) return;
    lastTerminalWindow = win;
    clearBallTimer(win);
    win.__ballTimer = setTimeout(() => {
      win.__ballTimer = null;
      if (win.isDestroyed() || win.isFocused() || win.__suppressBall) return;
      // 切 Space 也会触发 blur：若当前 Space 已变，保持终端窗口原样，不缩成球。
      shrinkTerminalToBall(win);
    }, terminalBallDelayMs());
  });
  win.on('resize', () => scheduleTerminalGeometrySave(win));
  win.on('move', () => {
    maybeSnapHorizontalCenter(win);
    scheduleTerminalGeometrySave(win);
  });
  // 只用来标记「正在拖动」：不拦截、不改尺寸，松手后再执行挂起的对齐请求
  win.on('will-resize', () => markTerminalResizing(win));
  // 实际生效的几何（恢复时可能被夹取过）也记下来，保证记忆与窗口一致。
  scheduleTerminalGeometrySave(win);
  win.once('ready-to-show', () => {
    // Space 已在窗口创建时记录（见 rememberTerminalSpace 调用处），这里只记录打开事件。
    logTerminalSpace(win, 'open');
    win.show();
    win.focus();
    win.webContents.send(IPC.TERMINAL_FOCUS_INPUT);
  });
  // 关闭按钮 / Cmd-W：按「关闭按钮行为」隐藏或销毁；隐藏时窗口还活着（会话保留），
  // 会话结束（exit）与 iTerm 交接走 destroyTerminalWindow()，不受这里拦截。
  win.on('close', (event) => {
    // 退出应用时不再拦截，保证 app.quit() 能真正关掉窗口。
    // 关闭按钮行为 = 隐藏时：改为缩成悬浮球（球关闭时才真正隐藏）；否则销毁（不拦）。
    if (!isQuitting && terminalCloseAction() === 'hide') {
      event.preventDefault();
      clearBallTimer(win);
      shrinkTerminalToBall(win);
      return;
    }
    saveTerminalGeometry(win);
  });
  win.on('closed', () => {
    // 窗口销毁 = 会话结束：该窗口的 SFTP 连接一并关闭（延迟 require 避免依赖环）。
    require('./services/sftp-service').closeForOwner(ownerId);
    terminalWindows.delete(win);
    if (lastTerminalWindow === win) lastTerminalWindow = null;
    if (ballDragTimer) stopBallDrag();
  });
  return win;
}

function getTerminalWindow() {
  if (isTerminalWindow(lastTerminalWindow)) return lastTerminalWindow;
  for (const win of terminalWindows) {
    if (!win.isDestroyed()) return win;
  }
  return null;
}

/* ------------------------------- 独立文件窗口 -------------------------------
   与终端窗口同为悬浮 panel：置顶、可浮在全屏之上但不跟随桌面切换。只放文件
   管理（无终端），连接独立于终端窗口（不随 ssh 关闭而关闭）。 */

let fileWindowState = readJson(FILE_WINDOW_FILE, null);

function fileWindowSize() {
  return {
    width: clampNumber(FILE_WINDOW.width, FILE_WINDOW.minWidth, 10000, 900),
    height: clampNumber(FILE_WINDOW.height, FILE_WINDOW.minHeight, 10000, 600),
  };
}

function fileWindowBoundsForOpen() {
  const size = fileWindowSize();
  const saved = fileWindowState && fileWindowState.bounds ? fileWindowState : null;
  const min = { width: FILE_WINDOW.minWidth, height: FILE_WINDOW.minHeight };
  const matched = saved ? displayBySignature(screen.getAllDisplays(), saved.display) : null;
  if (matched) return clampBounds(saved.bounds, matched, size, min);
  return clampBounds(null, anchorDisplay(), size, min);
}

function saveFileWindowGeometry() {
  const win = getFileWindow();
  if (!win || win.isMaximized() || win.isFullScreen()) return;
  const bounds = win.getBounds();
  const next = {
    display: displaySignature(screen.getDisplayMatching(bounds)),
    bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
  };
  if (!next.display) return;
  if (JSON.stringify(next) === JSON.stringify(fileWindowState)) return;
  fileWindowState = next;
  writeJson(FILE_WINDOW_FILE, fileWindowState);
}

function scheduleFileWindowGeometrySave() {
  if (fileWindowGeometryTimer) clearTimeout(fileWindowGeometryTimer);
  fileWindowGeometryTimer = setTimeout(() => {
    fileWindowGeometryTimer = null;
    saveFileWindowGeometry();
  }, 400);
}

function fileWindowAlwaysOnTop() {
  return settings.get('fileWindowAlwaysOnTop') !== false;
}

function applyFileWindowAlwaysOnTop() {
  const win = getFileWindow();
  if (!win) return fileWindowAlwaysOnTop();
  if (fileWindowAlwaysOnTop()) win.setAlwaysOnTop(true, 'screen-saver');
  else win.setAlwaysOnTop(false);
  return fileWindowAlwaysOnTop();
}

function getFileWindow() {
  if (!fileWindow || fileWindow.isDestroyed()) return null;
  return fileWindow;
}

function getFileWindowTarget() {
  return fileWindowTarget;
}

function getFileWindowPath() {
  return fileWindowPath;
}

function openFileWindow(target, pathArg) {
  if (target != null) {
    fileWindowTarget = String(target || '');
    // 切换目标时同步重置「初始目录」：显式传入则用它，否则回到家目录。
    fileWindowPath = pathArg != null ? String(pathArg || '') : '';
  }
  if (fileWindow && !fileWindow.isDestroyed()) {
    fileWindow.show();
    fileWindow.focus();
    if (target != null) {
      fileWindow.webContents.send(IPC.FILE_WINDOW_TARGET, { target: fileWindowTarget, path: fileWindowPath });
    }
    return fileWindow;
  }

  const bounds = fileWindowBoundsForOpen();
  fileWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: FILE_WINDOW.minWidth,
    minHeight: FILE_WINDOW.minHeight,
    title: 'Vessel Files',
    titleBarStyle: 'default',
    backgroundColor: themeBackgroundColor(),
    show: false,
    resizable: true,
    minimizable: true,
    maximizable: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(PRELOAD_DIR, 'main-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });
  fileWindowOwnerId = fileWindow.webContents.id;
  fileWindow.webContents.setVisualZoomLevelLimits(1, 1);
  fileWindow.webContents.setZoomFactor(1);
  fileWindow.webContents.on('did-finish-load', () => {
    try {
      fileWindow.webContents.setZoomFactor(1);
    } catch (err) {
      /* ignore */
    }
  });
  fileWindow.webContents.on('zoom-changed', (event) => {
    if (typeof event.preventDefault === 'function') event.preventDefault();
    fileWindow.webContents.setZoomLevel(0);
  });
  applyFileWindowAlwaysOnTop();
  fileWindow.loadFile(path.join(RENDERER_DIR, 'file-window.html'));
  fileWindow.on('resize', scheduleFileWindowGeometrySave);
  fileWindow.on('move', scheduleFileWindowGeometrySave);
  scheduleFileWindowGeometrySave();
  fileWindow.once('ready-to-show', () => {
    fileWindow.show();
    fileWindow.focus();
  });
  fileWindow.on('close', () => saveFileWindowGeometry());
  fileWindow.on('closed', () => {
    require('./services/sftp-service').closeForOwner(fileWindowOwnerId);
    fileWindowOwnerId = null;
    fileWindow = null;
    if (fileWindowGeometryTimer) {
      clearTimeout(fileWindowGeometryTimer);
      fileWindowGeometryTimer = null;
    }
  });
  return fileWindow;
}

function isFileWindow(win) {
  return Boolean(win) && win === fileWindow && !win.isDestroyed();
}

/* 独立文件窗口：按渲染层实测余量把内容高度收到「文件行整数倍」相应的高度。 */
function snapFileWindowContentSize(win, height) {
  if (!isFileWindow(win) || win.isMaximized() || win.isFullScreen()) return { ok: false };
  const target = Math.round(Number(height));
  if (!Number.isFinite(target) || target <= 0) return { ok: false };
  const [width, current] = win.getContentSize();
  if (target === current) return { ok: true, height: current };
  let areaHeight = target;
  try {
    areaHeight = screen.getDisplayMatching(win.getBounds()).workAreaSize.height;
  } catch (err) {
    /* ignore */
  }
  const next = Math.max(FILE_WINDOW.minHeight, Math.min(target, areaHeight));
  win.setContentSize(width, next);
  return { ok: true, height: next };
}

function closeFileWindow() {
  const win = getFileWindow();
  if (!win) return null;
  saveFileWindowGeometry();
  win.destroy();
  return null;
}

function forgetFileWindowGeometry() {
  fileWindowState = null;
  if (fileWindowGeometryTimer) {
    clearTimeout(fileWindowGeometryTimer);
    fileWindowGeometryTimer = null;
  }
  try {
    fs.rmSync(FILE_WINDOW_FILE, { force: true });
  } catch (err) {
    logger.warn('remove file-window.json failed:', err.message);
  }
}

function closeSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
}

function getSettingsWindow() {
  if (!settingsWindow || settingsWindow.isDestroyed()) return null;
  return settingsWindow;
}

/* ----------------------------- 更新下载窗口 -----------------------------
   自动更新的下载阶段显示的小型前台窗口：无边框、不可关闭（无关闭按钮、Cmd-W 亦无效）、
   置顶居中；只有进度条、取消、「重启并更新」按钮。取消 / 重启由 updater-service 处理。 */
function getUpdateWindow() {
  if (!updateWindow || updateWindow.isDestroyed()) return null;
  return updateWindow;
}

function isUpdateWindow(win) {
  return Boolean(win) && win === updateWindow && !win.isDestroyed();
}

function openUpdateWindow() {
  // 菜单栏 Agent（隐藏 Dock）需要显式抢焦，窗口才会到前台。
  if (process.platform === 'darwin' && typeof app.focus === 'function') {
    try {
      app.focus({ steal: true });
    } catch (err) {
      /* ignore */
    }
  }
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.show();
    updateWindow.focus();
    return updateWindow;
  }

  updateWindow = new BrowserWindow({
    width: UPDATE_WINDOW.width,
    height: UPDATE_WINDOW.height,
    show: false,
    // 真正的系统红绿灯（hiddenInset）：与标题同一行；只保留「最小化」，
    // 关闭 / 缩放禁用（closable:false + maximizable:false），另见下方的 close 拦截。
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 13 },
    resizable: false,
    movable: true,
    minimizable: true,
    maximizable: false,
    closable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    center: true,
    title: 'Vessel',
    backgroundColor: themeBackgroundColor(),
    webPreferences: {
      preload: path.join(PRELOAD_DIR, 'update-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  updateWindow.loadFile(path.join(RENDERER_DIR, 'update.html'));
  updateWindow.webContents.setZoomFactor(1);
  updateWindow.webContents.on('did-finish-load', () => {
    try {
      updateWindow.webContents.setZoomFactor(1);
    } catch (err) {
      /* ignore */
    }
  });
  updateWindow.on('close', (event) => {
    // 应用退出（如 quitAndInstall）或显式关闭时才放行。
    if (isQuitting || updateWindow.__forceClose) return;
    event.preventDefault();
  });
  updateWindow.once('ready-to-show', () => {
    if (!updateWindow || updateWindow.isDestroyed()) return;
    updateWindow.show();
    updateWindow.focus();
  });
  updateWindow.on('closed', () => {
    updateWindow = null;
  });

  return updateWindow;
}

function closeUpdateWindow() {
  const win = getUpdateWindow();
  if (!win) return;
  win.__forceClose = true;
  win.destroy();
}

function sendToUpdateWindow(channel, payload) {
  const win = getUpdateWindow();
  if (win) win.webContents.send(channel, payload);
}

function broadcast(channel, payload) {
  // The always-on-top terminal windows mirror settings too (font size / scrollback /
  // theme / locale); every open terminal window gets the broadcast.
  const wins = [getMainWindow(), getSettingsWindow(), getFileWindow(), ...terminalWindowsList()];
  for (const win of wins) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function setBlurSuppressed(value) {
  blurSuppressed = Boolean(value);
}

// 设置 → 终端 → 窗口大小：改完立即作用到已打开的终端窗口。
settings.on('changed', (_data, keys) => {
  if (!Array.isArray(keys)) {
    applyThemeBackgrounds();
    applyTerminalWindowSize();
    return;
  }
  if (keys.includes('theme')) applyThemeBackgrounds();
  if (keys.includes('floatMode')) rebuildMainWindowForMode();
  if (keys.includes('terminalWindowWidth') || keys.includes('terminalWindowHeight')) {
    applyTerminalWindowSize();
  }
  if (keys.includes('terminalAlwaysOnTop')) applyTerminalAlwaysOnTop();
  if (keys.includes('fileWindowAlwaysOnTop')) applyFileWindowAlwaysOnTop();
});

// 跟随系统主题时，系统外观变化也要重设窗口底色。
nativeTheme.on('updated', applyThemeBackgrounds);

module.exports = {
  setTray,
  createMainWindow,
  getMainWindow,
  showMainWindow,
  hideMainWindow,
  toggleMainWindow,
  forgetMainWindowGeometry,
  openSettingsWindow,
  closeSettingsWindow,
  getSettingsWindow,
  openFontPickerWindow,
  closeFontPickerWindow,
  getFontPickerWindow,
  openUpdateWindow,
  closeUpdateWindow,
  getUpdateWindow,
  isUpdateWindow,
  sendToUpdateWindow,
  openTerminalWindow,
  getTerminalWindow,
  getFocusedTerminalWindow,
  getTerminalWindowForWebContents,
  isTerminalWindow,
  isTerminalWebContents,
  forgetTerminalGeometry,
  requestTerminalSnap,
  ensureTerminalContentSize,
  terminalCloseAction,
  closeTerminalWindow,
  destroyTerminalWindow,
  toggleTerminalWindow,
  enterBallMode,
  exitBallMode,
  isBallMode,
  shrinkTerminalToBall,
  startBallDrag,
  stopBallDrag,
  openFileWindow,
  getFileWindow,
  getFileWindowTarget,
  getFileWindowPath,
  isFileWindow,
  snapFileWindowContentSize,
  closeFileWindow,
  forgetFileWindowGeometry,
  applyFileWindowAlwaysOnTop,
  broadcast,
  setBlurSuppressed,
  applyPin,
  applyVibrancy,
};
