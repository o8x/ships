'use strict';

// Application menu + zoom routing.
//
// The Electron default menu's View -> Zoom items zoom the whole page, which also scaled
// the terminal window's title bar and icons. Here the accelerators are declared for
// discoverability but not registered with the system (registerAccelerator: false) and
// are handled through `before-input-event` instead, so:
//   - the terminal window zooms only its xterm font size;
//   - every other window keeps the usual page zoom.

const { app, BrowserWindow, Menu } = require('electron');
const { IPC } = require('../shared/constants');
const wm = require('./window-manager');

function focusedContents() {
  const win = BrowserWindow.getFocusedWindow();
  return win && !win.isDestroyed() ? win.webContents : null;
}

function applyZoom(direction, contents) {
  const target = contents || focusedContents();
  if (!target || target.isDestroyed()) return;

  if (wm.isTerminalWebContents(target.id)) {
    target.send(IPC.TERMINAL_ZOOM, direction);
    return;
  }

  const fileWin = wm.getFileWindow();
  if (fileWin && fileWin.webContents === target) {
    target.send(IPC.FILE_WINDOW_ZOOM, direction);
    return;
  }

  if (direction === 'reset') {
    target.setZoomLevel(0);
    return;
  }
  target.setZoomLevel(target.getZoomLevel() + (direction === 'in' ? 0.5 : -0.5));
}

function zoomDirectionFor(input) {
  if (!input.meta && !input.control) return '';
  if (input.key === '=' || input.key === '+') return 'in';
  if (input.key === '-' || input.key === '_') return 'out';
  if (input.key === '0') return 'reset';
  return '';
}

function installApplicationMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [
          {
            label: 'Zoom In',
            accelerator: 'CommandOrControl+Plus',
            registerAccelerator: false,
            click: () => applyZoom('in'),
          },
          {
            label: 'Zoom Out',
            accelerator: 'CommandOrControl+-',
            registerAccelerator: false,
            click: () => applyZoom('out'),
          },
          {
            label: 'Actual Size',
            accelerator: 'CommandOrControl+0',
            registerAccelerator: false,
            click: () => applyZoom('reset'),
          },
          { type: 'separator' },
          { role: 'togglefullscreen' },
          { role: 'toggleDevTools' },
        ],
      },
      { role: 'windowMenu' },
    ])
  );

  app.on('web-contents-created', (_event, contents) => {
    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      const direction = zoomDirectionFor(input);
      if (!direction) return;
      event.preventDefault();
      applyZoom(direction, contents);
    });
  });
}

module.exports = { installApplicationMenu, applyZoom };
