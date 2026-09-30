'use strict';

const { IPC } = require('../../shared/constants');
const terminal = require('../services/terminal-service');
const sshService = require('../services/ssh-service');
const configService = require('../services/ssh-config-service');
const { resolveCommand } = require('../utils/net-test');
const logger = require('../utils/logger');

function findHost(alias) {
  if (!alias) return null;
  return configService.list().find((host) => host.alias === alias) || null;
}

function registerNetTestIpc(ipcMain) {
  /* Test button: validate target / port / protocol / host, then type the command into
     the terminal session that asked for it. */
  ipcMain.handle(IPC.NET_TEST_COMMAND, (_event, payload) => {
    const id = String((payload && payload.id) || '');
    if (!terminal.get(id)) return { ok: false, error: 'no terminal session' };

    const alias = String((payload && payload.host) || '');
    const host = findHost(alias);
    if (alias && !host) return { ok: false, error: 'host not found' };

    const command = resolveCommand(payload);
    if (!command) return { ok: false, error: 'invalid target, port or protocol' };

    const line = host ? sshService.buildCommand(host, { command: sshService.shellQuote(command) }) : command;
    if (!terminal.inject(id, line)) return { ok: false, error: 'terminal write failed' };
    logger.file(`[net-test] inject ${host ? `via ${host.alias} ` : ''}${line}`);
    return { ok: true, command: line };
  });
}

module.exports = { registerNetTestIpc };
