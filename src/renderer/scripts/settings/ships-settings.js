'use strict';

(function registerShipsSettings() {
  const { Icons, el, section, createSelect } = window.ShipsUI;
  const i18n = window.ShipsI18n;
  const { ACCENT_PRESETS, LANGUAGES } = window.ShipsConstants;

  i18n.extend({
    zh: {
      settingsPage: {
        title: '设置',
        ships: '应用',
        ssh: 'SSH',
        language: '语言',
        languageHint: '界面显示语言',
        appearance: '外观',
        appearanceHint: '跟随系统或手动指定',
        themeSystem: '跟随系统',
        themeLight: '浅色',
        themeDark: '深色',
        accent: '主题色',
        accentHint: '强调色与高亮',
        accentCustom: '自定义',
        launchAtLogin: '开机自启',
        launchAtLoginHint: '登录时自动启动 Vessel',
        floatMode: '悬浮模式',
        floatModeHint: '开 = 悬浮面板，关 = 独立窗口',
        pin: '固定悬浮',
        pinHint: '置顶常驻，失焦不隐藏（仅悬浮模式）',
        vibrancy: 'Liquid Glass',
        vibrancyHint: 'macOS 26+ 原生玻璃，旧系统回退毛玻璃',
        glassOpacity: 'Liquid Glass 透明度',
        glassOpacityHint: '越高越透明（实时生效）',
        clipboardLimit: '剪贴板条数',
        clipboardLimitHint: '最多保留最近几条记录',
        clipboardPoll: '剪贴板轮询间隔',
        clipboardPollHint: '检测系统剪贴板变化的频率',
        dataFolder: '数据文件夹',
        clearData: '清理数据',
        clearDataHint: '清除窗口位置 / 大小、列宽与 cd 历史等非业务数据',
        clearDataAction: '清除',
        clearDataConfirm: '确认清理？',
        open: '打开',
        about: '关于',
        version: '版本',
        checkUpdates: '检查更新',
        check: '检查',
        checking: '正在检查…',
        developerMode: '开发者模式',
        developerModeHint: '显示开发者工具与主界面标记',
        developer: '开发者',
        devPopover: '悬浮界面开发者工具',
        devSettings: '设置界面开发者工具',
        devTerminal: '终端界面开发者工具',
        devFile: '文件管理界面开发者工具',
      },
    },
    en: {
      settingsPage: {
        title: 'Settings',
        ships: 'App',
        ssh: 'SSH',
        language: 'Language',
        languageHint: 'Interface language',
        appearance: 'Appearance',
        appearanceHint: 'Follow system or set manually',
        themeSystem: 'System',
        themeLight: 'Light',
        themeDark: 'Dark',
        accent: 'Accent color',
        accentHint: 'Accent and highlight',
        accentCustom: 'Custom',
        launchAtLogin: 'Launch at login',
        launchAtLoginHint: 'Start Vessel when you log in',
        floatMode: 'Floating mode',
        floatModeHint: 'On = floating panel, Off = standalone window',
        pin: 'Keep on top',
        pinHint: 'Keep on top and stay visible on blur (floating mode only)',
        vibrancy: 'Liquid Glass',
        vibrancyHint: 'Native glass on macOS 26+; frosted fallback on older systems',
        glassOpacity: 'Liquid Glass opacity',
        glassOpacityHint: 'Higher = more transparent (live)',
        clipboardLimit: 'Clipboard items',
        clipboardLimitHint: 'How many recent items to keep',
        clipboardPoll: 'Clipboard poll interval',
        clipboardPollHint: 'How often to check the system clipboard',
        dataFolder: 'Data folder',
        clearData: 'Clear data',
        clearDataHint: 'Remove window position / size, column widths and cd history (non-business data)',
        clearDataAction: 'Clear',
        clearDataConfirm: 'Clear data?',
        open: 'Open',
        about: 'About',
        version: 'Version',
        checkUpdates: 'Check for updates',
        check: 'Check',
        checking: 'Checking…',
        developerMode: 'Developer mode',
        developerModeHint: 'Show DevTools and the main-window badge',
        developer: 'Developer',
        devPopover: 'Popover DevTools',
        devSettings: 'Settings DevTools',
        devTerminal: 'Terminal DevTools',
        devFile: 'File window DevTools',
      },
    },
  });

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

  function segmented(options, value, onSelect) {
    const root = el('div', { class: 'segment shrink-0' });
    const buttons = options.map((option) => {
      const button = el('button', { type: 'button', dataset: { value: option.value } }, option.label);
      button.addEventListener('click', () => onSelect(option.value));
      root.appendChild(button);
      return button;
    });
    function set(next) {
      buttons.forEach((button) => button.classList.toggle('active', button.dataset.value === next));
    }
    set(value);
    return { root, set };
  }

  function switchControl(value, onToggle) {
    const button = el('button', { class: 'switch', type: 'button' });
    button.classList.toggle('on', Boolean(value));
    button.addEventListener('click', () => {
      const next = !button.classList.contains('on');
      button.classList.toggle('on', next);
      onToggle(next);
    });
    return { root: button };
  }

  function mount(pane, ctx) {
    const { settings, patch, info } = ctx;

    const languageSection = section();
    const languageSelect = createSelect({
      options: LANGUAGES.map((lang) => ({ value: lang.value, label: lang.label })),
      value: settings.locale || 'zh',
      align: 'right',
      className: 'shrink-0',
      onChange: (value) => patch({ locale: value }),
    });
    languageSection.appendChild(
      row(i18n.t('settingsPage.language'), i18n.t('settingsPage.languageHint'), languageSelect.el)
    );

    const appearanceSection = section();
    const themeOptions = [
      { value: 'system', label: i18n.t('settingsPage.themeSystem') },
      { value: 'light', label: i18n.t('settingsPage.themeLight') },
      { value: 'dark', label: i18n.t('settingsPage.themeDark') },
    ];
    const themeSegment = segmented(themeOptions, settings.theme || 'system', (value) => {
      themeSegment.set(value);
      patch({ theme: value });
    });
    appearanceSection.appendChild(
      row(i18n.t('settingsPage.appearance'), i18n.t('settingsPage.appearanceHint'), themeSegment.root)
    );

    const accentControl = el('div', { class: 'flex shrink-0 items-center gap-2' });
    const swatches = ACCENT_PRESETS.map((color) => {
      const button = el('button', { class: 'swatch', type: 'button', title: color });
      button.style.background = color;
      button.addEventListener('click', () => selectAccent(color));
      accentControl.appendChild(button);
      return { color, button };
    });
    const colorInput = el('input', { type: 'color', class: 'swatch', title: i18n.t('settingsPage.accentCustom') });
    colorInput.value = settings.accent || ACCENT_PRESETS[0];
    colorInput.style.background = 'transparent';
    colorInput.addEventListener('input', () => selectAccent(colorInput.value));
    accentControl.appendChild(colorInput);

    function selectAccent(color) {
      colorInput.value = color;
      swatches.forEach(({ color: preset, button }) =>
        button.classList.toggle('active', preset.toLowerCase() === color.toLowerCase())
      );
      patch({ accent: color });
    }
    selectAccent(settings.accent || ACCENT_PRESETS[0]);

    appearanceSection.appendChild(row(i18n.t('settingsPage.accent'), i18n.t('settingsPage.accentHint'), accentControl));

    const generalSection = section();
    const loginSwitch = switchControl(settings.launchAtLogin, (value) => patch({ launchAtLogin: value }));
    generalSection.appendChild(
      row(i18n.t('settingsPage.launchAtLogin'), i18n.t('settingsPage.launchAtLoginHint'), loginSwitch.root)
    );

    // 主界面模式：悬浮（托盘弹出面板）/ 窗口（默认，独立标准窗口）。
    const floatSwitch = switchControl(settings.floatMode === true, (value) => patch({ floatMode: value }));
    generalSection.appendChild(
      row(i18n.t('settingsPage.floatMode'), i18n.t('settingsPage.floatModeHint'), floatSwitch.root)
    );

    const pinSwitch = switchControl(settings.pinWindow, (value) => patch({ pinWindow: value }));
    generalSection.appendChild(row(i18n.t('settingsPage.pin'), i18n.t('settingsPage.pinHint'), pinSwitch.root));

    const vibrancySwitch = switchControl(settings.vibrancy, (value) => patch({ vibrancy: value }));
    generalSection.appendChild(
      row(i18n.t('settingsPage.vibrancy'), i18n.t('settingsPage.vibrancyHint'), vibrancySwitch.root)
    );

    // Liquid Glass 透明度滑块（实时生效；仅在开启 Liquid Glass 时显示）。
    const defaultOpacity = window.ShipsConstants.GLASS_DEFAULT_OPACITY || 80;
    let opacityValue = Number.isFinite(Number(settings.glassOpacity)) ? Number(settings.glassOpacity) : defaultOpacity;
    const opacityLabel = el(
      'span',
      { class: 'w-[42px] shrink-0 text-right font-mono text-[11px] text-fg-muted' },
      `${opacityValue}%`
    );
    const opacitySlider = el('input', {
      type: 'range',
      min: '0',
      max: '100',
      step: '1',
      class: 'glass-slider',
    });
    opacitySlider.value = String(opacityValue);
    opacitySlider.addEventListener('input', () => {
      opacityValue = Number(opacitySlider.value);
      opacityLabel.textContent = `${opacityValue}%`;
      patch({ glassOpacity: opacityValue });
    });
    const opacityControl = el('div', { class: 'flex w-[220px] shrink-0 items-center gap-2' });
    opacityControl.append(opacitySlider, opacityLabel);
    const opacityRow = row(i18n.t('settingsPage.glassOpacity'), i18n.t('settingsPage.glassOpacityHint'), opacityControl);
    opacityRow.style.display = settings.vibrancy === true ? '' : 'none';
    generalSection.appendChild(opacityRow);

    const limitSelect = createSelect({
      options: [3, 5, 10].map((value) => ({ value, label: String(value) })),
      value: settings.clipboardLimit || 3,
      align: 'right',
      className: 'shrink-0',
      onChange: (value) => patch({ clipboardLimit: Number(value) }),
    });
    generalSection.appendChild(
      row(i18n.t('settingsPage.clipboardLimit'), i18n.t('settingsPage.clipboardLimitHint'), limitSelect.el)
    );

    const pollSelect = createSelect({
      options: [500, 800, 1000, 1200, 1500, 2000, 3000].map((value) => ({ value, label: `${value} ms` })),
      value: settings.clipboardPollMs || 1200,
      align: 'right',
      className: 'shrink-0',
      onChange: (value) => patch({ clipboardPollMs: Number(value) }),
    });
    generalSection.appendChild(
      row(i18n.t('settingsPage.clipboardPoll'), i18n.t('settingsPage.clipboardPollHint'), pollSelect.el)
    );

    const folderBtn = el('button', { class: 'btn shrink-0', type: 'button' });
    folderBtn.append(
      el('span', { class: 'inline-flex' }, Icons.folder(14)),
      el('span', {}, i18n.t('settingsPage.open'))
    );
    folderBtn.addEventListener('click', () => window.ships.openDataFolder());
    generalSection.appendChild(
      row(i18n.t('settingsPage.dataFolder'), (info && info.dataDir) || '', folderBtn)
    );

    // 一键清理「非业务数据」（窗口位置 / 大小、列宽、cd 历史等）：二次确认后执行。
    let clearingData = false;
    const clearControlWrap = el('div', { class: 'flex shrink-0 items-center gap-1' });
    function renderClearControl() {
      clearControlWrap.innerHTML = '';
      if (clearingData) {
        clearControlWrap.appendChild(
          el('span', { class: 'text-[11px] text-danger' }, i18n.t('settingsPage.clearDataConfirm'))
        );
        const yes = el('button', { class: 'icon-btn h-7 w-7', type: 'button' });
        yes.innerHTML = Icons.check(15);
        yes.style.color = 'var(--color-danger)';
        yes.addEventListener('click', () => {
          window.ships.clearData().finally(() => {
            clearingData = false;
            renderClearControl();
          });
        });
        const no = el('button', { class: 'icon-btn h-7 w-7', type: 'button' });
        no.innerHTML = Icons.x(15);
        no.addEventListener('click', () => {
          clearingData = false;
          renderClearControl();
        });
        clearControlWrap.append(yes, no);
      } else {
        const button = el('button', { class: 'btn shrink-0', type: 'button' }, i18n.t('settingsPage.clearDataAction'));
        button.addEventListener('click', () => {
          clearingData = true;
          renderClearControl();
        });
        clearControlWrap.appendChild(button);
      }
    }
    renderClearControl();
    generalSection.appendChild(
      row(i18n.t('settingsPage.clearData'), i18n.t('settingsPage.clearDataHint'), clearControlWrap)
    );

    const aboutSection = section(i18n.t('settingsPage.about'));
    aboutSection.appendChild(
      row(i18n.t('settingsPage.version'), '', el('span', { class: 'font-mono text-[12px] text-fg-muted' }, `v${(info && info.version) || ''}`))
    );

    /* 检查更新：手动触发自动更新检查（服务端弹窗提示结果）。 */
    const updateRow = el('div', {
      class: 'flex items-center justify-between gap-4 rounded-card border border-border bg-surface px-4 py-3',
    });
    const updateLeft = el('div', { class: 'min-w-0' });
    updateLeft.appendChild(el('div', { class: 'text-[13px] font-medium text-fg' }, i18n.t('settingsPage.checkUpdates')));
    const updateNote = el('div', { class: 'mt-0.5 break-all text-[11px] text-fg-muted' });
    updateLeft.appendChild(updateNote);
    const checkBtn = el('button', { class: 'btn shrink-0', type: 'button' }, i18n.t('settingsPage.check'));
    checkBtn.addEventListener('click', async () => {
      updateNote.textContent = '';
      checkBtn.disabled = true;
      try {
        const res = await window.ships.checkUpdates();
        if (res && res.checking) updateNote.textContent = i18n.t('settingsPage.checking');
        else if (res && res.ok === false) updateNote.textContent = res.message || res.error || '';
      } catch (err) {
        updateNote.textContent = String((err && err.message) || err);
      } finally {
        checkBtn.disabled = false;
      }
    });
    updateRow.append(updateLeft, checkBtn);
    aboutSection.appendChild(updateRow);

    /* 开发者模式开关：开启后才显示下方的开发者工具区，值持久化到 settings.json。 */
    const devModeSwitch = switchControl(settings.developerMode === true, (value) =>
      patch({ developerMode: value })
    );
    aboutSection.appendChild(
      row(i18n.t('settingsPage.developerMode'), i18n.t('settingsPage.developerModeHint'), devModeSwitch.root)
    );

    const devSection = section(i18n.t('settingsPage.developer'));
    function devButton(target) {
      const button = el('button', { class: 'btn shrink-0', type: 'button' }, i18n.t('settingsPage.open'));
      button.addEventListener('click', () => window.ships.openDevTools(target));
      return button;
    }
    devSection.appendChild(row(i18n.t('settingsPage.devPopover'), '', devButton('main')));
    devSection.appendChild(row(i18n.t('settingsPage.devSettings'), '', devButton('settings')));
    devSection.appendChild(row(i18n.t('settingsPage.devTerminal'), '', devButton('terminal')));
    devSection.appendChild(row(i18n.t('settingsPage.devFile'), '', devButton('file')));

    function applyDeveloperMode(on) {
      devModeSwitch.root.classList.toggle('on', on);
      devSection.style.display = on ? '' : 'none';
    }
    applyDeveloperMode(settings.developerMode === true);

    const offSettings = window.ships.onSettingsChanged((next) => {
      applyDeveloperMode(next && next.developerMode === true);
      opacityRow.style.display = next && next.vibrancy === true ? '' : 'none';
    });

    pane.append(languageSection, appearanceSection, generalSection);
    // 日志与导入 / 导出合并到「应用」分区（不再单独占导航项）。
    if (window.ShipsBackupSettings) window.ShipsBackupSettings.mount(pane, ctx);
    if (window.ShipsLogSettings) window.ShipsLogSettings.mount(pane, ctx);
    pane.append(aboutSection, devSection);

    return () => {
      if (typeof offSettings === 'function') offSettings();
    };
  }

  window.ShipsSettingsRegistry.register({
    id: 'ships',
    icon: 'gear',
    labelKey: 'settingsPage.ships',
    mount,
  });
})();
