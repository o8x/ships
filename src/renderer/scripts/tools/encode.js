'use strict';

(function registerEncodeTool() {
  const { el, section, inputField, segmented, persistState } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      encode: {
        hint: '在原文或编码结果任意一侧输入，实时互转（UTF-8）',
        mode: '方式',
        plain: '原文',
        encoded: '编码结果',
        plainPlaceholder: '输入原文…',
        encodedPlaceholder: '输入编码结果…',
        invalid: '无法解码',
        base64: 'Base64',
        hex: 'Hex',
        url: 'URL',
      },
    },
    en: {
      encode: {
        hint: 'Type on either side to convert live (UTF-8)',
        mode: 'Mode',
        plain: 'Plain',
        encoded: 'Encoded',
        plainPlaceholder: 'Type plain text…',
        encodedPlaceholder: 'Type encoded text…',
        invalid: 'Cannot decode',
        base64: 'Base64',
        hex: 'Hex',
        url: 'URL',
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

  function base64ToText(text) {
    const cleaned = text.trim().replace(/\s+/g, '');
    if (!cleaned) return '';
    try {
      const binary = atob(cleaned);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return decoder.decode(bytes);
    } catch (err) {
      return null;
    }
  }

  function textToHex(text) {
    return Array.from(encoder.encode(text))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function hexToText(text) {
    const cleaned = text.trim().replace(/0x/gi, '').replace(/[\s,:-]/g, '');
    if (!cleaned) return '';
    if (cleaned.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(cleaned)) return null;
    const bytes = new Uint8Array(cleaned.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
    return decoder.decode(bytes);
  }

  function encode(mode, text) {
    if (mode === 'hex') return textToHex(text);
    if (mode === 'url') return encodeURIComponent(text);
    return bytesToBase64(encoder.encode(text));
  }

  function decode(mode, text) {
    if (mode === 'hex') return hexToText(text);
    if (mode === 'url') {
      try {
        return decodeURIComponent(text);
      } catch (err) {
        return null;
      }
    }
    return base64ToText(text);
  }

  function mount(container) {
    const hint = el('div', { class: 'mb-3 text-[11px] text-fg-muted' }, i18n.t('encode.hint'));

    const modeSegment = segmented(
      [
        { value: 'base64', label: i18n.t('encode.base64') },
        { value: 'hex', label: i18n.t('encode.hex') },
        { value: 'url', label: i18n.t('encode.url') },
      ],
      'base64',
      () => {
        encodeFromPlain();
        saveState();
      }
    );

    const plain = el('textarea', {
      class: 'field font-mono',
      rows: 3,
      spellcheck: 'false',
      placeholder: i18n.t('encode.plainPlaceholder'),
    });
    const encoded = el('textarea', {
      class: 'field font-mono',
      rows: 3,
      spellcheck: 'false',
      placeholder: i18n.t('encode.encodedPlaceholder'),
    });

    const plainWrap = inputField(i18n.t('encode.plain'), plain);
    const encodedWrap = inputField(i18n.t('encode.encoded'), encoded);

    const store = persistState('encode');
    let syncing = false;

    function setError(invalid) {
      encoded.style.borderColor = invalid ? 'var(--color-danger)' : '';
    }

    function encodeFromPlain() {
      syncing = true;
      encoded.value = encode(modeSegment ? currentMode() : 'base64', plain.value);
      syncing = false;
      setError(false);
    }

    function decodeFromEncoded() {
      if (syncing) return;
      const result = decode(currentMode(), encoded.value);
      if (result == null) {
        setError(true);
        return;
      }
      setError(false);
      syncing = true;
      plain.value = result;
      syncing = false;
    }

    function currentMode() {
      const active = modeSegment.root.querySelector('button.active');
      return active ? active.dataset.value : 'base64';
    }

    function saveState() {
      store.save({ mode: currentMode(), plain: plain.value });
    }

    plain.addEventListener('input', () => {
      encodeFromPlain();
      saveState();
    });
    encoded.addEventListener('input', decodeFromEncoded);
    encoded.addEventListener('blur', decodeFromEncoded);

    const sectionEl = section();
    sectionEl.append(modeSegment.root, plainWrap, encodedWrap);

    container.append(hint, sectionEl);

    store.load((saved) => {
      if (saved && saved.mode) modeSegment.set(saved.mode);
      if (saved && saved.plain != null) {
        plain.value = saved.plain;
        encodeFromPlain();
      }
    });
  }

  window.ShipsToolRegistry.register({ id: 'encode', icon: 'swap', mount });
})();
