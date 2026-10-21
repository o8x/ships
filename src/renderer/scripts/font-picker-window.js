'use strict';

(function initFontPickerWindow() {
  const { el } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      fontPicker: {
        title: '选择字体',
        search: '搜索字体…',
        preview: 'Aa 你好 Vessel 0123',
        cancel: '取消',
        apply: '使用',
        empty: '没有匹配的字体',
        loadFailed: '无法读取系统字体列表',
        default: '系统默认',
        mono: '等宽',
      },
    },
    en: {
      fontPicker: {
        title: 'Choose font',
        search: 'Search fonts…',
        preview: 'Aa Hello Vessel 0123',
        cancel: 'Cancel',
        apply: 'Use',
        empty: 'No matching fonts',
        loadFailed: 'Could not load the system font list',
        default: 'System default',
        mono: 'Mono',
      },
    },
  });

  const titleEl = document.getElementById('font-picker-title');
  const preview = document.getElementById('font-picker-preview');
  const search = document.getElementById('font-picker-search');
  const list = document.getElementById('font-picker-list');
  const cancelBtn = document.getElementById('font-picker-cancel');
  const applyBtn = document.getElementById('font-picker-apply');

  const empty = el('div', { class: 'font-picker-empty' }, '');
  let rows = [];
  let selected = '';

  function cssFontFamily(family) {
    const name = String(family || '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
    return name ? `"${name}", monospace` : 'inherit';
  }

  function select(family) {
    selected = family || '';
    preview.style.fontFamily = cssFontFamily(selected);
    for (const row of rows) {
      row.classList.toggle('active', (row.dataset.family || '') === selected);
    }
  }

  function makeRow(entry) {
    const family = entry.family || '';
    const row = el('button', { class: 'font-picker-row', type: 'button' });
    const name = el('span', { class: 'font-picker-name' }, entry.label || family);
    name.style.fontFamily = cssFontFamily(family);
    row.appendChild(name);
    if (entry.mono && family) {
      row.appendChild(el('span', { class: 'font-picker-badge' }, i18n.t('fontPicker.mono')));
    }
    row.dataset.family = family;
    row.dataset.mono = entry.mono && family ? '1' : '0';
    row.addEventListener('click', () => select(family));
    row.addEventListener('dblclick', () => {
      select(family);
      apply();
    });
    rows.push(row);
    list.appendChild(row);
    return row;
  }

  function filter() {
    const query = search.value.trim().toLowerCase();
    let visible = 0;
    for (const row of rows) {
      const match = !query || row.dataset.family.toLowerCase().includes(query);
      row.hidden = !match;
      if (match) visible += 1;
    }
    // 分割线只在两侧都还有可见条目时显示（等宽组 / 非等宽组）。
    for (const divider of list.querySelectorAll('.font-picker-divider')) {
      let above = false;
      let below = false;
      let node = divider.previousElementSibling;
      while (node) {
        if (node.classList.contains('font-picker-row') && !node.hidden && node.dataset.mono === '1') {
          above = true;
          break;
        }
        node = node.previousElementSibling;
      }
      node = divider.nextElementSibling;
      while (node) {
        if (node.classList.contains('font-picker-row') && !node.hidden && node.dataset.mono === '0') {
          below = true;
          break;
        }
        node = node.nextElementSibling;
      }
      divider.hidden = !(above && below);
    }
    empty.hidden = visible > 0;
  }

  function close() {
    window.ships.closeFontPicker();
  }

  async function apply() {
    await window.ships.setSettings({ terminalFontFamily: selected });
    close();
  }

  async function boot() {
    const settings = await window.ships.getSettings();
    i18n.setLocale((settings && settings.locale) || 'zh');
    window.ShipsTheme.set(settings || {});

    titleEl.textContent = i18n.t('fontPicker.title');
    preview.textContent = i18n.t('fontPicker.preview');
    search.placeholder = i18n.t('fontPicker.search');
    cancelBtn.textContent = i18n.t('fontPicker.cancel');
    applyBtn.textContent = i18n.t('fontPicker.apply');
    empty.textContent = i18n.t('fontPicker.empty');
    empty.hidden = true;

    selected = String((settings && settings.terminalFontFamily) || '');
    preview.style.fontFamily = cssFontFamily(selected);
    makeRow({ family: '', label: i18n.t('fontPicker.default') });

    const result = await window.ships.listFonts();
    if (!result || !result.ok) {
      empty.textContent = i18n.t('fontPicker.loadFailed');
      empty.hidden = false;
      list.appendChild(empty);
      return;
    }

    let previousMono = null;
    for (const font of result.fonts || []) {
      if (previousMono === true && font.mono !== true) {
        list.appendChild(el('div', { class: 'font-picker-divider' }));
      }
      makeRow(font);
      previousMono = font.mono === true;
    }
    list.appendChild(empty);
    select(selected);
    const active = rows.find((row) => row.dataset.family === selected);
    if (active) active.scrollIntoView({ block: 'center' });
    search.focus();
  }

  search.addEventListener('input', filter);
  cancelBtn.addEventListener('click', close);
  applyBtn.addEventListener('click', apply);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Enter' && document.activeElement === search) {
      event.preventDefault();
      apply();
    }
  });

  boot().catch((err) => {
    empty.textContent = i18n.t('fontPicker.loadFailed');
    empty.hidden = false;
    list.appendChild(empty);
    console.error(err);
  });
})();
