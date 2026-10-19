'use strict';

const { IPC } = require('../../shared/constants');
const nutrient = require('../services/nutrient-service');

function registerNutrientIpc(ipcMain) {
  ipcMain.handle(IPC.NUTRIENT_GET, () => nutrient.get());
  ipcMain.handle(IPC.NUTRIENT_SAVE_PRODUCT, (_event, payload) => nutrient.saveProduct(payload));
  ipcMain.handle(IPC.NUTRIENT_DELETE_PRODUCT, (_event, payload) => nutrient.deleteProduct(payload && payload.name));
  ipcMain.handle(IPC.NUTRIENT_SAVE_TDEE, (_event, payload) => nutrient.saveTdee(payload));
}

module.exports = { registerNutrientIpc };
