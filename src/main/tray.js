'use strict';

const path = require('path');
const { Tray, Menu, nativeImage, app } = require('electron');
const { APP_NAME } = require('../shared/constants');

const TRAY_ICON = path.join(__dirname, '..', '..', 'assets', 'imgs', 'trayTemplate.png');

function createTray({ onLeftClick, onOpenSettings }) {
  const image = nativeImage.createFromPath(TRAY_ICON);
  image.setTemplateImage(true);

  const tray = new Tray(image);
  tray.setToolTip(APP_NAME);
  tray.on('click', () => onLeftClick());
  tray.on('right-click', () => {
    const menu = Menu.buildFromTemplate([
      { label: '打开设置', click: () => onOpenSettings() },
      { type: 'separator' },
      { label: `退出 ${APP_NAME}`, click: () => app.quit() },
    ]);
    tray.popUpContextMenu(menu);
  });

  return tray;
}

module.exports = { createTray };
