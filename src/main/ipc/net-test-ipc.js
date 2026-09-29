'use strict';

const { IPC } = require('../../shared/constants');
const netTestService = require('../services/net-test-service');

function registerNetTestIpc(ipcMain) {
  // Port / reachability test: `{ protocol, ip, port }` → runs the matching command
  // (nc / ping / arp / curl) in a new iTerm window.
  ipcMain.handle(IPC.NET_TEST_RUN, (_event, payload) => netTestService.run(payload));
}

module.exports = { registerNetTestIpc };
