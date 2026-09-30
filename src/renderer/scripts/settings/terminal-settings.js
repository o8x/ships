'use strict';

(function registerTerminalSettings() {
  const { el, field, section } = window.ShipsUI;
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
        windowSizeHint: '宽 × 高，最小 480 × 320，默认 1024 × 768；手动拖动窗口也会写回这里',
        scrollback: '缓冲区大小',
        scrollbackHint: '保留的历史行数，默认 10000',
        builtinSsh: 'SSH 使用内置终端连接',
        builtinSshHint: '开启后点「连接」在置顶终端里执行 ssh；关闭则改用 iTerm',
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
        windowSizeHint: 'width × height, min 480 × 320, default 1024 × 768; resizing the window writes back here',
        scrollback: 'Scrollback',
        scrollbackHint: 'History lines to keep, default 10000',
        builtinSsh: 'Connect SSH in the built-in terminal',
        builtinSshHint: 'On: the SSH button runs ssh in the always-on-top terminal. Off: use iTerm',
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

  function mount(pane, ctx) {
    const wrap = section();
    wrap.appendChild(el('div', { class: 'text-[12px] text-fg-muted' }, i18n.t('terminalSettings.subtitle')));

    /* default shell */
    const shellField = field(null, {
      class: 'field w-[210px] shrink-0 font-mono text-[12px]',
      placeholder: i18n.t('terminalSettings.shellPlaceholder'),
      spellcheck: 'false',
    });
    shellField.input.value = ctx.settings.terminalShell || '';
    shellField.input.addEventListener('change', () => ctx.patch({ terminalShell: shellField.input.value.trim() }));
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
    wrap.appendChild(row(i18n.t('terminalSettings.fontSize'), i18n.t('terminalSettings.fontSizeHint'), fontField.input));

    /* window size (applied immediately when the terminal window is open) */
    const sizeDefs = [
      { key: 'terminalWindowWidth', min: 480, max: 10000, fallback: 1024 },
      { key: 'terminalWindowHeight', min: 320, max: 10000, fallback: 768 },
    ];
    const sizeControls = el('div', { class: 'flex shrink-0 items-center gap-2' });
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
    wrap.appendChild(row(i18n.t('terminalSettings.scrollback'), i18n.t('terminalSettings.scrollbackHint'), scrollField.input));

    /* SSH in the built-in terminal */
    wrap.appendChild(
      row(
        i18n.t('terminalSettings.builtinSsh'),
        i18n.t('terminalSettings.builtinSshHint'),
        switchControl(ctx.settings.sshBuiltinTerminal !== false, (value) => ctx.patch({ sshBuiltinTerminal: value }))
      )
    );

    pane.appendChild(wrap);
  }

  window.ShipsSettingsRegistry.register({
    id: 'terminal',
    icon: 'terminal',
    labelKey: 'terminalSettings.title',
    mount,
  });
})();
