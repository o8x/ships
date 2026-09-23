'use strict';

window.ShipsUI = (function createUI() {
  function svg(inner, size) {
    const s = size || 20;
    return (
      `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" ` +
      `stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ` +
      `stroke-linejoin="round" aria-hidden="true">${inner}</svg>`
    );
  }

  const paths = {
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 1.8"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18-2.5-2.6-2.5-15.4 0-18Z"/>',
    layers: '<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="M3 13l9 5 9-5"/>',
    hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
    code: '<path d="m9 8-4 4 4 4M15 8l4 4-4 4"/>',
    braces: '<path d="M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1"/><path d="M16 3h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1"/>',
    terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    check: '<path d="m5 12 5 5L20 7"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
    trash: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    plug: '<path d="M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-5 5 5 5 0 0 1-5-5V8ZM12 16v6"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
    input: '<path d="M4 7V5h16v2M9 19h6M12 5v14"/>',
    folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    power: '<path d="M12 3v9M7.5 6.5a8 8 0 1 0 9 0"/>',
    triangle: '<path d="M12 4 3 20h18L12 4Z"/>',
    circle: '<circle cx="12" cy="12" r="9"/>',
    play: '<path d="M7 5v14l11-7Z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    arrowLeft: '<path d="m15 6-6 6 6 6"/>',
    arrowRight: '<path d="m9 6 6 6-6 6"/>',
    language: '<path d="M4 5h9M8.5 5c0 5-2.5 9-5 11M6 11c1.8 3.2 4.5 5.3 7.5 6.5M14 20l4.5-11L23 20M15.8 16h5.4"/>',
    swatch: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18"/>',
    rocket: '<path d="M5 15c-1.5 1.5-2 6-2 6s4.5-.5 6-2M9 18l-3-3M14.5 4.5C17 2 21 2 22 2s0 5-2.5 7.5L14 15l-5-5 5.5-5.5ZM14 10l-1-1"/>',
    wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01"/>',
    command: '<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>',
    windows: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
    server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  };

  const Icons = {};
  for (const name of Object.keys(paths)) {
    Icons[name] = (size) => svg(paths[name], size);
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
    const wrap = el('section', { class: 'mb-4' });
    if (titleText) wrap.appendChild(el('h2', { class: 'tool-title' }, titleText));
    return wrap;
  }

  function inputField(labelText, inputEl) {
    const wrap = el('label', { class: 'mb-2 block' });
    if (labelText) wrap.appendChild(el('span', { class: 'tool-label' }, labelText));
    wrap.appendChild(inputEl);
    return wrap;
  }

  function resultRow(labelText, opts) {
    const options = opts || {};
    const root = el('div', {
      class:
        'mb-1.5 flex items-center justify-between gap-2 rounded-card border border-border bg-surface px-2.5 py-1.5',
    });
    const left = el('div', { class: 'min-w-0 flex-1' });
    left.appendChild(el('div', { class: 'text-[10px] uppercase tracking-wide text-fg-muted' }, labelText));
    const value = el('div', { class: options.mono === false ? 'text-[13px] break-all' : 'result-value' }, '—');
    left.appendChild(value);

    const button = el('button', { class: 'icon-btn h-6 w-6 shrink-0', type: 'button', title: '' });
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

  return { Icons, escapeHtml, el, debounce, copyText, section, inputField, resultRow, field };
})();
