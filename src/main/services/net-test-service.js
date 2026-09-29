'use strict';

// Runs a port / reachability test by opening iTerm with the matching command.

const iterm = require('./iterm-service');
const { buildCommand, PROTOCOLS } = require('../utils/net-test');
const logger = require('../utils/logger');

async function run(payload) {
  const protocol = String((payload && payload.protocol) || '').toLowerCase();
  const ip = String((payload && payload.ip) || '').trim();
  const port = String((payload && payload.port) || '').trim();
  const command = buildCommand({ protocol, ip, port });
  if (!command) {
    logger.error(`[net-test] rejected protocol=${protocol || '-'} ip=${ip || '-'} port=${port || '-'}`);
    return { ok: false, error: 'invalid ip, port or protocol' };
  }
  const portText = PROTOCOLS[protocol].port === 'none' || !port ? '' : `:${port}`;
  logger.file(`[net-test] ${protocol} ${ip}${portText} -> ${command}`);
  return iterm.openCommand(command, `net-test(${protocol} ${ip})`);
}

module.exports = { run };
