'use strict';

const { IPC } = require('../../shared/constants');
const geoService = require('../services/geo-service');

function registerGeoIpc(ipcMain) {
  ipcMain.handle(IPC.GEO_LOOKUP, (_event, ip) => geoService.lookup(ip));
}

module.exports = { registerGeoIpc };
