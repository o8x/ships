'use strict';

(function registerJsonTool() {
  const { el, section, debounce, copyText, escapeHtml, Icons, createSelect } = window.ShipsUI;
  const i18n = window.ShipsI18n;
  const MAX_HIGHLIGHT = (window.ShipsConstants && window.ShipsConstants.JSON_HIGHLIGHT_MAX_BYTES) || 1048576;

  i18n.extend({
    zh: {
      json: {
        hint: '📋 粘贴 JSON 自动原地格式化',
        indent: '缩进',
        indent2: '2 空格',
        indent4: '4 空格',
        indentTab: 'Tab',
        sortKeys: '键排序',
        minify: '压缩',
        clear: '清空',
        copy: '复制',
        viewText: '文本',
        viewTree: '结构',
        empty: '粘贴或输入 JSON，自动格式化并高亮',
        emptyTree: '输入 JSON 后在此查看结构',
        invalid: 'JSON 无效',
        tooLarge: '内容超过 1MB，仅格式化不高亮',
        stats: '{lines} 行 · {bytes} 字节 · 深度 {depth}',
        copied: '已复制',
      },
    },
    en: {
      json: {
        hint: '📋 Paste JSON to format in place',
        indent: 'Indent',
        indent2: '2 spaces',
        indent4: '4 spaces',
        indentTab: 'Tab',
        sortKeys: 'Sort keys',
        minify: 'Minify',
        clear: 'Clear',
        copy: 'Copy',
        viewText: 'Text',
        viewTree: 'Tree',
        empty: 'Paste or type JSON to format and highlight',
        emptyTree: 'Type JSON to explore its structure',
        invalid: 'Invalid JSON',
        tooLarge: 'Over 1MB — formatted without highlighting',
        stats: '{lines} lines · {bytes} bytes · depth {depth}',
        copied: 'Copied',
      },
    },
  });

  function highlightJson(json) {
    const regex =
      /("(?:\\.|[^"\\])*")(\s*:)?|(\btrue\b|\bfalse\b|\bnull\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
    let result = '';
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(json)) !== null) {
      result += escapeHtml(json.slice(lastIndex, match.index));
      if (match[1] !== undefined) {
        const cls = match[2] ? 'key' : 'str';
        result += `<span class="json-${cls}">${escapeHtml(match[1])}</span>`;
        if (match[2]) result += escapeHtml(match[2]);
      } else if (match[3] !== undefined) {
        result += `<span class="json-${match[3] === 'null' ? 'null' : 'bool'}">${match[3]}</span>`;
      } else {
        result += `<span class="json-num">${match[4]}</span>`;
      }
      lastIndex = regex.lastIndex;
    }
    result += escapeHtml(json.slice(lastIndex));
    return result;
  }

  function sortDeep(value) {
    if (Array.isArray(value)) return value.map(sortDeep);
    if (value && typeof value === 'object') {
      const out = {};
      for (const key of Object.keys(value).sort()) out[key] = sortDeep(value[key]);
      return out;
    }
    return value;
  }

  function errorPosition(message) {
    const match = /position (\d+)/.exec(message);
    return match ? Number(match[1]) : null;
  }

  function jsonDepth(value, depth) {
    const d = depth || 0;
    if (Array.isArray(value)) {
      if (!value.length) return d + 1;
      return Math.max(...value.map((item) => jsonDepth(item, d + 1)));
    }
    if (value && typeof value === 'object') {
      const keys = Object.keys(value);
      if (!keys.length) return d + 1;
      return Math.max(...keys.map((key) => jsonDepth(value[key], d + 1)));
    }
    return d;
  }

  function mount(container) {
    const hint = el('div', { class: 'mb-3 text-[11px] text-fg-muted' }, i18n.t('json.hint'));

    const state = { view: 'text', tooLarge: false };

    // ---- toolbar ----
    const toolbar = el('div', { class: 'mb-2 flex flex-col gap-2' });
    const indentSelect = createSelect({
      options: [
        { value: '2', label: i18n.t('json.indent2') },
        { value: '4', label: i18n.t('json.indent4') },
        { value: 'tab', label: i18n.t('json.indentTab') },
      ],
      value: '4',
      className: 'w-[104px] shrink-0',
      onChange: () => scheduleFormat(),
    });
    const sortLabel = el('label', { class: 'chip shrink-0 cursor-pointer select-none' });
    const sortCheckbox = el('input', { type: 'checkbox', class: 'accent-[var(--color-accent)]' });
    sortLabel.append(sortCheckbox, el('span', {}, i18n.t('json.sortKeys')));

    const viewSegment = el('div', { class: 'segment shrink-0' });
    const viewButtons = {};
    for (const view of ['text', 'tree']) {
      const button = el(
        'button',
        { type: 'button', 'data-tip': view === 'text' ? i18n.t('json.viewText') : i18n.t('json.viewTree') },
        view === 'text' ? i18n.t('json.viewText') : i18n.t('json.viewTree')
      );
      button.addEventListener('click', () => setView(view));
      viewButtons[view] = button;
      viewSegment.appendChild(button);
    }

    const spacer = el('div', { class: 'flex-1' });
    const copyBtn = el('button', { class: 'icon-btn h-7 w-7 shrink-0', type: 'button', 'data-tip': i18n.t('json.copy') });
    copyBtn.innerHTML = Icons.copy(15);
    const minifyBtn = el('button', { class: 'icon-btn h-7 w-7 shrink-0', type: 'button', 'data-tip': i18n.t('json.minify') });
    minifyBtn.innerHTML = Icons.minimize(15);
    const clearBtn = el('button', { class: 'icon-btn h-7 w-7 shrink-0', type: 'button', 'data-tip': i18n.t('json.clear') });
    clearBtn.innerHTML = Icons.x(15);

    const row1 = el('div', { class: 'flex items-center gap-2' });
    row1.append(viewSegment, spacer, copyBtn, minifyBtn, clearBtn);
    const row2 = el('div', { class: 'flex items-center gap-2' });
    row2.append(indentSelect.el, sortLabel);
    toolbar.append(row1, row2);

    // ---- text editor (overlay highlight) ----
    const editor = el('div', { class: 'json-editor' });
    const pre = el('pre', { class: 'json-editor-highlight', 'aria-hidden': 'true' });
    const code = el('code', {});
    pre.appendChild(code);
    const textarea = el('textarea', {
      class: 'json-editor-input',
      spellcheck: 'false',
      placeholder: '{ "hello": "world" }',
    });
    editor.append(pre, textarea);

    // ---- tree view ----
    const tree = el('div', { class: 'json-tree select-text hidden' });

    const status = el('div', { class: 'mt-2 text-[11px] text-fg-muted' }, i18n.t('json.empty'));

    container.append(hint, toolbar, editor, tree, status);

    let currentText = '';

    function setView(view) {
      state.view = view;
      viewButtons.text.classList.toggle('active', view === 'text');
      viewButtons.tree.classList.toggle('active', view === 'tree');
      editor.classList.toggle('hidden', view !== 'text');
      tree.classList.toggle('hidden', view !== 'tree');
      if (view === 'tree') renderTree();
    }

    function highlight() {
      const value = textarea.value;
      if (!value) {
        code.innerHTML = '';
        return;
      }
      if (state.tooLarge) {
        code.innerHTML = '';
        return;
      }
      code.innerHTML = highlightJson(value);
    }

    function syncScroll() {
      pre.scrollTop = textarea.scrollTop;
      pre.scrollLeft = textarea.scrollLeft;
    }

    function parse() {
      const raw = textarea.value.trim();
      if (!raw) return { empty: true };
      try {
        return { value: JSON.parse(raw), raw };
      } catch (err) {
        const pos = errorPosition(err.message);
        let suffix = '';
        if (pos != null) {
          const before = textarea.value.slice(0, pos);
          suffix = ` (${before.split('\n').length}:${pos - before.lastIndexOf('\n')})`;
        }
        return { error: `${i18n.t('json.invalid')}: ${err.message.replace(/ in JSON at position \d+/, '')}${suffix}` };
      }
    }

    function statsText(value) {
      const bytes = new TextEncoder().encode(textarea.value).length;
      return i18n.t('json.stats', {
        lines: textarea.value.split('\n').length,
        bytes,
        depth: jsonDepth(value),
      });
    }

    function refreshStatus() {
      const parsed = parse();
      if (parsed.empty) {
        status.textContent = i18n.t('json.empty');
        status.style.color = '';
        return;
      }
      if (parsed.error) {
        status.textContent = parsed.error;
        status.style.color = 'var(--color-danger)';
        return;
      }
      status.style.color = '';
      status.textContent = state.tooLarge
        ? `${statsText(parsed.value)} · ${i18n.t('json.tooLarge')}`
        : statsText(parsed.value);
    }

    function applyText(text, keepCursor) {
      const selectionStart = textarea.selectionStart;
      textarea.value = text;
      currentText = text;
      state.tooLarge = new TextEncoder().encode(text).length > MAX_HIGHLIGHT;
      editor.classList.toggle('no-highlight', state.tooLarge);
      if (keepCursor && text.length > selectionStart) {
        textarea.selectionStart = textarea.selectionEnd = Math.min(selectionStart, text.length);
      }
      highlight();
      syncScroll();
      refreshStatus();
      if (state.view === 'tree') renderTree();
    }

    function formatNow() {
      const parsed = parse();
      if (parsed.empty || parsed.error) {
        highlight();
        refreshStatus();
        return;
      }
      const value = sortCheckbox.checked ? sortDeep(parsed.value) : parsed.value;
      const indentValue = indentSelect.getValue();
      const indent = indentValue === 'tab' ? '\t' : Number(indentValue);
      applyText(JSON.stringify(value, null, indent), false);
    }

    const scheduleFormat = debounce(formatNow, 150);

    function renderTree() {
      tree.innerHTML = '';
      const parsed = parse();
      if (parsed.empty || parsed.error) {
        tree.appendChild(el('div', { class: 'p-4 text-[12px] text-fg-muted' }, i18n.t('json.emptyTree')));
        return;
      }
      tree.appendChild(buildNode('', parsed.value, 0, true));
    }

    function preview(value) {
      if (Array.isArray(value)) return `[…] ${value.length}`;
      if (value && typeof value === 'object') return `{…} ${Object.keys(value).length}`;
      return '';
    }

    function leafValue(value) {
      if (value === null) return { cls: 'json-null', text: 'null' };
      if (typeof value === 'string') return { cls: 'json-str', text: JSON.stringify(value) };
      if (typeof value === 'number') return { cls: 'json-num', text: String(value) };
      if (typeof value === 'boolean') return { cls: 'json-bool', text: String(value) };
      return { cls: '', text: String(value) };
    }

    function buildNode(key, value, depth, open) {
      const isContainer = value && typeof value === 'object';
      if (!isContainer) {
        const leaf = leafValue(value);
        const row = el('div', { class: 'json-tree-leaf' });
        if (key !== '') row.appendChild(el('span', { class: 'json-key' }, `${key}: `));
        row.appendChild(el('span', { class: leaf.cls }, leaf.text));
        return row;
      }

      const details = el('details', { class: 'json-tree-node' });
      if (open) details.open = true;
      const summary = el('summary', {});
      if (key !== '') summary.appendChild(el('span', { class: 'json-key' }, key));
      summary.appendChild(el('span', { class: 'json-preview' }, ` ${preview(value)}`));
      details.appendChild(summary);

      const children = el('div', { class: 'json-tree-children' });
      if (Array.isArray(value)) {
        value.forEach((item, index) => children.appendChild(buildNode(String(index), item, depth + 1, depth < 1)));
      } else {
        Object.keys(value).forEach((childKey) =>
          children.appendChild(buildNode(childKey, value[childKey], depth + 1, depth < 1))
        );
      }
      details.appendChild(children);
      return details;
    }

    textarea.addEventListener('input', () => {
      currentText = textarea.value;
      state.tooLarge = new TextEncoder().encode(textarea.value).length > MAX_HIGHLIGHT;
      editor.classList.toggle('no-highlight', state.tooLarge);
      highlight();
      refreshStatus();
    });
    textarea.addEventListener('scroll', syncScroll);
    textarea.addEventListener('paste', () => setTimeout(formatNow, 0));
    textarea.addEventListener('blur', formatNow);

    sortCheckbox.addEventListener('change', formatNow);
    clearBtn.addEventListener('click', () => {
      applyText('', false);
      textarea.focus();
    });
    minifyBtn.addEventListener('click', () => {
      const parsed = parse();
      if (parsed.empty || parsed.error) return;
      const value = sortCheckbox.checked ? sortDeep(parsed.value) : parsed.value;
      applyText(JSON.stringify(value), true);
    });
    copyBtn.addEventListener('click', async () => {
      const text = textarea.value || currentText;
      if (!text) return;
      const ok = await copyText(text);
      if (!ok) return;
      copyBtn.innerHTML = Icons.check(15);
      copyBtn.style.color = 'var(--color-success)';
      setTimeout(() => {
        copyBtn.innerHTML = Icons.copy(15);
        copyBtn.style.color = '';
      }, 1200);
    });

    setView('text');
    refreshStatus();
  }

  window.ShipsToolRegistry.register({ id: 'json', icon: 'braces', mount });
})();
