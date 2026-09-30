'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { dialog } = require('electron');
const { IPC } = require('../../shared/constants');
const terminal = require('../services/terminal-service');
const settings = require('../services/settings-service');
const iterm = require('../services/iterm-service');
const wm = require('../window-manager');
const logger = require('../utils/logger');

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
