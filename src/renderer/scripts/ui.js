'use strict';

window.ShipsUI = (function createUI() {
  // SVG markup is loaded from assets/icons at startup (exposed by the preload
  // as window.shipsIcons); icons are sized by injecting width/height.
  const sources = window.shipsIcons || {};

  const Icons = {};
  for (const name of Object.keys(sources)) {
    Icons[name] = (size) => {
      const s = size || 20;
      const source = sources[name];
      const rootTag = source.match(/<svg\b[^>]*>/i);
      if (!rootTag) return source;
      const cleaned = rootTag[0].replace(/\s(width|height)="[^"]*"/gi, '');
      const sized = cleaned.replace('<svg', `<svg width="${s}" height="${s}"`);
      return source.replace(rootTag[0], sized);
    };
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function el(tag, attrs, html) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const key of Object.keys(attrs)) {
        if (key === 'class') node.className = attrs[key];
        else if (key === 'dataset') Object.assign(node.dataset, attrs[key]);
        else if (key.startsWith('on') && typeof attrs[key] === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), attrs[key]);
        } else if (attrs[key] != null) node.setAttribute(key, attrs[key]);
      }
    }
    if (html != null) node.innerHTML = html;
    return node;
  }

  function section(titleText) {
    const wrap = el('section', { class: 'section' });
    if (titleText) wrap.appendChild(el('h2', { class: 'tool-title' }, titleText));
    return wrap;
  }

  function inputField(labelText, inputEl) {
    const wrap = el('label', { class: 'block' });
    if (labelText) wrap.appendChild(el('span', { class: 'tool-label' }, labelText));
    wrap.appendChild(inputEl);
    return wrap;
  }

  function resultRow(labelText, opts) {
    const options = opts || {};
    const root = el('div', {
      class:
        'flex items-center justify-between gap-2 rounded-card border border-border bg-surface px-2.5 py-1.5',
    });
    const left = el('div', { class: 'min-w-0 flex-1' });
    left.appendChild(el('div', { class: 'text-[10px] uppercase tracking-wide text-fg-muted' }, labelText));
    const value = el('div', { class: options.mono === false ? 'text-[13px] break-all' : 'result-value' }, '—');
    left.appendChild(value);

    const button = el('button', {
      class: 'icon-btn h-6 w-6 shrink-0',
      type: 'button',
      'data-tip': (window.ShipsI18n && window.ShipsI18n.t('common.copy')) || 'Copy',
    });
    button.innerHTML = Icons.copy(14);
    button.style.visibility = 'hidden';
    button.addEventListener('click', async () => {
      const raw = value.dataset.raw || value.textContent;
      const ok = await copyText(raw);
      if (!ok) return;
      button.innerHTML = Icons.check(14);
      button.style.color = 'var(--color-success)';
      setTimeout(() => {
        button.innerHTML = Icons.copy(14);
        button.style.color = '';
      }, COPY_FEEDBACK_MS);
    });

    root.append(left, button);
    return {
      root,
      set(text) {
        const empty = text == null || text === '';
        value.textContent = empty ? '—' : String(text);
        value.dataset.raw = empty ? '' : String(text);
        button.style.visibility = empty ? 'hidden' : 'visible';
      },
      setRaw(text, display) {
        const empty = text == null || text === '';
        value.textContent = empty ? '—' : display == null ? String(text) : display;
        value.dataset.raw = empty ? '' : String(text);
        button.style.visibility = empty ? 'hidden' : 'visible';
      },
    };
  }

  function field(labelText, attrs) {
    const input = el('input', Object.assign({ class: 'field', type: 'text', spellcheck: 'false' }, attrs || {}));
    return { input, wrapper: inputField(labelText, input) };
  }

  const COPY_FEEDBACK_MS = (window.ShipsConstants && window.ShipsConstants.COPY_FEEDBACK_MS) || 1200;

  function debounce(fn, wait) {
    let timer = null;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      return false;
    }
  }

  const OS_BRAND_ICON = {
    ubuntu: 'ubuntu',
    debian: 'debian',
    fedora: 'fedora',
    arch: 'arch',
    centos: 'centos',
    rhel: 'RHEL',
    redhat: 'RHEL',
    'red-hat': 'RHEL',
    rocky: 'rocky',
    linuxmint: 'mint',
    mint: 'mint',
    opensuse: 'opensuse',
    'opensuse-leap': 'opensuse',
    'opensuse-tumbleweed': 'opensuse',
    macos: 'command',
    windows: 'windows',
    linux: 'linux',
  };
  const OS_FAMILY_ICON = { macos: 'command', linux: 'terminal', windows: 'windows', bsd: 'server', unknown: 'server' };
  const OS_FAMILY_COLOR = {
    macos: '#8e8e93',
    linux: '#e95420',
    windows: '#0a84ff',
    bsd: '#e5484d',
    unknown: 'var(--color-fg-muted)',
  };
  const OS_LEGACY_FAMILY = { macos: 'macos', linux: 'linux', windows: 'windows', bsd: 'bsd' };

  // Shared OS icon mapping for a detection result (brand icon when known).
  function osIconInfo(detected) {
    if (!detected) return { name: 'server', color: 'var(--color-fg-muted)' };
    const brand = OS_BRAND_ICON[detected.os];
    if (brand && Icons[brand]) {
      return { name: brand, color: detected.os === 'macos' ? '#8e8e93' : '' };
    }
    const family = detected.family || OS_LEGACY_FAMILY[detected.os] || 'unknown';
    return { name: OS_FAMILY_ICON[family] || 'server', color: OS_FAMILY_COLOR[family] || 'var(--color-fg-muted)' };
  }

  function flagHtml(code, opts) {
    const options = opts || {};
    if (!code || !window.shipsFlags) return '';
    const svg = window.shipsFlags.get(code, options.shape || 'rect');
    if (!svg) return '';
    const size = options.size || 16;
    const width = options.shape === '1x1' ? size : Math.round(size * 1.333);
    return svg.replace(
      '<svg',
      `<svg width="${width}" height="${size}" class="${options.class || ''}" style="border-radius:var(--radius-xs)" `
    );
  }

  /* Geo info row: flag + country/province/city + ISP. Fixed height. */
  function createGeoRow() {
    const root = el('div', { class: 'row-card min-h-[56px]' });
    const flag = el('span', { class: 'inline-flex w-[24px] shrink-0 justify-center' });
    const text = el('div', { class: 'min-w-0 flex-1' });
    const main = el('div', { class: 'truncate text-[13px] text-fg' }, '—');
    const sub = el('div', { class: 'truncate text-[10px] text-fg-muted' }, '-');
    text.append(main, sub);
    root.append(flag, text);
    return {
      root,
      set(info) {
        if (!info) {
          flag.innerHTML = '';
          main.textContent = '—';
          sub.textContent = '-';
          return;
        }
        flag.innerHTML = flagHtml(info.iso_3166, { size: 18 });
        const place = [info.country, info.province, info.city].filter(Boolean).join(' · ');
        main.textContent = place || info.isp || '—';
        sub.textContent = place && info.isp ? info.isp : '-';
      },
    };
  }

  /* Self-drawn segmented control (single row TAB switch).
     Options: { value, label, tip?, disabled? }; config: { className }.
     `setOptions` re-renders in place so labels / disabled states can follow app state. */
  function segmented(options, value, onSelect, config) {
    const settings = Object.assign({ className: '' }, config || {});
    const root = el('div', { class: `segment shrink-0 ${settings.className}`.trim() });
    let items = (options || []).slice();
    let buttons = [];
    let current = value;

    function set(next) {
      current = next;
      buttons.forEach((button) =>
        button.classList.toggle('active', String(button.dataset.value) === String(next))
      );
    }

    function build() {
      root.innerHTML = '';
      buttons = items.map((option) => {
        const button = el('button', {
          type: 'button',
          class: 'shrink-0',
          dataset: { value: option.value },
        }, option.label);
        if (option.tip) button.setAttribute('data-tip', option.tip);
        if (option.disabled) {
          button.disabled = true;
        } else {
          button.addEventListener('click', () => {
            set(option.value);
            onSelect(option.value);
          });
        }
        root.appendChild(button);
        return button;
      });
      set(current);
    }

    build();
    return {
      root,
      set,
      getValue: () => current,
      setOptions(next) {
        items = (next || []).slice();
        build();
      },
    };
  }

  /* Custom select (self-drawn, avoids native <select>). */
  function createSelect(config) {
    const options = { onChange: () => {}, className: '', menuClassName: '', align: 'left', matchTrigger: false };
    Object.assign(options, config || {});
    let items = (options.options || []).slice();
    let current = options.value;
    let menu = null;

    const label = el('span', { class: 'select-label' }, '');
    const chevron = el('span', { class: 'select-chevron inline-flex' }, Icons.chevronDown(14));
    const trigger = el('button', { type: 'button', class: `select-trigger ${options.className}` });
    trigger.append(label, chevron);

    function currentItem() {
      return items.find((item) => String(item.value) === String(current));
    }

    function syncLabel() {
      const item = currentItem();
      label.textContent = '';
      if (item) {
        if (item.icon) {
          const iconWrap = el('span', { class: 'select-option-icon inline-flex' });
          iconWrap.innerHTML = item.icon;
          label.appendChild(iconWrap);
        }
        if (item.label) label.appendChild(el('span', { class: 'truncate' }, item.label));
      }
      if (menu) {
        Array.from(menu.children).forEach((node) =>
          node.classList.toggle('active', String(node.dataset.value) === String(current))
        );
      }
    }

    function close() {
      if (menu) {
        menu.remove();
        menu = null;
        trigger.classList.remove('open');
        document.removeEventListener('mousedown', onDocDown, true);
        window.removeEventListener('resize', close);
        window.removeEventListener('scroll', onScroll, true);
      }
    }

    function onDocDown(event) {
      if (menu && !menu.contains(event.target) && !trigger.contains(event.target)) close();
    }

    // 只有「菜单外部」的滚动才关闭菜单；在菜单里滚轮翻看选项不应关闭。
    function onScroll(event) {
      if (menu && event.target && (event.target === menu || menu.contains(event.target))) return;
      close();
    }

    function open() {
      if (menu) return;
      menu = el('div', { class: `select-menu ${options.menuClassName || ''}` });
      for (const item of items) {
        const opt = el('button', { type: 'button', class: 'select-option', dataset: { value: item.value } });
        if (item.icon) {
          const iconWrap = el('span', { class: 'select-option-icon inline-flex' });
          iconWrap.innerHTML = item.icon;
          opt.appendChild(iconWrap);
        }
        if (item.label) opt.appendChild(el('span', { class: 'select-option-label truncate' }, item.label));
        if (String(item.value) === String(current)) opt.appendChild(el('span', { class: 'inline-flex' }, Icons.check(14)));
        opt.addEventListener('click', () => {
          current = item.value;
          syncLabel();
          close();
          options.onChange(item.value);
        });
        menu.appendChild(opt);
      }
      document.body.appendChild(menu);
      trigger.classList.add('open');

      const rect = trigger.getBoundingClientRect();
      // 头栏 SSH 下拉：菜单宽度严格等于触发器宽度，保证与本体左右对齐。
      if (options.matchTrigger) {
        menu.style.width = `${rect.width}px`;
        menu.style.minWidth = `${rect.width}px`;
        menu.style.maxWidth = `${rect.width}px`;
      }
      // 用 offsetWidth/Height（不受入场动画 transform 影响，getBoundingClientRect 会被 scale 影响）。
      const menuWidth = menu.offsetWidth;
      const menuHeight = menu.offsetHeight;
      // matchTrigger：菜单与触发器同宽且左边缘对齐（不受 align 影响）。
      let left = options.matchTrigger
        ? rect.left
        : options.align === 'right'
          ? rect.right - menuWidth
          : rect.left;
      left = Math.max(6, Math.min(left, window.innerWidth - menuWidth - 6));
      let top = rect.bottom + 4;
      if (top + menuHeight > window.innerHeight - 6) {
        top = Math.max(6, rect.top - menuHeight - 4);
      }
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;

      document.addEventListener('mousedown', onDocDown, true);
      window.addEventListener('resize', close);
      window.addEventListener('scroll', onScroll, true);
    }

    trigger.addEventListener('click', () => (menu ? close() : open()));

    syncLabel();

    return {
      el: trigger,
      getValue: () => current,
      setValue(value) {
        current = value;
        syncLabel();
      },
      setOptions(next) {
        items = next.slice();
        syncLabel();
      },
      close,
    };
  }

  /* Lightweight self-drawn tooltip for elements with [data-tip]. */
  function initTooltips() {
    const tip = el('div', { class: 'ships-tip' }, '');
    document.body.appendChild(tip);
    let target = null;
    let showTimer = null;
    let hideTimer = null;

    function position(node) {
      const rect = node.getBoundingClientRect();
      const tipRect = tip.getBoundingClientRect();
      let left = rect.left + rect.width / 2 - tipRect.width / 2;
      left = Math.max(6, Math.min(left, window.innerWidth - tipRect.width - 6));
      let top = rect.bottom + 6;
      if (top + tipRect.height > window.innerHeight - 6) top = rect.top - tipRect.height - 6;
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    }

    function show(node) {
      const text = node.getAttribute('data-tip');
      if (!text) return;
      target = node;
      tip.textContent = text;
      position(node);
      tip.classList.add('visible');
    }

    function hide() {
      target = null;
      tip.classList.remove('visible');
    }

    // Delays avoid flicker when the pointer moves between adjacent icons.
    function onOver(event) {
      const node = event.target.closest && event.target.closest('[data-tip]');
      if (!node) return;
      clearTimeout(hideTimer);
      if (node === target) return;
      clearTimeout(showTimer);
      showTimer = setTimeout(() => show(node), 60);
    }

    function onOut(event) {
      const node = event.target.closest && event.target.closest('[data-tip]');
      if (!node) return;
      if (event.relatedTarget && node.contains(event.relatedTarget)) return;
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, 80);
    }

    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerout', onOut);
    window.addEventListener(
      'scroll',
      () => {
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
        hide();
      },
      true
    );
  }

  initTooltips();

  return {
    Icons,
    escapeHtml,
    el,
    debounce,
    copyText,
    section,
    inputField,
    resultRow,
    field,
    flagHtml,
    osIconInfo,
    createGeoRow,
    createSelect,
    segmented,
    initTooltips,
  };
})();
