'use strict';

(function registerClipboardTool() {
  const { el, Icons } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      clipboard: {
        title: '剪贴板',
        empty: '暂无剪切板记录',
        copy: '复制',
        copied: '已复制',
        clear: '清空',
        image: '图片',
        truncated: '已截断',
      },
    },
    en: {
      clipboard: {
        title: 'Clipboard',
        empty: 'No clipboard history',
        copy: 'Copy',
        copied: 'Copied',
        clear: 'Clear',
        image: 'Image',
        truncated: 'truncated',
      },
    },
  });

  const PREVIEW_LIMIT = 300;

  function timeText(at) {
    if (!at) return '';
    try {
      return new Date(at).toLocaleTimeString(i18n.getLocale() === 'zh' ? 'zh-CN' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch (err) {
      return '';
    }
  }

  function mount(container) {
    const state = { items: [], disposers: [] };

    const header = el('div', { class: 'mb-3 flex items-center justify-between' });
    header.appendChild(el('h2', { class: 'tool-title mb-0' }, i18n.t('clipboard.title')));
    const actions = el('div', { class: 'flex items-center gap-1' });
    const refreshBtn = el('button', { class: 'icon-btn h-7 w-7', type: 'button', 'data-tip': i18n.t('ssh.refresh') });
    refreshBtn.innerHTML = Icons.refresh(15);
    const clearBtn = el('button', { class: 'icon-btn h-7 w-7', type: 'button', 'data-tip': i18n.t('clipboard.clear') });
    clearBtn.innerHTML = Icons.trash(15);
    actions.append(refreshBtn, clearBtn);
    header.appendChild(actions);

    const list = el('div', { class: 'flex flex-col gap-1.5' });
    container.append(header, list);

    function buildRow(item) {
      const row = el('div', { class: 'row-card items-start' });
      const body = el('div', { class: 'min-w-0 flex-1' });

      if (item.type === 'image') {
        const image = el('img', {
          src: item.thumb,
          alt: 'clipboard',
          class: 'max-h-[64px] max-w-full rounded-control border border-border',
        });
        body.appendChild(image);
        body.appendChild(
          el(
            'div',
            { class: 'mt-1 text-[10px] text-fg-muted' },
            `${i18n.t('clipboard.image')} · ${item.width}×${item.height}`
          )
        );
      } else {
        const preview = el('div', {
          class: 'line-clamp-2 whitespace-pre-wrap break-all font-mono text-[12px] text-fg',
        }, (item.text || '').slice(0, PREVIEW_LIMIT));
        body.appendChild(preview);
        const meta = [timeText(item.at)];
        if (item.truncated) meta.push(i18n.t('clipboard.truncated'));
        if (item.text && item.text.length > PREVIEW_LIMIT) meta.push(`${item.text.length}`);
        body.appendChild(el('div', { class: 'mt-1 text-[10px] text-fg-muted' }, meta.filter(Boolean).join(' · ')));
      }

      const copyBtn = el('button', { class: 'icon-btn h-7 w-7 shrink-0', type: 'button', 'data-tip': i18n.t('clipboard.copy') });
      copyBtn.innerHTML = Icons.copy(15);
      copyBtn.addEventListener('click', async () => {
        const result = await window.ships.clipboard.copy(item.id);
        if (!result || !result.ok) return;
        copyBtn.innerHTML = Icons.check(15);
        copyBtn.style.color = 'var(--color-success)';
        setTimeout(() => {
          copyBtn.innerHTML = Icons.copy(15);
          copyBtn.style.color = '';
        }, 1200);
      });

      row.append(body, copyBtn);
      return row;
    }

    function render() {
      list.innerHTML = '';
      if (!state.items.length) {
        list.appendChild(
          el('div', { class: 'py-10 text-center text-[12px] text-fg-muted' }, i18n.t('clipboard.empty'))
        );
        return;
      }
      for (const item of state.items) list.appendChild(buildRow(item));
    }

    async function load() {
      try {
        state.items = await window.ships.clipboard.list();
      } catch (err) {
        state.items = [];
      }
      render();
    }

    refreshBtn.addEventListener('click', load);
    clearBtn.addEventListener('click', async () => {
      await window.ships.clipboard.clear();
      state.items = [];
      render();
    });

    state.disposers.push(window.ships.clipboard.onChanged((items) => {
      state.items = items || [];
      render();
    }));

    load();

    return () => state.disposers.forEach((dispose) => dispose && dispose());
  }

  window.ShipsToolRegistry.register({ id: 'clipboard', icon: 'clipboard', mount });
})();
