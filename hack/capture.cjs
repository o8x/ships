'use strict';

// Dev-only UI capture helper (not part of the packaged app).
// Usage:
//   OUT=/tmp/ships.png SETTINGS_OUT=/tmp/ships-settings.png \
//     node_modules/.bin/electron hack/capture.cjs
const fs = require('fs');
const { app, ipcMain } = require('electron');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function waitLoad(win) {
  return new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
}

app.whenReady().then(async () => {
  const { registerAppIpc } = require('../src/main/ipc/app-ipc');
  const { registerWindowIpc } = require('../src/main/ipc/window-ipc');
  const { registerSettingsIpc } = require('../src/main/ipc/settings-ipc');
  const wm = require('../src/main/window-manager');

  registerAppIpc(ipcMain);
  registerWindowIpc(ipcMain);
  registerSettingsIpc(ipcMain);

  const win = wm.createMainWindow();
  await waitLoad(win);
  win.show();
  await delay(1600);
  const image = await win.webContents.capturePage();
  fs.writeFileSync(process.env.OUT || '/tmp/ships.png', image.toPNG());

  if (process.env.SETTINGS_OUT) {
    const settingsWin = wm.openSettingsWindow();
    await waitLoad(settingsWin);
    await delay(1400);
    const settingsImage = await settingsWin.webContents.capturePage();
    fs.writeFileSync(process.env.SETTINGS_OUT, settingsImage.toPNG());
  }

  app.quit();
});
