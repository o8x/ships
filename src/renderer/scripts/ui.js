'use strict';

window.ShipsUI = (function createUI() {
  // SVG markup is loaded from assets/icons at startup (exposed by the preload
  // as window.shipsIcons); icons are sized by injecting width/height.
  const sources = window.shipsIcons || {};

  const Icons = {};
  for (const name of Object.keys(sources)) {
    Icons[name] = (size) => {
      const s = size || 20;
      return sources[name].replace('<svg', `<svg width="${s}" height="${s}"`);
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
