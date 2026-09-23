'use strict';

(function registerHashTool() {
  const { el, section, inputField, resultRow, segmented, persistState, debounce, Icons } = window.ShipsUI;
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
          fileLabel.textContent = i18n.t('hash.noFile');
          chooseBtn.querySelector('.choose-label').textContent = i18n.t('hash.chooseFile');
          delete textarea.dataset.file;
        }
        saveState();
      }
    );

    // String panel
    const textarea = el('textarea', {
      class: 'field font-mono',
      rows: 3,
      spellcheck: 'false',
      placeholder: i18n.t('hash.placeholder'),
    });
    const stringPanel = el('div', { class: 'mb-2.5 flex flex-col gap-2.5' });
    stringPanel.appendChild(inputField(null, textarea));

    // File panel
    const filePanel = el('div', { class: 'mb-2.5 flex flex-col gap-2.5 hidden' });
    const fileLabel = el('div', { class: 'truncate text-[12px] text-fg-muted' }, i18n.t('hash.noFile'));
    const chooseBtn = el('button', { class: 'btn', type: 'button' });
    chooseBtn.append(
      el('span', { class: 'inline-flex' }, Icons.folder(14)),
      el('span', { class: 'choose-label' }, i18n.t('hash.chooseFile'))
    );
    filePanel.append(chooseBtn, fileLabel);

    const rows = {
      md5: resultRow('MD5'),
      sha1: resultRow('SHA1'),
      sha256: resultRow('SHA256'),
    };
    const outSection = section();
    for (const key of Object.keys(rows)) outSection.appendChild(rows[key].root);

    const store = persistState('hash');
    let mode = 'string';

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
      fileLabel.textContent = `${info.name} · ${formatSize(info.size)}`;
      chooseBtn.querySelector('.choose-label').textContent = i18n.t('hash.changeFile');
      setHashes(null);
      fileLabel.textContent = `${info.name} · ${formatSize(info.size)} · ${i18n.t('hash.hashing')}`;
      const result = await window.ships.hashFile(info.path);
      if (result && result.ok) {
        fileLabel.textContent = `${result.info.name} · ${formatSize(result.info.size)}`;
        setHashes(result.hashes);
      } else {
        fileLabel.textContent = `${info.name} · ${i18n.t('hash.failed')}`;
        setHashes(null);
      }
    }

    function saveState() {
      const active = modeSegment.root.querySelector('button.active');
      mode = active ? active.dataset.value : 'string';
      store.save({ mode, text: textarea.value });
    }

    textarea.addEventListener('input', () => {
      computeText();
      saveState();
    });
    chooseBtn.addEventListener('click', chooseFile);

    const modeSection = section();
    modeSection.appendChild(modeSegment.root);

    container.append(modeSection, stringPanel, filePanel, outSection);

    store.load((saved) => {
      if (saved && saved.mode) {
        modeSegment.set(saved.mode);
        stringPanel.classList.toggle('hidden', saved.mode !== 'string');
        filePanel.classList.toggle('hidden', saved.mode !== 'file');
      }
      if (saved && saved.text) {
        textarea.value = saved.text;
        computeText();
      }
    });
  }

  window.ShipsToolRegistry.register({ id: 'hash', icon: 'fingerprint', mount });
})();
