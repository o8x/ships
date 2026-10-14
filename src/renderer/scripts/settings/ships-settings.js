'use strict';

(function registerShipsSettings() {
  const { Icons, el, section, createSelect } = window.ShipsUI;
  const i18n = window.ShipsI18n;
  const { ACCENT_PRESETS, LANGUAGES } = window.ShipsConstants;

  i18n.extend({
    zh: {
      settingsPage: {
        title: '设置',
        ships: 'Ships 设置',
        ssh: 'SSH 管理',
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
        launchAtLoginHint: '登录时自动启动 Ships',
        pin: '固定悬浮',
        pinHint: '主界面置顶常驻，失焦不自动隐藏',
        vibrancy: 'Liquid Glass',
        vibrancyHint: '主界面使用 macOS 原生 Liquid Glass 背景（macOS 26+，旧系统回退毛玻璃）',
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
        ships: 'Ships',
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
        launchAtLoginHint: 'Start Ships when you log in',
        pin: 'Keep on top',
        pinHint: 'Pin the popover and never auto-hide on blur',
        vibrancy: 'Liquid Glass',
        vibrancyHint: 'Use the native macOS Liquid Glass background (macOS 26+, with fallback)',
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
      className: 'w-[140px] shrink-0',
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

    const pinSwitch = switchControl(settings.pinWindow, (value) => patch({ pinWindow: value }));
    generalSection.appendChild(row(i18n.t('settingsPage.pin'), i18n.t('settingsPage.pinHint'), pinSwitch.root));

    const vibrancySwitch = switchControl(settings.vibrancy, (value) => patch({ vibrancy: value }));
    generalSection.appendChild(
      row(i18n.t('settingsPage.vibrancy'), i18n.t('settingsPage.vibrancyHint'), vibrancySwitch.root)
    );

    const limitSelect = createSelect({
      options: [3, 5, 10].map((value) => ({ value, label: String(value) })),
      value: settings.clipboardLimit || 3,
      align: 'right',
      className: 'w-[100px] shrink-0',
      onChange: (value) => patch({ clipboardLimit: Number(value) }),
    });
    generalSection.appendChild(
      row(i18n.t('settingsPage.clipboardLimit'), i18n.t('settingsPage.clipboardLimitHint'), limitSelect.el)
    );

    const pollSelect = createSelect({
      options: [500, 800, 1000, 1200, 1500, 2000, 3000].map((value) => ({ value, label: `${value} ms` })),
      value: settings.clipboardPollMs || 1200,
      align: 'right',
      className: 'w-[110px] shrink-0',
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

    pane.append(languageSection, appearanceSection, generalSection, aboutSection, devSection);
  }

  window.ShipsSettingsRegistry.register({
    id: 'ships',
    icon: 'gear',
    labelKey: 'settingsPage.ships',
    mount,
  });
})();
