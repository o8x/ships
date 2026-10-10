'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { dialog } = require('electron');
const { IPC, DEFAULT_SETTINGS } = require('../../shared/constants');
const terminal = require('../services/terminal-service');
const settings = require('../services/settings-service');
const iterm = require('../services/iterm-service');
const hotkey = require('../services/hotkey-service');
const wm = require('../window-manager');
const logger = require('../utils/logger');

// 设置 → 终端 里「重置」要恢复的设置项（都来自 package.json 的 ships 配置）。
const TERMINAL_SETTING_KEYS = [
  'terminalShell',
  'terminalFontSize',
  'terminalScrollback',
  'terminalWindowWidth',
  'terminalWindowHeight',
  'terminalAlwaysOnTop',
  'terminalHotkey',
  'sshBuiltinTerminal',
];

function terminalDefaults() {
  const patch = {};
  for (const key of TERMINAL_SETTING_KEYS) patch[key] = DEFAULT_SETTINGS[key];
  return patch;
}

// The always-on-top terminal window owns one session; other features (SSH connect,
// network tests) can inject a command into it while it is open.
let overlaySessionId = '';
let overlayLastCommand = '';
let pendingInject = '';

function isOverlaySender(event) {
  const win = wm.getTerminalWindow();
  return Boolean(win && !win.isDestroyed() && win.webContents.id === event.sender.id);
}

function emitTo(sender) {
  return (message) => {
    if (!sender || sender.isDestroyed()) return;
    sender.send(message.type === 'data' ? IPC.TERMINAL_DATA : IPC.TERMINAL_EXIT, message);
  };
}

/* Runs `command` in the terminal window, opening it first when needed. */
function runInTerminal(command) {
  if (!command) return false;
  wm.openTerminalWindow();
  overlayLastCommand = command;
  if (overlaySessionId && terminal.get(overlaySessionId)) {
    terminal.inject(overlaySessionId, command);
  } else {
    pendingInject = command; // flushed once the window's session reports in
  }
  return true;
}

function registerTerminalIpc(ipcMain) {
  hotkey.init();
  ipcMain.handle(IPC.TERMINAL_OPEN, () => ({ ok: Boolean(wm.openTerminalWindow()) }));

  ipcMain.handle(IPC.TERMINAL_START, (event, payload) => {
    const started = terminal.start(payload, emitTo(event.sender));
    if (isOverlaySender(event)) {
      overlaySessionId = started.id;
      if (pendingInject) {
        const command = pendingInject;
        pendingInject = '';
        terminal.inject(started.id, command);
      }
    }
    return started;
  });

  ipcMain.handle(IPC.TERMINAL_INPUT, (_event, payload) => ({
    ok: terminal.write(payload && payload.id, payload && payload.data),
  }));
  ipcMain.handle(IPC.TERMINAL_RESIZE, (_event, payload) => ({
    ok: terminal.resize(payload && payload.id, payload && payload.cols, payload && payload.rows),
  }));
  ipcMain.handle(IPC.TERMINAL_INTERRUPT, (_event, payload) => ({ ok: terminal.interrupt(payload && payload.id) }));
  ipcMain.handle(IPC.TERMINAL_KILL, (_event, payload) => ({ ok: terminal.kill(payload && payload.id) }));

  /* Header pin button: toggle / persist always-on-top for the terminal window.
     window-manager applies the new value through its settings listener. */
  ipcMain.handle(IPC.TERMINAL_SET_TOP, (_event, payload) => {
    const value = Boolean(payload && payload.value);
    settings.set({ terminalAlwaysOnTop: value });
    return { ok: true, alwaysOnTop: value };
  });

  /* 按渲染层实测的余量精确对齐高度（拖动结束后 / 首次打开 / 改字号时各一次）：
     拖动期间 window-manager 只会把它挂起（动尺寸会打乱 macOS 的拖拽跟踪），松手后再执行。
     只接受来自终端窗口本身的请求；低于最小高度 / 无变化时不动。 */
  ipcMain.handle(IPC.TERMINAL_SNAP_SIZE, (event, payload) => {
    if (!isOverlaySender(event)) return { ok: false };
    return wm.requestTerminalSnap(payload || {});
  });

  /* 全局快捷键：先试注册，成功了才写设置 —— 否则会存下一个按不出来（被占用 / 非法）的组合键。
     写设置后 hotkey-service 的 settings 监听会再 apply 一次，同值直接返回。 */
  ipcMain.handle(IPC.TERMINAL_SET_HOTKEY, (_event, payload) => {
    const wanted = String((payload && payload.hotkey) || '').trim();
    const result = hotkey.apply(wanted);
    if (!result.ok) return result;
    settings.set({ terminalHotkey: result.hotkey });
    return { ok: true, hotkey: result.hotkey };
  });

  /* 重置：终端相关设置回到默认值（写设置即可让开着的终端窗口跟着变），并清掉记住的
     屏幕 / 位置 / 尺寸。 */
  ipcMain.handle(IPC.TERMINAL_RESET, () => {
    const next = settings.set(terminalDefaults());
    wm.forgetTerminalGeometry();
    logger.file('[terminal] settings reset to defaults');
    return { ok: true, settings: next };
  });

  /* Export: dump the xterm buffer text into a local file chosen by the user. */
  ipcMain.handle(IPC.TERMINAL_EXPORT, async (_event, payload) => {
    const text = String((payload && payload.text) || '');
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const options = {
      title: 'Export terminal text',
      defaultPath: (payload && payload.name) || path.join(os.homedir(), `ships-terminal-${stamp}.txt`),
      filters: [{ name: 'Text', extensions: ['txt', 'log'] }],
    };
    const win = wm.getTerminalWindow();
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    try {
      fs.writeFileSync(result.filePath, text, 'utf8');
      return { ok: true, path: result.filePath, bytes: Buffer.byteLength(text, 'utf8') };
    } catch (err) {
      logger.error(`[terminal] export failed: ${err.message}`);
      return { ok: false, error: err.message };
    }
  });

  /* Hand the session over to iTerm (same command when known) and close the window. */
  ipcMain.handle(IPC.TERMINAL_OPEN_ITERM, async () => {
    const command = overlayLastCommand || `${terminal.loginShell()} -l`;
    const result = await iterm.openCommand(command, 'terminal:handoff');
    if (result && result.ok) {
      const win = wm.getTerminalWindow();
      if (win && !win.isDestroyed()) win.close();
    }
    return result && result.ok
      ? { ok: true, command }
      : { ok: false, command, error: (result && result.error) || 'error' };
  });
}

module.exports = { registerTerminalIpc, runInTerminal };
