'use strict';

(function registerStringCodecTool() {
  const { el, section, inputField, persistState } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      stringCodec: {
        hint: '任意一侧输入即可实时转换（UTF-8）',
        text: '字符串',
        hex: '十六进制',
        ascii: 'ASCII 十进制',
        base64: 'Base64',
        invalid: '输入无效',
        textPlaceholder: '输入文本…',
        hexPlaceholder: '如 68 65 6c 6c 6f',
        asciiPlaceholder: '如 104 101 108 108 111',
        base64Placeholder: '如 aGVsbG8=',
      },
    },
    en: {
      stringCodec: {
        hint: 'Type on either side to convert live (UTF-8)',
        text: 'Text',
        hex: 'Hex',
        ascii: 'ASCII decimal',
        base64: 'Base64',
        invalid: 'Invalid input',
        textPlaceholder: 'Type text…',
        hexPlaceholder: 'e.g. 68 65 6c 6c 6f',
        asciiPlaceholder: 'e.g. 104 101 108 108 111',
        base64Placeholder: 'e.g. aGVsbG8=',
      },
    },
  });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: false });

  function bytesToHex(bytes) {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');
  }

  function hexToBytes(text) {
    const cleaned = text.replace(/0x/gi, '').replace(/[\s,:;-]/g, '');
    if (!cleaned) return new Uint8Array(0);
    if (cleaned.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(cleaned)) return null;
    const out = new Uint8Array(cleaned.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
    return out;
  }

  function bytesToAscii(bytes) {
    return Array.from(bytes).join(' ');
  }

  function asciiToBytes(text) {
    const cleaned = text.trim();
    if (!cleaned) return new Uint8Array(0);
    const parts = cleaned.split(/[\s,]+/);
    const out = new Uint8Array(parts.length);
    for (let i = 0; i < parts.length; i++) {
      if (!/^\d{1,3}$/.test(parts[i])) return null;
      const num = Number(parts[i]);
      if (num > 255) return null;
      out[i] = num;
    }
    return out;
  }

  function bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function base64ToBytes(text) {
    const cleaned = text.trim();
    if (!cleaned) return new Uint8Array(0);
    try {
      const binary = atob(cleaned);
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
      return out;
    } catch (err) {
      return null;
    }
  }

  function mount(container) {
    const hint = el('div', { class: 'mb-3 text-[11px] text-fg-muted' }, i18n.t('stringCodec.hint'));

    function textarea(labelText, placeholder) {
      const area = el('textarea', {
        class: 'field font-mono',
        rows: 3,
        spellcheck: 'false',
        placeholder: placeholder || '',
      });
      return { area, wrapper: inputField(labelText, area) };
    }

    const textField = textarea(i18n.t('stringCodec.text'), i18n.t('stringCodec.textPlaceholder'));
    const hexField = textarea(i18n.t('stringCodec.hex'), i18n.t('stringCodec.hexPlaceholder'));
    const asciiField = textarea(i18n.t('stringCodec.ascii'), i18n.t('stringCodec.asciiPlaceholder'));
    const base64Field = textarea(i18n.t('stringCodec.base64'), i18n.t('stringCodec.base64Placeholder'));

    const fields = {
      text: textField.area,
      hex: hexField.area,
      ascii: asciiField.area,
      base64: base64Field.area,
    };

    let syncing = false;
    const store = persistState('stringCodec');

    function setError(field, invalid) {
      field.style.borderColor = invalid ? 'var(--color-danger)' : '';
    }

    function renderFrom(field, bytes) {
      const text = decoder.decode(bytes);
      syncing = true;
      if (field !== fields.text) fields.text.value = text;
      if (field !== fields.hex) fields.hex.value = bytesToHex(bytes);
      if (field !== fields.ascii) fields.ascii.value = bytesToAscii(bytes);
      if (field !== fields.base64) fields.base64.value = bytesToBase64(bytes);
      syncing = false;
    }

    function handle(field) {
      if (syncing) return;
      const value = field.value;
      if (!value.trim()) {
        syncing = true;
        for (const key of Object.keys(fields)) {
          if (fields[key] !== field) fields[key].value = '';
          setError(fields[key], false);
        }
        syncing = false;
        return;
      }

      let bytes;
      if (field === fields.text) bytes = encoder.encode(value);
      else if (field === fields.hex) bytes = hexToBytes(value);
      else if (field === fields.ascii) bytes = asciiToBytes(value);
      else bytes = base64ToBytes(value);

      if (bytes == null) {
        setError(field, true);
        return;
      }
      setError(field, false);
      renderFrom(field, bytes);
      const key = Object.keys(fields).find((name) => fields[name] === field);
      if (key) store.save({ field: key, value: field.value });
    }

    for (const key of Object.keys(fields)) {
      fields[key].addEventListener('input', () => handle(fields[key]));
      fields[key].addEventListener('blur', () => handle(fields[key]));
    }

    const inputSection = section();
    inputSection.append(textField.wrapper, hexField.wrapper, asciiField.wrapper, base64Field.wrapper);

    container.append(hint, inputSection);

    store.load((saved) => {
      if (!saved || !saved.field || saved.value == null) return;
      const target = fields[saved.field];
      if (!target) return;
      target.value = saved.value;
      handle(target);
    });
  }

  window.ShipsToolRegistry.register({ id: 'stringCodec', icon: 'code', mount });
})();
