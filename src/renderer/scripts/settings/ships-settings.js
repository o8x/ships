'use strict';

(function registerShipsSettings() {
  const { Icons, el, section, createSelect } = window.ShipsUI;
  const i18n = window.ShipsI18n;
  const { ACCENT_PRESETS, LANGUAGES } = window.ShipsConstants;

  i18n.extend({
    zh: {
      settingsPage: {
        title: '设置',
        ships: '⚙️ Ships 设置',
        ssh: '🖥 SSH 管理',
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
        dataFolder: '数据文件夹',
        open: '打开',
        about: '关于',
        version: '版本',
      },
    },
    en: {
      settingsPage: {
        title: 'Settings',
        ships: '⚙️ Ships',
        ssh: '🖥 SSH',
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
        dataFolder: 'Data folder',
        open: 'Open',
        about: 'About',
        version: 'Version',
      },
    },
  });

  function row(labelText, hintText, control) {
    const root = el('div', {
      class: 'mb-2 flex items-center justify-between gap-4 rounded-card border border-border bg-surface px-4 py-3',
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
    const themeSegment = segmented(themeOptions, settings.theme || 'system', (value) => patch({ theme: value }));
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

    const folderBtn = el('button', { class: 'btn shrink-0', type: 'button' });
    folderBtn.append(
      el('span', { class: 'inline-flex' }, Icons.folder(14)),
      el('span', {}, i18n.t('settingsPage.open'))
    );
    folderBtn.addEventListener('click', () => window.ships.openDataFolder());
    generalSection.appendChild(
      row(i18n.t('settingsPage.dataFolder'), (info && info.dataDir) || '', folderBtn)
    );

    const aboutSection = section(i18n.t('settingsPage.about'));
    aboutSection.appendChild(
      row(i18n.t('settingsPage.version'), '', el('span', { class: 'font-mono text-[12px] text-fg-muted' }, `v${(info && info.version) || ''}`))
    );

    pane.append(languageSection, appearanceSection, generalSection, aboutSection);
  }

  window.ShipsSettingsRegistry.register({
    id: 'ships',
    icon: 'gear',
    labelKey: 'settingsPage.ships',
    mount,
  });
})();
