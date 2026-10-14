'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { dialog, clipboard } = require('electron');
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
  'terminalCloseAction',
  'sshBuiltinTerminal',
  'sftpDownloadDir',
  'terminalBallEnabled',
  'terminalBallDelayMs',
];

function terminalDefaults() {
  const patch = {};
  for (const key of TERMINAL_SETTING_KEYS) patch[key] = DEFAULT_SETTINGS[key];
  return patch;
}

// Each terminal window owns its own session; other features (SSH connect, network
// tests) inject a command into the most recently focused terminal window.
let overlayLastCommand = '';
// webContents.id -> session id（该终端窗口当前的 PTY 会话）
const sessionByOwner = new Map();
// webContents.id -> 待注入命令（窗口刚打开、会话还没就绪时先记下）
const pendingByOwner = new Map();

function isOverlaySender(event) {
  return wm.isTerminalWebContents(event.sender.id);
}

const EVENT_CHANNELS = {
  data: IPC.TERMINAL_DATA,
  session: IPC.TERMINAL_SESSION,
};

function emitTo(sender) {
  return (message) => {
    if (!sender || sender.isDestroyed()) return;
    sender.send(EVENT_CHANNELS[message.type] || IPC.TERMINAL_EXIT, message);
  };
}

/* Runs `command` in a terminal window: the focused one if any, otherwise a new one
   (windows never move across desktops — we never pull an existing one over). */
function runInTerminal(command) {
  if (!command) return false;
  let win = wm.getFocusedTerminalWindow();
  if (!win) {
    // 只有一扇终端且处于「悬浮球」时，直接放大它并注入命令，而不是再开一扇。
    const existing = wm.getTerminalWindow();
    if (existing && wm.isBallMode(existing)) {
      wm.exitBallMode(existing, true);
      win = existing;
    } else {
      win = wm.openTerminalWindow();
    }
  }
  overlayLastCommand = command;
  if (!win || win.isDestroyed()) return false;
  const ownerId = win.webContents.id;
  const sessionId = sessionByOwner.get(ownerId);
  if (sessionId && terminal.get(sessionId)) {
    terminal.inject(sessionId, command);
  } else {
    pendingByOwner.set(ownerId, command); // flushed once the window's session reports in
  }
  return true;
}

function registerTerminalIpc(ipcMain) {
  hotkey.init();
  ipcMain.handle(IPC.TERMINAL_OPEN, () => ({ ok: Boolean(wm.openTerminalWindow()) }));

  ipcMain.handle(IPC.TERMINAL_START, (event, payload) => {
    const ownerId = event.sender.id;
    const baseEmit = emitTo(event.sender);
    const started = terminal.start(payload, (message) => {
      if ((message.type === 'exit' || message.type === 'error') && sessionByOwner.get(ownerId) === message.id) {
        sessionByOwner.delete(ownerId);
      }
      baseEmit(message);
    });
    if (isOverlaySender(event)) {
      sessionByOwner.set(ownerId, started.id);
      const pending = pendingByOwner.get(ownerId);
      if (pending) {
        pendingByOwner.delete(ownerId);
        terminal.inject(started.id, pending);
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

  /* 会话结束（用户在终端里 exit）→ 渲染层请求销毁窗口：这条路强制销毁，不受
     「关闭按钮行为=隐藏」影响（隐藏会让一个已结束的会话挂在后台）。 */
  ipcMain.handle(IPC.TERMINAL_DESTROY, (event) => {
    if (!isOverlaySender(event)) return { ok: false };
    const win = wm.getTerminalWindowForWebContents(event.sender.id);
    // 先回包再销毁：销毁窗口会让渲染层收不到 IPC 回复
    setImmediate(() => wm.destroyTerminalWindow(win));
    return { ok: true };
  });

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
    return wm.requestTerminalSnap(wm.getTerminalWindowForWebContents(event.sender.id), payload || {});
  });

  /* 打开内嵌文件面板时把本窗口「只放大不缩小」到至少给定内容尺寸（保证文件管理空间）。 */
  ipcMain.handle(IPC.TERMINAL_ENSURE_SIZE, (event, payload) => {
    if (!isOverlaySender(event)) return { ok: false };
    return wm.ensureTerminalContentSize(wm.getTerminalWindowForWebContents(event.sender.id), payload || {});
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

  /* Right-click on the terminal (Windows cmd style): copy the current selection when
     there is one, otherwise paste the system clipboard into the running shell. Both
     only respond to the terminal window itself. */
  ipcMain.handle(IPC.TERMINAL_COPY_TEXT, async (event, payload) => {
    if (!isOverlaySender(event)) return { ok: false };
    const text = String((payload && payload.text) || '');
    if (!text) return { ok: false };
    // Electron 的 clipboard 读写在新版是异步的：必须 await，否则返回的 Promise 无法被 IPC 序列化。
    await clipboard.writeText(text);
    return { ok: true };
  });

  ipcMain.handle(IPC.TERMINAL_PASTE_TEXT, async (event) => {
    if (!isOverlaySender(event)) return { ok: false, text: '' };
    let text = '';
    try {
      text = String((await clipboard.readText()) || '');
    } catch (err) {
      text = '';
    }
    return { ok: true, text };
  });

  /* Export: dump the xterm buffer text into a local file chosen by the user. */
  ipcMain.handle(IPC.TERMINAL_EXPORT, async (event, payload) => {
    const text = String((payload && payload.text) || '');
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const options = {
      title: 'Export terminal text',
      defaultPath: (payload && payload.name) || path.join(os.homedir(), `ships-terminal-${stamp}.txt`),
      filters: [{ name: 'Text', extensions: ['txt', 'log'] }],
    };
    const win = wm.getTerminalWindowForWebContents(event.sender.id);
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
  ipcMain.handle(IPC.TERMINAL_OPEN_ITERM, async (event) => {
    const win = wm.getTerminalWindowForWebContents(event.sender.id);
    // 交接会切到 iTerm → 终端窗口失焦；直接关闭，绝不缩成悬浮球。
    if (win && !win.isDestroyed()) win.__suppressBall = true;
    const command = overlayLastCommand || `${terminal.loginShell()} -l`;
    const result = await iterm.openCommand(command, 'terminal:handoff');
    if (result && result.ok) {
      // 交接成功 = 会话交给 iTerm：这里必须销毁（而不是按关闭行为隐藏）
      wm.destroyTerminalWindow(win);
    }
    return result && result.ok
      ? { ok: true, command }
      : { ok: false, command, error: (result && result.error) || 'error' };
  });
}

module.exports = { registerTerminalIpc, runInTerminal };
