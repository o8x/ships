'use strict';

const fs = require('fs');
const { IPC } = require('../../shared/constants');
const { Notification, dialog, BrowserWindow } = require('electron');
const configService = require('../services/ssh-config-service');
const sshService = require('../services/ssh-service');
const { broadcast, getMainWindow } = require('../window-manager');
const { runInTerminal } = require('./terminal-ipc');
const logger = require('../utils/logger');

function findHost(alias) {
  if (!alias) return null;
  return configService.list().find((host) => host.alias === alias) || null;
}

function registerSshIpc(ipcMain) {
  ipcMain.handle(IPC.SSH_LIST, () => ({
    hosts: configService.list(),
    detected: sshService.getDetected(),
  }));

  // Connect inside the always-on-top terminal window (it can float above full-screen
  // apps, unlike iTerm which switches desktops).
  // `inTerminal: true`（终端窗口头部的 SSH 下拉）明确要求在「当前终端」里执行，
  // 不受「SSH 使用内置终端连接」开关影响。
  ipcMain.handle(IPC.SSH_CONNECT, (_event, payload) => {
    const host = findHost(payload && payload.alias);
    if (!host) return { ok: false, error: 'host not found' };
    const command = sshService.buildCommand(host);
    const settingsService = require('../services/settings-service');
    const inTerminal = Boolean(payload && payload.inTerminal);
    if (!inTerminal && settingsService.get('sshBuiltinTerminal') === false) {
      logger.file(`[ssh] connect(alias=${host.alias}) -> iTerm: ${command}`);
      return sshService.connect(host);
    }
    logger.file(`[ssh] connect(alias=${host.alias}) -> terminal: ${command}`);
    if (!runInTerminal(command)) return { ok: false, error: 'terminal unavailable', command };
    return { ok: true, command };
  });

  ipcMain.handle(IPC.SSH_DETECT, (_event, payload) => {
    const host = findHost(payload && payload.alias);
    if (!host) return { queued: false };
    sshService.detect(host);
    return { queued: true };
  });

  // Detect an arbitrary host (used by the settings form before the host exists).
  ipcMain.handle(IPC.SSH_DETECT_HOST, async (_event, payload) => {
    const host = payload || {};
    if (!host.hostName) return { ok: false, error: 'hostName required' };
    const alias = host.alias || host.hostName;
    const info = await sshService.runDetect({
      alias,
      hostName: host.hostName,
      port: host.port,
      user: host.user,
      identityFile: host.identityFile,
      proxyJump: host.proxyJump,
    });
    sshService.setDetected(alias, info);
    return { ok: true, alias, info };
  });

  ipcMain.handle(IPC.SSH_GET_DETECTED, () => sshService.getDetected());

  ipcMain.handle(IPC.SSH_CONFIG_READ, () => configService.list());
  ipcMain.handle(IPC.SSH_CONFIG_UPSERT, (_event, host) => configService.upsert(host));
  ipcMain.handle(IPC.SSH_CONFIG_REMOVE, (_event, alias) => configService.remove(alias));

  ipcMain.handle(IPC.SSH_CONFIG_EXPORT, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(win, {
      title: 'config',
      defaultPath: 'config',
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    try {
      if (fs.existsSync(configService.CONFIG_FILE)) {
        fs.copyFileSync(configService.CONFIG_FILE, result.filePath);
      } else {
        fs.writeFileSync(result.filePath, '', 'utf8');
      }
      return { ok: true, path: result.filePath };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  sshService.on('detected', (payload) => {
    broadcast(IPC.SSH_DETECTED, payload);
    const win = getMainWindow();
    if ((!win || !win.isVisible()) && Notification.isSupported()) {
      new Notification({
        title: 'Ships',
        body: `${payload.alias} · ${payload.label || 'Unknown'}`,
      }).show();
    }
  });
}

module.exports = { registerSshIpc };
