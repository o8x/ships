'use strict';

(function registerShortcutSettings() {
  const { el, section } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      settingsPage: {
        shortcuts: '快捷键',
        shortcutsHint: '两项使用同一个组合键时：按一下 = 终端，快速连按两下 = 主窗口',
        mainWindowShortcut: '主窗口',
        mainWindowShortcutHint: '快速按两下组合键显示 / 带到前台主窗口',
        terminalShortcut: '终端',
        terminalShortcutHint: '按一下组合键打开 / 收起置顶终端',
        shortcutEmpty: '未设置（点击后按组合键）',
        shortcutPress: '请按下组合键…',
        shortcutNeedModifier: '至少要含 Command / Control / Alt 之一',
        shortcutUnsupported: '不支持这个按键',
        shortcutTaken: '该组合键已被占用，换一个试试',
        shortcutFailed: '设置失败：{error}',
      },
    },
    en: {
      settingsPage: {
        shortcuts: 'Shortcuts',
        shortcutsHint: 'When both use the same combo: press once for the terminal, double-press quickly for the main window',
        mainWindowShortcut: 'Main window',
        mainWindowShortcutHint: 'Double-press the combo to show / bring the main window to front',
        terminalShortcut: 'Terminal',
        terminalShortcutHint: 'Press the combo once to open / collapse the terminal',
        shortcutEmpty: 'Not set (click, then press a combo)',
        shortcutPress: 'Press the shortcut…',
        shortcutNeedModifier: 'Include at least one of Command / Control / Alt',
        shortcutUnsupported: 'Unsupported key',
        shortcutTaken: 'That shortcut is already taken, try another',
        shortcutFailed: 'Cannot set: {error}',
      },
    },
  });

  /* Electron accelerator 只认自己的键名；用 event.code 查表，与键盘布局无关。 */
  const ACCEL_KEYS = {
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Space: 'Space',
    Enter: 'Return',
    NumpadEnter: 'Return',
    Tab: 'Tab',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
  };

  function keyNameFromEvent(event) {
    const code = event.code || '';
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
    return ACCEL_KEYS[code] || '';
  }

  /* '' = 不支持的键；'need-modifier' = 只有 Shift 这种弱修饰键。 */
  function acceleratorFromEvent(event) {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const parts = [];
    if (event.metaKey) parts.push(isMac ? 'Command' : 'Super');
    if (event.ctrlKey) parts.push('Control');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    const key = keyNameFromEvent(event);
    if (!key) return '';
    if (!event.metaKey && !event.ctrlKey && !event.altKey) return 'need-modifier';
    parts.push(key);
    return parts.join('+');
  }

  const MAC_SYMBOLS = {
    CommandOrControl: '⌘',
    Command: '⌘',
    Cmd: '⌘',
    Control: '⌃',
    Ctrl: '⌃',
    Alt: '⌥',
    Option: '⌥',
    Shift: '⇧',
    Super: '⌘',
  };

  function prettyAccelerator(accelerator) {
    const value = String(accelerator || '');
    if (!value) return '';
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    if (!isMac) return value.replace(/CommandOrControl/g, 'Ctrl');
    return value
      .split('+')
      .map((part) => MAC_SYMBOLS[part] || (part.length === 1 ? part.toUpperCase() : part))
      .join('');
  }

  function row(labelText, hintText, control) {
    const root = el('div', {
      class: 'flex items-center justify-between gap-4 rounded-card border border-border bg-surface px-4 py-3',
    });
    const left = el('div', { class: 'min-w-0' });
    left.appendChild(el('div', { class: 'text-[13px] font-medium text-fg' }, labelText));
    if (hintText) left.appendChild(el('div', { class: 'mt-0.5 break-all text-[11px] text-fg-muted' }, hintText));
    root.append(left, control);
    return root;
  }

  function hotkeyControl(target, currentValue) {
    const button = el('button', {
      class: 'btn w-[190px] shrink-0 justify-center font-mono text-[12px]',
      type: 'button',
    });
    const note = el('div', { class: 'text-[10px] text-danger' });
    const controls = el('div', { class: 'flex shrink-0 flex-col items-end gap-1' });
    controls.append(button, note);

    let value = currentValue || '';
    let capturing = false;

    function render() {
      button.textContent = capturing
        ? i18n.t('settingsPage.shortcutPress')
        : value
          ? prettyAccelerator(value)
          : i18n.t('settingsPage.shortcutEmpty');
      button.classList.toggle('btn-accent', capturing);
    }

    async function save(accelerator) {
      const result = await window.ships.shortcuts.setHotkey(target, accelerator || '');
      if (!result || !result.ok) {
        note.textContent =
          result && result.error === 'unavailable'
            ? i18n.t('settingsPage.shortcutTaken')
            : i18n.t('settingsPage.shortcutFailed', { error: (result && result.error) || 'error' });
        capturing = false;
        render();
        return;
      }
      value = result.hotkey || '';
      note.textContent = '';
      capturing = false;
      render();
    }

    button.addEventListener('click', () => {
      capturing = true;
      note.textContent = '';
      render();
      button.focus();
    });
    button.addEventListener('keydown', (event) => {
      if (!capturing) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        capturing = false;
        note.textContent = '';
        render();
        return;
      }
      if (event.code === 'Backspace' || event.code === 'Delete') {
        save('');
        return;
      }
      const accelerator = acceleratorFromEvent(event);
      if (accelerator === 'need-modifier') {
        note.textContent = i18n.t('settingsPage.shortcutNeedModifier');
        return;
      }
      if (!accelerator) {
        note.textContent = i18n.t('settingsPage.shortcutUnsupported');
        return;
      }
      save(accelerator);
    });
    button.addEventListener('blur', () => {
      if (!capturing) return;
      capturing = false;
      render();
    });

    render();
    return {
      root: controls,
      sync(next) {
        value = (target === 'main' ? next.mainWindowHotkey : next.terminalHotkey) || '';
        capturing = false;
        note.textContent = '';
        render();
      },
    };
  }

  function mount(pane, ctx) {
    const wrap = section();
    wrap.appendChild(el('div', { class: 'text-[12px] text-fg-muted' }, i18n.t('settingsPage.shortcutsHint')));

    const main = hotkeyControl('main', ctx.settings.mainWindowHotkey);
    wrap.appendChild(
      row(i18n.t('settingsPage.mainWindowShortcut'), i18n.t('settingsPage.mainWindowShortcutHint'), main.root)
    );

    const terminal = hotkeyControl('terminal', ctx.settings.terminalHotkey);
    wrap.appendChild(
      row(i18n.t('settingsPage.terminalShortcut'), i18n.t('settingsPage.terminalShortcutHint'), terminal.root)
    );

    pane.appendChild(wrap);

    return window.ships.onSettingsChanged((next) => {
      main.sync(next);
      terminal.sync(next);
    });
  }

  window.ShipsSettingsRegistry.register({
    id: 'shortcuts',
    icon: 'command',
    labelKey: 'settingsPage.shortcuts',
    mount,
  });
})();
