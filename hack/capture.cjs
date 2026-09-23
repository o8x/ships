'use strict';

// Dev-only UI capture helper (not part of the packaged app).
// Usage:
//   OUT=/tmp/ships.png SETTINGS_OUT=/tmp/ships-settings.png \
//     node_modules/.bin/electron hack/capture.cjs
const fs = require('fs');
const { app, ipcMain } = require('electron');

app.setName('ships');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function waitLoad(win) {
  return new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
}

app.whenReady().then(async () => {
  const { registerAppIpc } = require('../src/main/ipc/app-ipc');
  const { registerWindowIpc } = require('../src/main/ipc/window-ipc');
  const { registerSettingsIpc } = require('../src/main/ipc/settings-ipc');
  const { registerSshIpc } = require('../src/main/ipc/ssh-ipc');
  const { registerGeoIpc } = require('../src/main/ipc/geo-ipc');
  const wm = require('../src/main/window-manager');

  registerAppIpc(ipcMain);
  registerWindowIpc(ipcMain);
  registerSettingsIpc(ipcMain);
  registerSshIpc(ipcMain);
  registerGeoIpc(ipcMain);

  const win = wm.createMainWindow();
  win.webContents.setBackgroundThrottling(false);
  await waitLoad(win);
  win.show();
  await delay(1200);
  if (process.env.TAB) {
    const result = await win.webContents.executeJavaScript(
      `(() => { const list = document.querySelectorAll('.tab'); const i = ${Number(process.env.TAB)};` +
        ` if (list[i]) { list[i].click(); return 'clicked ' + i + ' of ' + list.length; }` +
        ` return 'missing ' + i + ' of ' + list.length; })();`
    );
    console.log('[capture] tab:', result);
    await delay(900);
  }
  if (process.env.INPUT) {
    const index = Number(process.env.INPUT_INDEX || 0);
    const result = await win.webContents.executeJavaScript(
      `(() => { const list = document.querySelectorAll('#content input, #content textarea'); const i = list[${index}];` +
        ` if (!i) return 'no input ' + list.length;` +
        ` i.value = ${JSON.stringify(process.env.INPUT)}; i.dispatchEvent(new Event('input', { bubbles: true }));` +
        ` i.dispatchEvent(new Event('blur', { bubbles: true }));` +
        ` return 'set ' + i.value; })();`
    );
    console.log('[capture] input:', result);
    await delay(400);
  }
  if (process.env.MAIN_CLICK) {
    await win.webContents.executeJavaScript(
      `document.querySelector(${JSON.stringify(process.env.MAIN_CLICK)})?.click();`
    );
    await delay(700);
  }
  if (process.env.PATCH) {
    await win.webContents.executeJavaScript(
      `window.ships.setSettings(${process.env.PATCH}).then(() => true);`
    );
    await delay(500);
  }
  win.webContents.invalidate();
  await delay(300);
  const image = await win.webContents.capturePage();
  const activeTool = await win.webContents.executeJavaScript(
    `document.querySelector('.tab-active') && document.querySelector('.tab-active').dataset.tool;`
  );
  console.log('[capture] active:', activeTool);
  fs.writeFileSync(process.env.OUT || '/tmp/ships.png', image.toPNG());

  if (process.env.SETTINGS_OUT) {
    const settingsWin = wm.openSettingsWindow();
    settingsWin.webContents.setBackgroundThrottling(false);
    await waitLoad(settingsWin);
    await delay(1200);
    if (process.env.SETTINGS_TAB) {
      await settingsWin.webContents.executeJavaScript(
        `document.querySelectorAll('.settings-nav-item')[${Number(process.env.SETTINGS_TAB)}]?.click();`
      );
      await delay(900);
    }
    if (process.env.SETTINGS_CLICK) {
      await settingsWin.webContents.executeJavaScript(
        `document.querySelector(${JSON.stringify(process.env.SETTINGS_CLICK)})?.click();`
      );
      await delay(700);
    }
    settingsWin.webContents.invalidate();
    await delay(300);
    const settingsImage = await settingsWin.webContents.capturePage();
    fs.writeFileSync(process.env.SETTINGS_OUT, settingsImage.toPNG());
  }

  app.quit();
});
