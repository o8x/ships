'use strict';

(function registerHashTool() {
  const { el, section, resultRow, segmented, debounce, Icons } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      hash: {
        hint: '计算文本或文件的哈希值',
        modeString: '字符串',
        modeFile: '文件',
        placeholder: '输入要计算哈希的文本…',
        chooseFile: '选择文件',
        changeFile: '重新选择',
        noFile: '未选择文件',
        hashing: '计算中…',
        failed: '计算失败',
      },
    },
    en: {
      hash: {
        hint: 'Compute hashes of text or a file',
        modeString: 'Text',
        modeFile: 'File',
        placeholder: 'Type text to hash…',
        chooseFile: 'Choose file',
        changeFile: 'Choose another',
        noFile: 'No file selected',
        hashing: 'Computing…',
        failed: 'Failed',
      },
    },
  });

  function formatSize(bytes) {
    if (!Number.isFinite(bytes)) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  function mount(container) {
    const modeSegment = segmented(
      [
        { value: 'string', label: i18n.t('hash.modeString') },
        { value: 'file', label: i18n.t('hash.modeFile') },
      ],
      'string',
      (value) => {
        stringPanel.classList.toggle('hidden', value !== 'string');
        filePanel.classList.toggle('hidden', value !== 'file');
        setHashes(null);
        if (value === 'string') {
          if (textarea.value) computeText();
        } else {
          chooseLabel.textContent = i18n.t('hash.chooseFile');
          chooseHint.classList.add('hidden');
          chooseBtn.removeAttribute('data-tip');
          delete textarea.dataset.file;
        }
      }
    );

    // String panel
    const textarea = el('textarea', {
      class: 'field h-full w-full resize-none font-mono',
      spellcheck: 'false',
      placeholder: i18n.t('hash.placeholder'),
    });
    // 字符串 / 文件两种模式共用同一高度（--hash-source-height），切换时结果区不跳动。
    const stringPanel = el('div', {
      class: 'mb-card flex flex-col',
      style: 'height: var(--hash-source-height)',
    });
    stringPanel.appendChild(textarea);

    // File panel：整块即按钮，提示 / 文件名在同一行居中；不再额外占一行。
    const filePanel = el('div', {
      class: 'mb-card hidden flex-col',
      style: 'height: var(--hash-source-height)',
    });
    const chooseLabel = el('span', { class: 'choose-label min-w-0 truncate' }, i18n.t('hash.chooseFile'));
    const chooseHint = el('span', { class: 'hidden shrink-0 text-[11px] text-fg-muted' }, i18n.t('hash.changeFile'));
    const chooseBtn = el('button', {
      class:
        'flex h-full w-full items-center justify-center gap-2 rounded-control border border-dashed border-border bg-control px-3 text-[12px] text-fg transition-colors hover:border-accent-line hover:text-accent',
      type: 'button',
    });
    chooseBtn.append(
      el('span', { class: 'inline-flex shrink-0' }, Icons.folder(14)),
      chooseLabel,
      chooseHint
    );
    filePanel.appendChild(chooseBtn);

    const rows = {
      md5: resultRow('MD5'),
      sha1: resultRow('SHA1'),
      sha256: resultRow('SHA256'),
    };
    const outSection = section();
    for (const key of Object.keys(rows)) outSection.appendChild(rows[key].root);

    function setHashes(hashes) {
      rows.md5.set(hashes ? hashes.md5 : null);
      rows.sha1.set(hashes ? hashes.sha1 : null);
      rows.sha256.set(hashes ? hashes.sha256 : null);
    }

    const computeText = debounce(async () => {
      const text = textarea.value;
      if (!text) {
        setHashes(null);
        return;
      }
      try {
        setHashes(await window.ships.hashText(text));
      } catch (err) {
        setHashes(null);
      }
    }, 200);

    async function chooseFile() {
      const info = await window.ships.openFile();
      if (!info) return;
      textarea.dataset.file = info.path;
      chooseHint.classList.remove('hidden');
      chooseBtn.setAttribute('data-tip', i18n.t('hash.changeFile'));
      setHashes(null);
      chooseLabel.textContent = `${info.name} · ${formatSize(info.size)} · ${i18n.t('hash.hashing')}`;
      const result = await window.ships.hashFile(info.path);
      if (result && result.ok) {
        chooseLabel.textContent = `${result.info.name} · ${formatSize(result.info.size)}`;
        setHashes(result.hashes);
      } else {
        chooseLabel.textContent = `${info.name} · ${i18n.t('hash.failed')}`;
        setHashes(null);
      }
    }

    textarea.addEventListener('input', computeText);
    chooseBtn.addEventListener('click', chooseFile);

    const modeSection = section();
    modeSection.appendChild(modeSegment.root);

    container.append(modeSection, stringPanel, filePanel, outSection);
  }

  window.ShipsToolRegistry.register({ id: 'hash', icon: 'fingerprint', mount });
})();
