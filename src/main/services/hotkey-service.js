'use strict';

// 全局快捷键（设置 → 终端 → 打开终端的全局快捷键）：在任意界面按下都能拉起置顶终端窗口。
// 只维护「当前注册的那个」快捷键 —— 改设置 / 重置时先注销旧的再注册新的；注册失败
// （组合键被别的 App 占用、格式非法）不落盘，由调用方提示用户。

const { globalShortcut } = require('electron');
const settings = require('./settings-service');
const logger = require('../utils/logger');

let registered = '';

function openTerminalWindow() {
  // 延迟 require：避免加载期与 window-manager 形成循环依赖。
  require('../window-manager').openTerminalWindow();
}

/* 注册（或注销）快捷键；返回 { ok, hotkey, error? }。hotkey 为空字符串表示不注册。 */
function apply(accelerator) {
  const wanted = String(accelerator == null ? '' : accelerator).trim();
  if (wanted === registered) return { ok: true, hotkey: registered };

  if (registered) {
    globalShortcut.unregister(registered);
    registered = '';
  }
  if (!wanted) return { ok: true, hotkey: '' };

  let ok = false;
  try {
    ok = globalShortcut.register(wanted, openTerminalWindow);
  } catch (err) {
    logger.warn(`[hotkey] register "${wanted}" failed:`, err.message);
    return { ok: false, hotkey: '', error: err.message };
  }
  if (!ok) {
    logger.warn(`[hotkey] register "${wanted}" rejected (可能已被其它 App 占用)`);
    return { ok: false, hotkey: '', error: 'unavailable' };
  }
  registered = wanted;
  logger.file(`[hotkey] terminal hotkey registered: ${wanted}`);
  return { ok: true, hotkey: registered };
}

function current() {
  return registered;
}

// 启动时按设置注册；改设置（含重置）时跟随。
function init() {
  const result = apply(settings.get('terminalHotkey'));
  if (!result.ok) logger.warn(`[hotkey] terminal hotkey unavailable: ${settings.get('terminalHotkey')}`);
}

settings.on('changed', (_data, keys) => {
  if (Array.isArray(keys) && !keys.includes('terminalHotkey')) return;
  apply(settings.get('terminalHotkey'));
});

function unregisterAll() {
  globalShortcut.unregisterAll();
  registered = '';
}

module.exports = { init, apply, current, unregisterAll };
