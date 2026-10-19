'use strict';

(function registerTerminalSettings() {
  const { Icons, el, field, section } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      terminalSettings: {
        title: '终端',
        subtitle: '配置置顶终端窗口（设置 → 网络测试 里的终端同样生效）',
        shell: '默认 shell',
        shellHint: '留空使用系统默认（$SHELL）；例如 /bin/zsh',
        shellPlaceholder: '如 /bin/zsh',
        chooseShell: '选择文件',
        fontSize: '字体大小',
        fontSizeHint: '8–24px，默认 12px（Cmd + / Cmd - 临时调整，不写回设置）',
        windowSize: '窗口大小',
        windowSizeHint: '宽 × 高，最小 350 × 200，默认 1024 × 768；拖动窗口也会写回这里。终端会记住所在屏幕与位置：同一块屏幕沿用记忆，换屏或没有记录时按这里居中显示',
        scrollback: '缓冲区大小',
        scrollbackHint: '保留的历史行数，默认 10000',
        downloadDir: 'SFTP 下载目录',
        downloadDirHint: '终端窗口文件面板下载文件的保存位置，默认 ~/Downloads（重名自动加序号）',
        chooseDir: '选择目录',
        hotkey: '打开终端的全局快捷键',
        hotkeyHint: '在任意界面按下即可拉起置顶终端窗口；点一下右侧按钮再按新的组合键即可改绑（Backspace 清除、Esc 取消，至少含 Command / Control / Alt 之一）',
        hotkeyEmpty: '未设置（点击后按组合键）',
        hotkeyPress: '请按下组合键…',
        hotkeyNeedModifier: '至少要含 Command / Control / Alt 之一',
        hotkeyUnsupported: '不支持这个按键',
        hotkeyTaken: '该组合键已被占用，换一个试试',
        hotkeyFailed: '设置失败：{error}',
        builtinSsh: 'SSH 使用内置终端连接',
        builtinSshHint: '开启后点「连接」、以及目录浏览里「在终端中打开」都在置顶终端里执行 ssh；关闭则改用 iTerm',
        closeAction: '关闭按钮行为',
        closeActionHint: '点终端窗口左上角关闭按钮（或 Cmd-W）时：隐藏窗口保留会话，或直接销毁结束会话；在终端里输入 exit 结束 shell 时始终销毁窗口',
        closeActionHide: '隐藏窗口',
        closeActionDestroy: '销毁窗口',
        ballEnable: '自动缩成悬浮球',
        ballEnableHint: '终端窗口失去焦点一段时间后缩成圆形悬浮球，点击球 / 按快捷键放大回来',
        ballDelay: '缩成悬浮球延迟',
        ballDelayHint: '失去焦点后多久缩成球（期间焦点回来则取消）',
        ballDelayImmediate: '立即',
        ballSize: '悬浮球大小',
        ballSizeHint: '圆形悬浮球的边长（宽高强制 1:1，40–200px）',
        ballIcon: '悬浮球图标',
        ballIconHint: '从 assets/icons/ball 中选择悬浮球显示的图标，实时生效',
        ballDark: '终端暗色模式',
        ballDarkHint: '开启 = 终端（含悬浮球）始终暗色（默认）；关闭 = 跟随全局主题；悬浮球图标始终保留原色',
        seconds: '秒',
        reset: '重置',
        resetHint: '恢复终端相关设置为默认值，并清除记住的窗口屏幕 / 位置 / 大小',
        resetConfirm: '确认重置？',
        resetDone: '已恢复默认',
        saveFailed: '保存失败：{error}',
        chooseFailed: '无法选择文件：{error}',
      },
    },
    en: {
      terminalSettings: {
        title: 'Terminal',
        subtitle: 'Configure the always-on-top terminal (the settings network test uses it too)',
        shell: 'Default shell',
        shellHint: 'Empty = system default ($SHELL); e.g. /bin/zsh',
        shellPlaceholder: 'e.g. /bin/zsh',
        chooseShell: 'Choose file',
        fontSize: 'Font size',
        fontSizeHint: '8–24px, default 12px (Cmd + / Cmd - adjust temporarily)',
        windowSize: 'Window size',
        windowSizeHint: 'width × height, min 350 × 200, default 1024 × 768; resizing the window writes back here. The terminal remembers its screen and position: the same screen restores it, otherwise this size is used, centered',
        scrollback: 'Scrollback',
        scrollbackHint: 'History lines to keep, default 10000',
        downloadDir: 'SFTP download folder',
        downloadDirHint: 'Where the terminal file panel saves downloads, default ~/Downloads (duplicates get a number)',
        chooseDir: 'Choose folder',
        hotkey: 'Global shortcut to open the terminal',
        hotkeyHint: 'Works from any app; click the button and press a new combo to rebind (Backspace clears, Esc cancels, needs Command / Control / Alt)',
        hotkeyEmpty: 'Not set (click, then press a combo)',
        hotkeyPress: 'Press the shortcut…',
        hotkeyNeedModifier: 'Include at least one of Command / Control / Alt',
        hotkeyUnsupported: 'Unsupported key',
        hotkeyTaken: 'That shortcut is already taken, try another',
        hotkeyFailed: 'Cannot set: {error}',
        builtinSsh: 'Connect SSH in the built-in terminal',
        builtinSshHint: 'On: Connect and the directory browser open ssh in the always-on-top terminal. Off: use iTerm',
        closeAction: 'Close button action',
        closeActionHint: 'When the close button (or Cmd-W) is used: hide the window and keep the session, or destroy it. Ending the shell with exit always destroys the window',
        closeActionHide: 'Hide window',
        closeActionDestroy: 'Destroy window',
        ballEnable: 'Auto floating ball',
        ballEnableHint: 'Shrink the terminal into a round floating ball after it loses focus; click it or press the hotkey to bring it back',
        ballDelay: 'Ball shrink delay',
        ballDelayHint: 'How long after losing focus before shrinking (cancelled if focus returns)',
        ballDelayImmediate: 'Immediate',
        ballSize: 'Ball size',
        ballSizeHint: 'Edge length of the round ball (forced 1:1, 40–200px)',
        ballIcon: 'Ball icon',
        ballIconHint: 'Pick the floating ball icon from assets/icons/ball (applies live)',
        ballDark: 'Dark terminal',
        ballDarkHint: 'On = terminal (and ball) always dark (default); Off = follow the app theme; the ball icon keeps its colors',
        seconds: 's',
        reset: 'Reset',
        resetHint: 'Restore the terminal settings to their defaults and forget the remembered screen / position / size',
        resetConfirm: 'Reset everything?',
        resetDone: 'Defaults restored',
        saveFailed: 'Save failed: {error}',
        chooseFailed: 'Cannot choose file: {error}',
      },
    },
  });

  function switchControl(value, onToggle) {
    const button = el('button', { class: 'switch', type: 'button' });
    button.classList.toggle('on', Boolean(value));
    button.addEventListener('click', () => {
      const next = !button.classList.contains('on');
      button.classList.toggle('on', next);
      onToggle(next);
    });
    return button;
  }

  function row(labelText, hintText, control) {
    const wrap = el('div', { class: 'row-card mb-2.5' });
    const text = el('div', { class: 'min-w-0 flex-1' });
    text.append(
      el('div', { class: 'text-[13px] text-fg' }, labelText),
      el('div', { class: 'text-[10px] text-fg-muted' }, hintText)
    );
    wrap.append(text, control);
    return wrap;
  }

  /* ---------- 全局快捷键：按键 → Electron accelerator ---------- */
  // Electron 的 accelerator 只认它自己的键名（字母 / 数字 / F1-F24 / Up / Space / …），
  // 用 event.code（与键盘布局无关）查表；查不到就当作不支持的键。
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

  /* 返回 accelerator 字符串；'' = 不支持的键；'need-modifier' = 只有 Shift 这种弱修饰键。 */
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

  const MAC_SYMBOLS = { CommandOrControl: '⌘', Command: '⌘', Cmd: '⌘', Control: '⌃', Ctrl: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧', Super: '⌘' };

  /* 展示用：macOS 用 ⌘⇧Z 这样的符号，其它平台显示 CommandOrControl+Shift+Z 原样。 */
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

  function mount(pane, ctx) {
    const wrap = section();
    // 「重置」后要把每个控件的显示值同步回默认值（pane 不会自动重建）。
    const syncers = [];
    wrap.appendChild(el('div', { class: 'text-[12px] text-fg-muted' }, i18n.t('terminalSettings.subtitle')));

    /* default shell */
    const shellField = field(null, {
      class: 'field w-[210px] shrink-0 font-mono text-[12px]',
      placeholder: i18n.t('terminalSettings.shellPlaceholder'),
      spellcheck: 'false',
    });
    shellField.input.value = ctx.settings.terminalShell || '';
    shellField.input.addEventListener('change', () => ctx.patch({ terminalShell: shellField.input.value.trim() }));
    syncers.push((next) => {
      shellField.input.value = next.terminalShell || '';
    });
    const chooseBtn = el('button', { class: 'btn shrink-0 px-2 py-1.5 text-[12px]', type: 'button' }, i18n.t('terminalSettings.chooseShell'));
    chooseBtn.addEventListener('click', async () => {
      const info = await window.ships.openFile({ defaultPath: '/bin' });
      if (!info) return;
      shellField.input.value = info.path;
      ctx.patch({ terminalShell: info.path });
    });
    const shellControls = el('div', { class: 'flex shrink-0 items-center gap-2' });
    shellControls.append(shellField.input, chooseBtn);
    wrap.appendChild(row(i18n.t('terminalSettings.shell'), i18n.t('terminalSettings.shellHint'), shellControls));

    /* font size */
    const fontField = field(null, { class: 'field w-[90px] shrink-0 font-mono', type: 'number', min: '8', max: '24' });
    fontField.input.value = String(ctx.settings.terminalFontSize || 12);
    fontField.input.addEventListener('change', () => {
      const value = Math.max(8, Math.min(24, Number(fontField.input.value) || 12));
      fontField.input.value = String(value);
      ctx.patch({ terminalFontSize: value });
    });
    syncers.push((next) => {
      fontField.input.value = String(next.terminalFontSize || 12);
    });
    wrap.appendChild(row(i18n.t('terminalSettings.fontSize'), i18n.t('terminalSettings.fontSizeHint'), fontField.input));

    /* window size (applied immediately when the terminal window is open) */
    const sizeDefs = [
      { key: 'terminalWindowWidth', min: 350, max: 10000, fallback: 1024 },
      { key: 'terminalWindowHeight', min: 200, max: 10000, fallback: 768 },
    ];
    const sizeControls = el('div', { class: 'flex shrink-0 items-center gap-2' });
    const sizeFields = [];
    sizeDefs.forEach((def, index) => {
      const sizeField = field(null, {
        class: 'field w-[86px] shrink-0 font-mono',
        type: 'number',
        min: String(def.min),
        max: String(def.max),
      });
      sizeField.input.value = String(ctx.settings[def.key] || def.fallback);
      sizeField.input.addEventListener('change', () => {
        const value = Math.max(def.min, Math.min(def.max, Number(sizeField.input.value) || def.fallback));
        sizeField.input.value = String(value);
        ctx.patch({ [def.key]: value });
      });
      if (index) sizeControls.appendChild(el('span', { class: 'text-[11px] text-fg-muted' }, '×'));
      sizeControls.appendChild(sizeField.input);
      sizeFields.push({ def, input: sizeField.input });
    });
    syncers.push((next) => {
      for (const entry of sizeFields) entry.input.value = String(next[entry.def.key] || entry.def.fallback);
    });
    wrap.appendChild(row(i18n.t('terminalSettings.windowSize'), i18n.t('terminalSettings.windowSizeHint'), sizeControls));

    /* scrollback */
    const scrollField = field(null, { class: 'field w-[110px] shrink-0 font-mono', type: 'number', min: '100', step: '1000' });
    scrollField.input.value = String(ctx.settings.terminalScrollback || 10000);
    scrollField.input.addEventListener('change', () => {
      const value = Math.max(100, Math.min(200000, Number(scrollField.input.value) || 10000));
      scrollField.input.value = String(value);
      ctx.patch({ terminalScrollback: value });
    });
    syncers.push((next) => {
      scrollField.input.value = String(next.terminalScrollback || 10000);
    });
    wrap.appendChild(row(i18n.t('terminalSettings.scrollback'), i18n.t('terminalSettings.scrollbackHint'), scrollField.input));

    /* SFTP 下载目录（终端窗口文件面板） */
    const downloadField = field(null, {
      class: 'field w-[210px] shrink-0 font-mono text-[12px]',
      placeholder: '~/Downloads',
      spellcheck: 'false',
    });
    downloadField.input.value = ctx.settings.sftpDownloadDir || '~/Downloads';
    downloadField.input.addEventListener('change', () => {
      ctx.patch({ sftpDownloadDir: downloadField.input.value.trim() || '~/Downloads' });
    });
    syncers.push((next) => {
      downloadField.input.value = next.sftpDownloadDir || '~/Downloads';
    });
    const chooseDirBtn = el('button', { class: 'btn shrink-0 px-2 py-1.5 text-[12px]', type: 'button' }, i18n.t('terminalSettings.chooseDir'));
    chooseDirBtn.addEventListener('click', async () => {
      const info = await window.ships.openDirectory({ defaultPath: downloadField.input.value || '~/Downloads' });
      if (!info) return;
      downloadField.input.value = info.path;
      ctx.patch({ sftpDownloadDir: info.path });
    });
    const downloadControls = el('div', { class: 'flex shrink-0 items-center gap-2' });
    downloadControls.append(downloadField.input, chooseDirBtn);
    wrap.appendChild(row(i18n.t('terminalSettings.downloadDir'), i18n.t('terminalSettings.downloadDirHint'), downloadControls));

    /* SSH in the built-in terminal */
    const sshSwitch = switchControl(ctx.settings.sshBuiltinTerminal !== false, (value) => ctx.patch({ sshBuiltinTerminal: value }));
    syncers.push((next) => {
      sshSwitch.classList.toggle('on', next.sshBuiltinTerminal !== false);
    });
    wrap.appendChild(
      row(i18n.t('terminalSettings.builtinSsh'), i18n.t('terminalSettings.builtinSshHint'), sshSwitch)
    );

    /* 关闭按钮行为：隐藏（保留会话）或销毁 */
    const closeActionSwitch = window.ShipsUI.segmented(
      [
        { value: 'hide', label: i18n.t('terminalSettings.closeActionHide') },
        { value: 'destroy', label: i18n.t('terminalSettings.closeActionDestroy') },
      ],
      ctx.settings.terminalCloseAction === 'hide' ? 'hide' : 'destroy',
      (value) => ctx.patch({ terminalCloseAction: value }),
      { className: 'segment-compact' }
    );
    syncers.push((next) => {
      closeActionSwitch.set(next.terminalCloseAction === 'hide' ? 'hide' : 'destroy');
    });
    wrap.appendChild(
      row(i18n.t('terminalSettings.closeAction'), i18n.t('terminalSettings.closeActionHint'), closeActionSwitch.root)
    );

    /* 失去焦点缩成悬浮球：开关 + 延迟 */
    const ballSwitch = switchControl(ctx.settings.terminalBallEnabled !== false, (value) =>
      ctx.patch({ terminalBallEnabled: value })
    );
    syncers.push((next) => {
      ballSwitch.classList.toggle('on', next.terminalBallEnabled !== false);
    });
    wrap.appendChild(
      row(i18n.t('terminalSettings.ballEnable'), i18n.t('terminalSettings.ballEnableHint'), ballSwitch)
    );

    // 0 = 立即；其余为毫秒。默认 50ms。
    const normalizeBallDelay = (value) => {
      const n = Number(value);
      return Number.isFinite(n) && n >= 0 ? n : 50;
    };
    const ballDelaySelect = window.ShipsUI.createSelect({
      options: [0, 50, 100, 200, 500, 1000, 5000, 10000, 15000, 30000, 60000].map((ms) => ({
        value: ms,
        label:
          ms === 0
            ? i18n.t('terminalSettings.ballDelayImmediate')
            : ms < 1000
              ? `${ms} ms`
              : `${ms / 1000} ${i18n.t('terminalSettings.seconds')}`,
      })),
      value: normalizeBallDelay(ctx.settings.terminalBallDelayMs),
      align: 'right',
      className: 'w-[120px] shrink-0',
      onChange: (value) => ctx.patch({ terminalBallDelayMs: Number(value) }),
    });
    syncers.push((next) => {
      ballDelaySelect.setValue(normalizeBallDelay(next.terminalBallDelayMs));
    });
    wrap.appendChild(
      row(i18n.t('terminalSettings.ballDelay'), i18n.t('terminalSettings.ballDelayHint'), ballDelaySelect.el)
    );

    const ballSizeField = field(null, {
      class: 'field w-[86px] shrink-0 font-mono',
      type: 'number',
      min: '40',
      max: '200',
    });
    ballSizeField.input.value = String(ctx.settings.terminalBallSize || 75);
    ballSizeField.input.addEventListener('change', () => {
      const value = Math.max(40, Math.min(200, Number(ballSizeField.input.value) || 75));
      ballSizeField.input.value = String(value);
      ctx.patch({ terminalBallSize: value });
    });
    syncers.push((next) => {
      ballSizeField.input.value = String(next.terminalBallSize || 75);
    });
    wrap.appendChild(
      row(i18n.t('terminalSettings.ballSize'), i18n.t('terminalSettings.ballSizeHint'), ballSizeField.input)
    );

    /* 悬浮球图标：assets/icons/ball/ 下可选，下拉里直接显示图标，实时生效 */
    const ballIconData = window.shipsBallIcons || { names: [], icons: {} };
    const ballIconSelect = window.ShipsUI.createSelect({
      options: ballIconData.names.map((name) => ({
        value: name,
        label: '',
        icon: ballIconData.icons[name] || '',
      })),
      value: ctx.settings.terminalBallIcon || 'ball.svg',
      align: 'right',
      className: 'w-[64px] shrink-0',
      menuClassName: 'select-menu-icons',
      onChange: (value) => ctx.patch({ terminalBallIcon: value }),
    });
    syncers.push((next) => {
      ballIconSelect.setValue(next.terminalBallIcon || 'ball.svg');
    });
    wrap.appendChild(
      row(i18n.t('terminalSettings.ballIcon'), i18n.t('terminalSettings.ballIconHint'), ballIconSelect.el)
    );

    /* 终端暗色模式：开 = 终端（含悬浮球）始终暗色（默认）；关 = 跟随全局主题。悬浮球图标始终保留原色。 */
    const termDarkSwitch = switchControl(ctx.settings.terminalBallDark !== false, (value) =>
      ctx.patch({ terminalBallDark: value })
    );
    syncers.push((next) => {
      termDarkSwitch.classList.toggle('on', next.terminalBallDark !== false);
    });
    wrap.appendChild(
      row(i18n.t('terminalSettings.ballDark'), i18n.t('terminalSettings.ballDarkHint'), termDarkSwitch)
    );

    /* 全局快捷键：在任意界面按下即可拉起置顶终端窗口 */
    const hotkeyBtn = el('button', {
      class: 'btn w-[170px] shrink-0 justify-center font-mono text-[12px]',
      type: 'button',
    });
    const hotkeyNote = el('div', { class: 'text-[10px] text-danger' });
    const hotkeyControls = el('div', { class: 'flex shrink-0 flex-col items-end gap-1' });
    hotkeyControls.append(hotkeyBtn, hotkeyNote);

    let hotkeyValue = ctx.settings.terminalHotkey || '';
    let capturing = false;

    function renderHotkey() {
      hotkeyBtn.textContent = capturing
        ? i18n.t('terminalSettings.hotkeyPress')
        : hotkeyValue
          ? prettyAccelerator(hotkeyValue)
          : i18n.t('terminalSettings.hotkeyEmpty');
      hotkeyBtn.classList.toggle('btn-accent', capturing);
    }

    async function saveHotkey(accelerator) {
      const result = await window.ships.terminal.setHotkey(accelerator || '');
      if (!result || !result.ok) {
        const reason = result && result.error === 'unavailable' ? i18n.t('terminalSettings.hotkeyTaken') : (result && result.error) || 'error';
        hotkeyNote.textContent =
          result && result.error === 'unavailable'
            ? i18n.t('terminalSettings.hotkeyTaken')
            : i18n.t('terminalSettings.hotkeyFailed', { error: reason });
        capturing = false;
        renderHotkey();
        return;
      }
      hotkeyValue = result.hotkey || '';
      hotkeyNote.textContent = '';
      capturing = false;
      renderHotkey();
    }

    hotkeyBtn.addEventListener('click', () => {
      capturing = true;
      hotkeyNote.textContent = '';
      renderHotkey();
      hotkeyBtn.focus();
    });
    hotkeyBtn.addEventListener('keydown', (event) => {
      if (!capturing) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        capturing = false;
        hotkeyNote.textContent = '';
        renderHotkey();
        return;
      }
      if (event.code === 'Backspace' || event.code === 'Delete') {
        saveHotkey('');
        return;
      }
      const accelerator = acceleratorFromEvent(event);
      if (accelerator === 'need-modifier') {
        hotkeyNote.textContent = i18n.t('terminalSettings.hotkeyNeedModifier');
        return;
      }
      if (!accelerator) {
        hotkeyNote.textContent = i18n.t('terminalSettings.hotkeyUnsupported');
        return;
      }
      saveHotkey(accelerator);
    });
    hotkeyBtn.addEventListener('blur', () => {
      if (!capturing) return;
      capturing = false;
      renderHotkey();
    });

    renderHotkey();
    syncers.push((next) => {
      hotkeyValue = next.terminalHotkey || '';
      capturing = false;
      hotkeyNote.textContent = '';
      renderHotkey();
    });
    wrap.appendChild(row(i18n.t('terminalSettings.hotkey'), i18n.t('terminalSettings.hotkeyHint'), hotkeyControls));

    /* 重置：终端相关设置回默认 + 清掉记住的屏幕 / 位置 / 尺寸（二次确认） */
    const resetControls = el('div', { class: 'flex shrink-0 flex-col items-end gap-1' });
    const resetNote = el('div', { class: 'text-[10px] text-success' });
    const resetBtn = el('button', { class: 'btn shrink-0 px-3 py-1.5 text-[12px]', type: 'button' }, i18n.t('terminalSettings.reset'));
    let confirmingReset = false;

    function renderReset() {
      resetControls.innerHTML = '';
      if (!confirmingReset) {
        resetControls.append(resetBtn, resetNote);
        return;
      }
      const warn = el('div', { class: 'flex items-center gap-1' });
      warn.appendChild(el('span', { class: 'text-[11px] text-danger' }, i18n.t('terminalSettings.resetConfirm')));
      const yes = el('button', { class: 'icon-btn h-7 w-7', type: 'button' });
      yes.innerHTML = Icons.check(15);
      yes.style.color = 'var(--color-danger)';
      yes.addEventListener('click', async () => {
        const result = await window.ships.terminal.reset();
        confirmingReset = false;
        if (!result || !result.ok) {
          resetNote.textContent = i18n.t('terminalSettings.saveFailed', { error: (result && result.error) || 'error' });
          resetNote.style.color = 'var(--color-danger)';
          renderReset();
          return;
        }
        for (const sync of syncers) sync(result.settings || {});
        resetNote.style.color = 'var(--color-success)';
        resetNote.textContent = i18n.t('terminalSettings.resetDone');
        renderReset();
        setTimeout(() => {
          resetNote.textContent = '';
        }, 2000);
      });
      const no = el('button', { class: 'icon-btn h-7 w-7', type: 'button' });
      no.innerHTML = Icons.x(15);
      no.addEventListener('click', () => {
        confirmingReset = false;
        renderReset();
      });
      warn.append(yes, no);
      resetControls.append(warn, resetNote);
    }

    resetBtn.addEventListener('click', () => {
      confirmingReset = true;
      resetNote.textContent = '';
      renderReset();
    });

    resetControls.append(resetBtn, resetNote);
    wrap.appendChild(row(i18n.t('terminalSettings.reset'), i18n.t('terminalSettings.resetHint'), resetControls));

    pane.appendChild(wrap);
  }

  window.ShipsSettingsRegistry.register({
    id: 'terminal',
    icon: 'terminal',
    labelKey: 'terminalSettings.title',
    mount,
  });
})();
