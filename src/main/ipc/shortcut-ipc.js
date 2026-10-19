'use strict';

const { IPC } = require('../../shared/constants');
const settings = require('../services/settings-service');
const hotkey = require('../services/hotkey-service');

const TARGET_KEYS = {
  main: 'mainWindowHotkey',
  terminal: 'terminalHotkey',
};

function registerShortcutIpc(ipcMain) {
  hotkey.init();

  /* 设置主窗口 / 终端快捷键：先试注册，成功了才写设置 —— 否则会存下一个按不出来
     （被占用 / 非法）的组合键。 */
  ipcMain.handle(IPC.SHORTCUT_SET, (_event, payload) => {
    const target = String((payload && payload.target) || '');
    const key = TARGET_KEYS[target];
    if (!key) return { ok: false, error: 'invalid-target' };

    const result = hotkey.setTarget(target, payload && payload.hotkey);
    if (!result.ok) return result;

    settings.set({ [key]: result.hotkey });
    return { ok: true, hotkey: result.hotkey };
  });
}

module.exports = { registerShortcutIpc };
