'use strict';

const { IPC } = require('../../shared/constants');
const { Notification } = require('electron');
const configService = require('../services/ssh-config-service');
const sshService = require('../services/ssh-service');
const { broadcast, getMainWindow } = require('../window-manager');

function findHost(alias) {
  if (!alias) return null;
  return configService.list().find((host) => host.alias === alias) || null;
}

function registerSshIpc(ipcMain) {
  ipcMain.handle(IPC.SSH_LIST, () => ({
    hosts: configService.list(),
    detected: sshService.getDetected(),
  }));

  ipcMain.handle(IPC.SSH_CONNECT, (_event, payload) => {
    const host = findHost(payload && payload.alias);
    if (!host) return { ok: false, error: 'host not found' };
    return sshService.connect(host);
  });

  ipcMain.handle(IPC.SSH_DETECT, (_event, payload) => {
    const host = findHost(payload && payload.alias);
    if (!host) return { queued: false };
    sshService.detect(host);
    return { queued: true };
  });

  ipcMain.handle(IPC.SSH_CONFIG_READ, () => configService.list());
  ipcMain.handle(IPC.SSH_CONFIG_UPSERT, (_event, host) => configService.upsert(host));
  ipcMain.handle(IPC.SSH_CONFIG_REMOVE, (_event, alias) => configService.remove(alias));

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
