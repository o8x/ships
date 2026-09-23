'use strict';

(function registerJsonTool() {
  const { el, section, inputField, debounce, copyText, escapeHtml, Icons } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      json: {
        hint: '粘贴 JSON 自动格式化',
        input: '输入',
        output: '格式化结果',
        indent: '缩进',
        indent2: '2 空格',
        indent4: '4 空格',
        indentTab: 'Tab',
        sortKeys: '键排序',
        minify: '压缩',
        clear: '清空',
        empty: '粘贴或输入 JSON，自动格式化',
        invalid: 'JSON 无效',
        stats: '{lines} 行 · {bytes} 字节',
      },
    },
    en: {
      json: {
        hint: 'Paste JSON to format automatically',
        input: 'Input',
        output: 'Formatted',
        indent: 'Indent',
        indent2: '2 spaces',
        indent4: '4 spaces',
        indentTab: 'Tab',
        sortKeys: 'Sort keys',
        minify: 'Minify',
        clear: 'Clear',
        empty: 'Paste or type JSON to format automatically',
        invalid: 'Invalid JSON',
        stats: '{lines} lines · {bytes} bytes',
      },
    },
  });

  function highlight(json) {
    const regex = /("(?:\\.|[^"\\])*")(\s*:)?|(\btrue\b|\bfalse\b|\bnull\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
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

  function mount(container) {
    const hint = el('div', { class: 'mb-3 text-[11px] text-fg-muted' }, i18n.t('json.hint'));

    const toolbar = el('div', { class: 'mb-2 flex flex-wrap items-center gap-2' });
    const indentSelect = el('select', { class: 'field w-[104px] shrink-0 py-1 text-[12px]' });
    indentSelect.append(
      el('option', { value: '2' }, i18n.t('json.indent2')),
      el('option', { value: '4' }, i18n.t('json.indent4')),
      el('option', { value: 'tab' }, i18n.t('json.indentTab'))
    );
    indentSelect.value = '2';

    const sortLabel = el('label', { class: 'chip shrink-0 cursor-pointer select-none' });
    const sortCheckbox = el('input', { type: 'checkbox', class: 'accent-[var(--color-accent)]' });
    sortLabel.append(sortCheckbox, el('span', {}, i18n.t('json.sortKeys')));

    const minifyBtn = el(
      'button',
      { class: 'btn shrink-0 whitespace-nowrap py-1 text-[12px]', type: 'button' },
      i18n.t('json.minify')
    );
    const clearBtn = el(
      'button',
      { class: 'btn shrink-0 whitespace-nowrap py-1 text-[12px]', type: 'button' },
      i18n.t('json.clear')
    );
    toolbar.append(indentSelect, sortLabel, minifyBtn, clearBtn);

    const input = el('textarea', {
      class: 'field font-mono',
      rows: 6,
      spellcheck: 'false',
      placeholder: '{ "hello": "world" }',
    });
    const inputWrapper = inputField(i18n.t('json.input'), input);

    const status = el('div', { class: 'mt-2 mb-3 text-[11px] text-fg-muted' }, i18n.t('json.empty'));

    const outputSection = section(i18n.t('json.output'));
    const outputHeader = el('div', { class: 'mb-1 flex items-center justify-between' });
    const stats = el('span', { class: 'text-[11px] text-fg-muted' }, '');
    const copyBtn = el('button', { class: 'icon-btn h-6 w-6', type: 'button' });
    copyBtn.innerHTML = Icons.copy(14);
    outputHeader.append(stats, copyBtn);

    const output = el('pre', {
      class:
        'select-text max-h-[260px] overflow-auto rounded-card border border-border bg-surface p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-all',
    }, '');
    outputSection.append(outputHeader, output);

    container.append(hint, toolbar, inputWrapper, status, outputSection);

    let currentOutput = '';

    function render(state) {
      if (state.error) {
        status.textContent = state.error;
        status.style.color = 'var(--color-danger)';
        output.innerHTML = '';
        stats.textContent = '';
        currentOutput = '';
        return;
      }
      status.textContent = state.empty ? i18n.t('json.empty') : '';
      status.style.color = '';
      output.innerHTML = state.empty ? '' : highlight(state.text);
      currentOutput = state.text;
      if (!state.empty) {
        const bytes = new TextEncoder().encode(state.text).length;
        stats.textContent = i18n.t('json.stats', { lines: state.text.split('\n').length, bytes });
      } else {
        stats.textContent = '';
      }
    }

    function process() {
      const raw = input.value.trim();
      if (!raw) {
        render({ empty: true });
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        const pos = errorPosition(err.message);
        let suffix = '';
        if (pos != null) {
          const before = input.value.slice(0, pos);
          const line = before.split('\n').length;
          const col = pos - before.lastIndexOf('\n');
          suffix = ` (${line}:${col})`;
        }
        const clean = err.message.replace(/ in JSON at position \d+/, '');
        render({ error: `${i18n.t('json.invalid')}: ${clean}${suffix}` });
        return;
      }
      const value = sortCheckbox.checked ? sortDeep(parsed) : parsed;
      const indent = indentSelect.value === 'tab' ? '\t' : Number(indentSelect.value);
      render({ text: JSON.stringify(value, null, indent) });
    }

    const debounced = debounce(process, 150);
    input.addEventListener('input', debounced);
    input.addEventListener('blur', process);
    indentSelect.addEventListener('change', process);
    sortCheckbox.addEventListener('change', process);
    clearBtn.addEventListener('click', () => {
      input.value = '';
      process();
    });
    minifyBtn.addEventListener('click', () => {
      if (!currentOutput) return;
      input.value = JSON.stringify(JSON.parse(currentOutput));
      process();
    });
    copyBtn.addEventListener('click', async () => {
      if (!currentOutput) return;
      const ok = await copyText(currentOutput);
      if (!ok) return;
      copyBtn.innerHTML = Icons.check(14);
      copyBtn.style.color = 'var(--color-success)';
      setTimeout(() => {
        copyBtn.innerHTML = Icons.copy(14);
        copyBtn.style.color = '';
      }, 1200);
    });

    process();
  }

  window.ShipsToolRegistry.register({ id: 'json', icon: 'braces', mount });
})();
