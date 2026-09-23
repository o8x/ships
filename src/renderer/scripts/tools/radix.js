'use strict';

(function registerRadixTool() {
  const { el, section, inputField, createSelect, persistState } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      radix: {
        hint: '在任意一行输入，其余进制实时同步',
        bin: '二进制',
        oct: '八进制',
        dec: '十进制',
        hex: '十六进制',
        custom: '自定义进制',
        base: '进制',
        bits: '位宽',
        bytes: '字节',
        invalid: '该进制的输入无效',
        empty: '在任意进制输入数值，实时转换',
      },
    },
    en: {
      radix: {
        hint: 'Type in any row to sync all bases',
        bin: 'Binary',
        oct: 'Octal',
        dec: 'Decimal',
        hex: 'Hex',
        custom: 'Custom base',
        base: 'Base',
        bits: 'Bit length',
        bytes: 'Bytes',
        invalid: 'Invalid input for this base',
        empty: 'Type a value in any base to convert live',
      },
    },
  });

  const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

  function parseInBase(text, base) {
    const cleaned = String(text).trim().replace(/[\s_]/g, '');
    if (!cleaned) return null;
    const negative = cleaned.startsWith('-');
    const body = negative ? cleaned.slice(1) : cleaned;
    if (!body) return null;
    let value = 0n;
    const b = BigInt(base);
    for (const ch of body.toLowerCase()) {
      const digit = DIGITS.indexOf(ch);
      if (digit < 0 || digit >= base) return null;
      value = value * b + BigInt(digit);
    }
    return negative ? -value : value;
  }

  function formatInBase(value, base) {
    if (value === 0n) return '0';
    const negative = value < 0n;
    let v = negative ? -value : value;
    const b = BigInt(base);
    let out = '';
    while (v > 0n) {
      out = DIGITS[Number(v % b)] + out;
      v /= b;
    }
    if (base === 16) out = out.toUpperCase();
    return (negative ? '-' : '') + out;
  }

  function mount(container) {
    const hint = el('div', { class: 'mb-2.5 text-[11px] text-fg-muted' }, i18n.t('radix.hint'));
    const rows = [];
    const store = persistState('radix');
    const rowsSection = section();

    function makeRow(labelText, base, placeholder) {
      const input = el('input', {
        class: 'field font-mono',
        type: 'text',
        spellcheck: 'false',
        autocomplete: 'off',
        placeholder: placeholder || '',
      });
      const wrapper = inputField(labelText, input);
      const meta = el('div', { class: 'mt-1 text-[10px] text-fg-muted' }, '');
      wrapper.appendChild(meta);
      rowsSection.appendChild(wrapper);
      const row = { base, input, meta, setError: null };
      input.addEventListener('input', () => onInput(row));
      input.addEventListener('blur', () => onInput(row));
      return row;
    }

    let customBase = 36;
    const baseSelect = createSelect({
      options: Array.from({ length: 35 }, (_v, i) => ({ value: i + 2, label: String(i + 2) })),
      value: 36,
      align: 'right',
      className: 'w-[88px]',
      onChange: (value) => {
        customBase = Number(value);
        if (lastValue != null) {
          customInput.value = formatInBase(lastValue, customBase);
          setError(customRow, false);
        }
      },
    });

    function setError(row, invalid) {
      row.input.style.borderColor = invalid ? 'var(--color-danger)' : '';
      row.meta.textContent = invalid ? i18n.t('radix.invalid') : '';
      row.meta.style.color = invalid ? 'var(--color-danger)' : '';
    }

    function onInput(source) {
      const text = source.input.value;
      if (!text.trim()) {
        setError(source, false);
        return;
      }
      const value = parseInBase(text, source.base);
      if (value == null) {
        setError(source, true);
        return;
      }
      setError(source, false);
      lastValue = value;
      for (const row of rows) {
        if (row === source) continue;
        row.input.value = formatInBase(value, row.base);
        setError(row, false);
      }
      updateMeta(value);
      store.save({ base: source.base, value: source.input.value });
    }

    function updateMeta(value) {
      const abs = value < 0n ? -value : value;
      const bitLength = abs === 0n ? 1 : abs.toString(2).length;
      metaBits.set(String(Math.ceil(bitLength / 8) * 8));
      metaBytes.set(String(Math.ceil(bitLength / 8)));
    }

    let lastValue = null;

    const binRow = makeRow(i18n.t('radix.bin'), 2, '1010');
    const octRow = makeRow(i18n.t('radix.oct'), 8, '17');
    const decRow = makeRow(i18n.t('radix.dec'), 10, '255');
    const hexRow = makeRow(i18n.t('radix.hex'), 16, 'FF');
    rows.push(binRow, octRow, decRow, hexRow);

    const customSection = section(i18n.t('radix.custom'));
    const baseWrap = el('label', { class: 'block' });
    baseWrap.appendChild(el('span', { class: 'tool-label' }, i18n.t('radix.base')));
    baseWrap.appendChild(baseSelect.el);
    customSection.appendChild(baseWrap);
    const customInput = el('input', {
      class: 'field font-mono',
      type: 'text',
      spellcheck: 'false',
      autocomplete: 'off',
      placeholder: 'Z',
    });
    const customWrap = inputField(i18n.t('radix.custom'), customInput);
    const customMeta = el('div', { class: 'mt-1 text-[10px] text-fg-muted' }, '');
    customWrap.appendChild(customMeta);
    customSection.appendChild(customWrap);

    const customRow = {
      base: customBase,
      input: customInput,
      meta: customMeta,
    };
    rows.push(customRow);
    customInput.addEventListener('input', () => onInput(customRow));
    customInput.addEventListener('blur', () => onInput(customRow));

    const metaSection = section();
    const metaBits = resultMeta(i18n.t('radix.bits'));
    const metaBytes = resultMeta(i18n.t('radix.bytes'));
    metaSection.append(metaBits.root, metaBytes.root);

    container.append(rowsSection, customSection, metaSection);
    container.prepend(hint);

    function resultMeta(labelText) {
      const root = el('div', { class: 'flex items-center justify-between rounded-card border border-border bg-surface px-2.5 py-1.5' });
      root.appendChild(el('div', { class: 'text-[11px] text-fg-muted' }, labelText));
      const value = el('div', { class: 'font-mono text-[13px] text-fg' }, '—');
      root.appendChild(value);
      return { root, set: (text) => (value.textContent = text) };
    }

    function resetErrors() {
      rows.forEach((row) => setError(row, false));
    }
    resetErrors();

    store.load((saved) => {
      if (!saved || saved.value == null) return;
      let row = rows.find((item) => String(item.base) === String(saved.base));
      if (!row) row = customRow;
      row.input.value = saved.value;
      onInput(row);
    });
  }

  window.ShipsToolRegistry.register({ id: 'radix', icon: 'hash', mount });
})();
