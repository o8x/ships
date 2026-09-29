'use strict';

(function registerEncodeTool() {
  const { el, section, inputField } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      encode: {
        hint: '任意一侧输入即可实时互转（UTF-8）',
        text: '字符串',
        base64: 'Base64',
        hex: '十六进制',
        url: 'URL 编码',
        ascii: 'ASCII 十进制',
        invalid: '无法解码',
        textPlaceholder: '输入文本…',
        base64Placeholder: '如 aGVsbG8=',
        hexPlaceholder: '如 68 65 6c 6c 6f',
        urlPlaceholder: '如 hello%20world',
        asciiPlaceholder: '如 104 101 108 108 111',
      },
    },
    en: {
      encode: {
        hint: 'Type on either side to convert live (UTF-8)',
        text: 'Text',
        base64: 'Base64',
        hex: 'Hex',
        url: 'URL',
        ascii: 'ASCII decimal',
        invalid: 'Invalid input',
        textPlaceholder: 'Type text…',
        base64Placeholder: 'e.g. aGVsbG8=',
        hexPlaceholder: 'e.g. 68 65 6c 6c 6f',
        urlPlaceholder: 'e.g. hello%20world',
        asciiPlaceholder: 'e.g. 104 101 108 108 111',
      },
    },
  });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: false });

  function bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function base64ToBytes(text) {
    const cleaned = text.trim().replace(/\s+/g, '');
    if (!cleaned) return new Uint8Array(0);
    try {
      const binary = atob(cleaned);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    } catch (err) {
      return null;
    }
  }

  function bytesToHex(bytes) {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');
  }

  function hexToBytes(text) {
    const cleaned = text.replace(/0x/gi, '').replace(/[\s,:;-]/g, '');
    if (!cleaned) return new Uint8Array(0);
    if (cleaned.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(cleaned)) return null;
    const bytes = new Uint8Array(cleaned.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
    return bytes;
  }

  function bytesToAscii(bytes) {
    return Array.from(bytes).join(' ');
  }

  function asciiToBytes(text) {
    const cleaned = text.trim();
    if (!cleaned) return new Uint8Array(0);
    const parts = cleaned.split(/[\s,]+/);
    const bytes = new Uint8Array(parts.length);
    for (let i = 0; i < parts.length; i++) {
      if (!/^\d{1,3}$/.test(parts[i])) return null;
      const value = Number(parts[i]);
      if (value > 255) return null;
      bytes[i] = value;
    }
    return bytes;
  }

  function mount(container) {
    function area(label, placeholder) {
      const input = el('textarea', {
        class: 'field font-mono',
        rows: 2,
        spellcheck: 'false',
        placeholder,
      });
      return { input, wrapper: inputField(label, input) };
    }

    const textField = area(i18n.t('encode.text'), i18n.t('encode.textPlaceholder'));
    const base64Field = area(i18n.t('encode.base64'), i18n.t('encode.base64Placeholder'));
    const hexField = area(i18n.t('encode.hex'), i18n.t('encode.hexPlaceholder'));
    const urlField = area(i18n.t('encode.url'), i18n.t('encode.urlPlaceholder'));
    const asciiField = area(i18n.t('encode.ascii'), i18n.t('encode.asciiPlaceholder'));

    const fields = {
      text: textField.input,
      base64: base64Field.input,
      hex: hexField.input,
      url: urlField.input,
      ascii: asciiField.input,
    };

    let syncing = false;

    function setError(field, invalid) {
      field.style.borderColor = invalid ? 'var(--color-danger)' : '';
    }

    function renderFrom(field, bytes, text) {
      syncing = true;
      if (field !== fields.text) fields.text.value = text;
      if (field !== fields.base64) fields.base64.value = bytesToBase64(bytes);
      if (field !== fields.hex) fields.hex.value = bytesToHex(bytes);
      if (field !== fields.url) fields.url.value = encodeURIComponent(text);
      if (field !== fields.ascii) fields.ascii.value = bytesToAscii(bytes);
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
      let text;
      if (field === fields.text) {
        text = value;
        bytes = encoder.encode(value);
      } else if (field === fields.base64) {
        bytes = base64ToBytes(value);
        text = bytes ? decoder.decode(bytes) : '';
      } else if (field === fields.hex) {
        bytes = hexToBytes(value);
        text = bytes ? decoder.decode(bytes) : '';
      } else if (field === fields.ascii) {
        bytes = asciiToBytes(value);
        text = bytes ? decoder.decode(bytes) : '';
      } else {
        try {
          text = decodeURIComponent(value);
          bytes = encoder.encode(text);
        } catch (err) {
          bytes = null;
        }
      }

      if (bytes == null) {
        setError(field, true);
        return;
      }
      setError(field, false);
      renderFrom(field, bytes, text);
    }

    for (const key of Object.keys(fields)) {
      fields[key].addEventListener('input', () => handle(fields[key]));
      fields[key].addEventListener('blur', () => handle(fields[key]));
    }

    const body = section();
    body.append(
      textField.wrapper,
      base64Field.wrapper,
      hexField.wrapper,
      urlField.wrapper,
      asciiField.wrapper
    );

    container.append(body);
  }

  window.ShipsToolRegistry.register({ id: 'encode', icon: 'swap', mount });
})();
