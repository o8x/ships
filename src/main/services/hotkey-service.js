'use strict';

// 全局快捷键（设置 → 快捷键）：主窗口与置顶终端各绑定一个 accelerator。
// - 终端：按一下触发 toggleTerminalWindow。
// - 主窗口：快速按两下触发 toggleMainWindow。
// 两者默认使用同一个组合键（CommandOrControl+Shift+Z）：此时单击 = 终端，
// 双击 = 主窗口；单击会等待 SHORTCUT_DOUBLE_TAP_MS 以区分双击。
// 绑定不同组合键时，各自按上述触发方式工作。

const { globalShortcut } = require('electron');
const settings = require('./settings-service');
const logger = require('../utils/logger');
const { SHORTCUT_DOUBLE_TAP_MS } = require('../../shared/constants');

const TARGETS = {
  main: 'mainWindowHotkey',
  terminal: 'terminalHotkey',
};

function normalize(value) {
  return String(value == null ? '' : value).trim();
}

let bindings = { main: '', terminal: '' };
let registered = [];
let pendingAccelerator = '';
let pendingTimer = null;

function clearPending() {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = null;
  pendingAccelerator = '';
}

function toggleMain() {
  require('../window-manager').toggleMainWindow();
}

function toggleTerminal() {
  require('../window-manager').toggleTerminalWindow();
}

function registerOne(accelerator, wanted) {
  const handler = () => onPress(accelerator, wanted);
  try {
    const ok = globalShortcut.register(accelerator, handler);
    if (!ok) {
      logger.warn(`[hotkey] register "${accelerator}" rejected (可能已被其它 App 占用)`);
      return { ok: false, error: 'unavailable' };
    }
  } catch (err) {
    logger.warn(`[hotkey] register "${accelerator}" failed:`, err.message);
    return { ok: false, error: err.message };
  }
  return { ok: true };
}

function unregister(list) {
  for (const accelerator of list) {
    try {
      globalShortcut.unregister(accelerator);
    } catch (err) {
      /* ignore */
    }
  }
}

function onPress(accelerator, wanted) {
  const isMain = wanted.main === accelerator;
  const isTerminal = wanted.terminal === accelerator;

  if (isMain && isTerminal) {
    // 同一个组合键：第一下等待，若在窗口内再按一下则主窗口；否则终端。
    if (pendingTimer && pendingAccelerator === accelerator) {
      clearPending();
      toggleMain();
      return;
    }
    clearPending();
    pendingAccelerator = accelerator;
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      pendingAccelerator = '';
      toggleTerminal();
    }, SHORTCUT_DOUBLE_TAP_MS);
    return;
  }

  if (isTerminal) {
    toggleTerminal();
    return;
  }

  if (isMain) {
    // 仅主窗口绑定：要求快速按两下，单击不触发。
    if (pendingTimer && pendingAccelerator === accelerator) {
      clearPending();
      toggleMain();
      return;
    }
    clearPending();
    pendingAccelerator = accelerator;
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      pendingAccelerator = '';
    }, SHORTCUT_DOUBLE_TAP_MS);
  }
}

function applyBindings(next) {
  const wanted = { main: normalize(next && next.main), terminal: normalize(next && next.terminal) };
  const previous = bindings;
  const previousRegistered = registered;
  const same = wanted.main === previous.main && wanted.terminal === previous.terminal;

  if (same && previousRegistered.length) return { ok: true };

  clearPending();
  unregister(previousRegistered);
  registered = [];

  const unique = Array.from(new Set([wanted.main, wanted.terminal].filter(Boolean)));
  for (const accelerator of unique) {
    const result = registerOne(accelerator, wanted);
    if (!result.ok) {
      unregister(registered);
      registered = [];
      // 回滚到上一次成功的绑定，避免因一个失败导致全部快捷键失效。
      for (const previousAccelerator of previousRegistered) {
        registerOne(previousAccelerator, previous);
      }
      registered = previousRegistered;
      bindings = previous;
      return result;
    }
    registered.push(accelerator);
  }

  bindings = wanted;
  if (registered.length) logger.file(`[hotkey] registered: ${registered.join(', ')}`);
  return { ok: true };
}

/* 设置某一项：先试注册成功再写设置（由 IPC 调用方持久化），失败时恢复旧绑定。 */
function setTarget(target, accelerator) {
  const key = TARGETS[target];
  if (!key) return { ok: false, error: 'invalid-target' };
  const next = Object.assign({}, bindings, { [target]: normalize(accelerator) });
  const result = applyBindings(next);
  if (!result.ok) return result;
  return { ok: true, hotkey: bindings[target] };
}

function current() {
  return Object.assign({}, bindings);
}

// 启动时按设置注册；改设置（含重置）时跟随。
function init() {
  const result = applyBindings({
    main: settings.get(TARGETS.main),
    terminal: settings.get(TARGETS.terminal),
  });
  if (!result.ok) logger.warn('[hotkey] some shortcuts unavailable');
}

settings.on('changed', (_data, keys) => {
  if (Array.isArray(keys) && !keys.includes(TARGETS.main) && !keys.includes(TARGETS.terminal)) return;
  init();
});

function unregisterAll() {
  clearPending();
  unregister(registered);
  registered = [];
  bindings = { main: '', terminal: '' };
  try {
    globalShortcut.unregisterAll();
  } catch (err) {
    /* ignore */
  }
}

module.exports = { init, setTarget, current, unregisterAll };
