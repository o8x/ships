'use strict';

(function registerEncodeTool() {
  const { Icons, el, section, inputField, segmented, createSelect } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      encode: {
        hint: '任意一侧输入即可实时互转（UTF-8）',
        text: '字符串',
        base64: 'Base64',
        hex: '十六进制',
        url: 'URL 编码',
        urlDecode: 'URL 解码',
        ascii: 'ASCII 十进制',
        invalid: '无法解码',
        textPlaceholder: '输入文本…',
        base64Placeholder: '如 aGVsbG8=',
        hexPlaceholder: '如 68 65 6c 6c 6f',
        urlPlaceholder: '如 hello%20world',
        urlDecodePlaceholder: '如 https://a.com/搜索?q=%E4%B8%AD%E6%96%87',
        asciiPlaceholder: '如 104 101 108 108 111',
        qrCopy: '复制',
        qrDownload: '下载到本地',
        qrCopied: '已复制',
        qrCopyFailed: '复制失败',
        qrSaveFailed: '保存失败：{error}',
        qrTooLong: '内容过长，无法生成二维码',
        qrEc: '纠错等级',
        qrSize: '尺寸',
        qrVersion: '版本',
        qrVersionAuto: '自动',
      },
    },
    en: {
      encode: {
        hint: 'Type on either side to convert live (UTF-8)',
        text: 'Text',
        base64: 'Base64',
        hex: 'Hex',
        url: 'URL',
        urlDecode: 'URL decode',
        ascii: 'ASCII decimal',
        invalid: 'Invalid input',
        textPlaceholder: 'Type text…',
        base64Placeholder: 'e.g. aGVsbG8=',
        hexPlaceholder: 'e.g. 68 65 6c 6c 6f',
        urlPlaceholder: 'e.g. hello%20world',
        urlDecodePlaceholder: 'e.g. https://a.com/search?q=%E4%B8%AD%E6%96%87',
        asciiPlaceholder: 'e.g. 104 101 108 108 111',
        qrCopy: 'Copy',
        qrDownload: 'Download',
        qrCopied: 'Copied',
        qrCopyFailed: 'Copy failed',
        qrSaveFailed: 'Save failed: {error}',
        qrTooLong: 'Content is too long to encode as a QR code',
        qrEc: 'Error correction',
        qrSize: 'Size',
        qrVersion: 'Version',
        qrVersionAuto: 'Auto',
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

  /* URL 反转义（容错）：还原 %xx（含中文等多字节 UTF-8），保留 URL 结构。
     遇到非法转义（孤立 % / 非十六进制）不报错，先把非法 % 转义成 %25 再尽量还原。 */
  function decodeUrl(text) {
    const value = String(text == null ? '' : text);
    try {
      return decodeURIComponent(value);
    } catch (err) {
      try {
        return decodeURIComponent(value.replace(/%(?![0-9a-fA-F]{2})/g, '%25'));
      } catch (err2) {
        return value;
      }
    }
  }

  // 二维码：实时生成（版本自动、纠错 M、矢量 SVG）；导出 PNG 的边长。
  const QR_ERROR_CORRECTION = 'M';
  const QR_EXPORT_SIZE = 1024;

  function svgToPngDataUrl(svg, size) {
    return new Promise((resolve, reject) => {
      const source = new XMLSerializer().serializeToString(svg);
      const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(image, 0, 0, size, size);
        resolve(canvas.toDataURL('image/png'));
      };
      image.onerror = reject;
      image.src = url;
    });
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
    const urlDecodeField = area(i18n.t('encode.urlDecode'), i18n.t('encode.urlDecodePlaceholder'));
    const asciiField = area(i18n.t('encode.ascii'), i18n.t('encode.asciiPlaceholder'));

    const fields = {
      text: textField.input,
      base64: base64Field.input,
      hex: hexField.input,
      url: urlField.input,
      urlDecode: urlDecodeField.input,
      ascii: asciiField.input,
    };

    let syncing = false;

    // 二维码区：左侧二维码，右侧可调参数（纠错等级 / 尺寸 / 边距）+ 复制 / 下载按钮。
    // 数据源固定为最上面的「字符串」框内容。
    const params = { ec: QR_ERROR_CORRECTION, size: 200, version: 0 };
    const qrBox = el('div', { class: 'qr-box', style: `width:${params.size}px;height:${params.size}px` });
    const qrNote = el('div', { class: 'qr-note' }, '');
    const qrCopyBtn = el('button', { class: 'btn shrink-0', type: 'button' });
    qrCopyBtn.append(el('span', { class: 'inline-flex' }, Icons.copy(14)), el('span', {}, i18n.t('encode.qrCopy')));
    const qrDownloadBtn = el('button', { class: 'btn shrink-0', type: 'button' });
    qrDownloadBtn.append(
      el('span', { class: 'inline-flex' }, Icons.download(14)),
      el('span', {}, i18n.t('encode.qrDownload'))
    );
    qrCopyBtn.disabled = true;
    qrDownloadBtn.disabled = true;
    let currentQrSvg = null;
    let qrCopiedTimer = null;
    let qrText = '';

    function paramRow(label, control) {
      const row = el('div', { class: 'flex items-center justify-between gap-2' });
      row.appendChild(el('span', { class: 'shrink-0 text-[11px] text-fg-muted' }, label));
      row.appendChild(control);
      return row;
    }

    const ecControl = segmented(
      ['L', 'M', 'Q', 'H'].map((value) => ({ value, label: value })),
      params.ec,
      (value) => {
        params.ec = value;
        renderQr(qrText);
      },
      { className: 'segment-compact' }
    );
    const sizeControl = createSelect({
      options: [160, 200, 240, 280, 320].map((value) => ({ value, label: `${value}px` })),
      value: params.size,
      align: 'right',
      className: 'w-[88px] shrink-0',
      onChange: (value) => {
        params.size = Number(value);
        renderQr(qrText);
      },
    });
    const versionControl = createSelect({
      options: [
        { value: 0, label: i18n.t('encode.qrVersionAuto') },
        ...Array.from({ length: 40 }, (_v, i) => ({ value: i + 1, label: String(i + 1) })),
      ],
      value: params.version,
      align: 'right',
      className: 'w-[88px] shrink-0',
      onChange: (value) => {
        params.version = Number(value);
        renderQr(qrText);
      },
    });

    const qrActions = el('div', { class: 'mt-1 flex items-center gap-2' });
    qrActions.append(qrCopyBtn, qrDownloadBtn);
    const qrParams = el('div', { class: 'flex min-w-0 flex-1 flex-col gap-2' });
    qrParams.append(
      paramRow(i18n.t('encode.qrEc'), ecControl.root),
      paramRow(i18n.t('encode.qrSize'), sizeControl.el),
      paramRow(i18n.t('encode.qrVersion'), versionControl.el),
      qrActions
    );

    function renderQr(text) {
      qrText = text;
      qrBox.style.width = `${params.size}px`;
      qrBox.style.height = `${params.size}px`;
      qrBox.innerHTML = '';
      currentQrSvg = null;
      qrNote.textContent = '';
      qrNote.style.color = '';
      if (!text || typeof window.qrcode !== 'function') {
        qrCopyBtn.disabled = true;
        qrDownloadBtn.disabled = true;
        return;
      }
      try {
        // 库默认按 Latin-1 取字节，会让中文乱码；显式改用 UTF-8。
        if (window.qrcode.stringToBytesFuncs && window.qrcode.stringToBytesFuncs['UTF-8']) {
          window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs['UTF-8'];
        }
        const qr = window.qrcode(params.version, params.ec);
        qr.addData(text);
        qr.make();
        // 固定边距 4 个模块（标准静区）；createSvgTag 的 margin 默认即 cellSize×4。
        qrBox.innerHTML = qr.createSvgTag({ scalable: true, cellSize: 1 });
        currentQrSvg = qrBox.querySelector('svg');
        qrCopyBtn.disabled = false;
        qrDownloadBtn.disabled = false;
      } catch (err) {
        qrCopyBtn.disabled = true;
        qrDownloadBtn.disabled = true;
        qrNote.textContent = i18n.t('encode.qrTooLong');
        qrNote.style.color = 'var(--color-danger)';
      }
    }

    async function copyQr() {
      if (!currentQrSvg) return;
      const label = qrCopyBtn.lastChild;
      try {
        const dataUrl = await svgToPngDataUrl(currentQrSvg, QR_EXPORT_SIZE);
        const res = await window.ships.copyImage(dataUrl);
        if (!res || !res.ok) throw new Error((res && res.error) || 'error');
      } catch (err) {
        qrNote.textContent = i18n.t('encode.qrCopyFailed');
        qrNote.style.color = 'var(--color-danger)';
        return;
      }
      qrCopyBtn.classList.add('btn-accent');
      if (label) label.textContent = i18n.t('encode.qrCopied');
      clearTimeout(qrCopiedTimer);
      qrCopiedTimer = setTimeout(() => {
        qrCopyBtn.classList.remove('btn-accent');
        if (label) label.textContent = i18n.t('encode.qrCopy');
      }, 1200);
    }

    async function downloadQr() {
      if (!currentQrSvg) return;
      try {
        const dataUrl = await svgToPngDataUrl(currentQrSvg, QR_EXPORT_SIZE);
        const res = await window.ships.saveImage({ dataUrl, name: 'qrcode.png' });
        if (res && res.canceled) return;
        if (!res || !res.ok) throw new Error((res && res.error) || 'error');
      } catch (err) {
        qrNote.textContent = i18n.t('encode.qrSaveFailed', { error: (err && err.message) || 'error' });
        qrNote.style.color = 'var(--color-danger)';
      }
    }

    qrCopyBtn.addEventListener('click', copyQr);
    qrDownloadBtn.addEventListener('click', downloadQr);

    function setError(field, invalid) {
      field.style.borderColor = invalid ? 'var(--color-danger)' : '';
    }

    function renderFrom(field, bytes, text) {
      syncing = true;
      if (field !== fields.text) fields.text.value = text;
      if (field !== fields.base64) fields.base64.value = bytesToBase64(bytes);
      if (field !== fields.hex) fields.hex.value = bytesToHex(bytes);
      if (field !== fields.url) fields.url.value = encodeURIComponent(text);
      if (field !== fields.urlDecode) fields.urlDecode.value = decodeUrl(text);
      if (field !== fields.ascii) fields.ascii.value = bytesToAscii(bytes);
      syncing = false;
      // 二维码数据源固定取最上面的「字符串」框内容。
      renderQr(fields.text.value);
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
        renderQr('');
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
      } else if (field === fields.url) {
        try {
          text = decodeURIComponent(value);
          bytes = encoder.encode(text);
        } catch (err) {
          bytes = null;
        }
      } else {
        // URL 解码：容错反转义，还原中文等字符（不报错、尽量还原）。
        text = decodeUrl(value);
        bytes = encoder.encode(text);
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
      urlDecodeField.wrapper,
      asciiField.wrapper
    );

    // 底部：左=二维码，右=参数（纠错 / 尺寸 / 边距）+「复制 / 下载到本地」按钮。
    const qrWrap = el('div', { class: 'flex items-start gap-3' });
    qrWrap.append(qrBox, qrParams);
    const qrSection = section();
    qrSection.append(qrWrap, qrNote);

    container.append(body, qrSection);
    renderQr('');

    return () => clearTimeout(qrCopiedTimer);
  }

  window.ShipsToolRegistry.register({ id: 'encode', icon: 'swap', mount });
})();
