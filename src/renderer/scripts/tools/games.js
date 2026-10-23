'use strict';

(function registerGamesTool() {
  const { Icons, el } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      tools: { games: '游戏' },
      toolDesc: { games: '双击封面启动游戏' },
      gameTool: {
        refresh: '刷新',
        modify: '修改游戏工作目录',
        empty: '工作目录中未找到游戏',
        emptyHint: '把 ROM 放进 roms/fc、roms/gba、roms/n64 或 roms/sfc 后刷新',
        scanFailed: '扫描失败：{error}',
        openFailed: '无法启动游戏：{error}',
        loading: '正在扫描…',
        count: '{count} 个游戏',
      },
    },
    en: {
      tools: { games: 'Games' },
      toolDesc: { games: 'Double-click a cover to play' },
      gameTool: {
        refresh: 'Refresh',
        modify: 'Change game folder',
        empty: 'No games found in the working folder',
        emptyHint: 'Put ROMs in roms/fc, roms/gba, roms/n64 or roms/sfc, then refresh',
        scanFailed: 'Scan failed: {error}',
        openFailed: 'Cannot start game: {error}',
        loading: 'Scanning…',
        count: '{count} games',
      },
    },
  });

  function colorFor(seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    const hue = hash % 360;
    return `linear-gradient(135deg, hsl(${hue} 58% 42%), hsl(${(hue + 38) % 360} 62% 28%))`;
  }

  function initialOf(name) {
    const trimmed = String(name || '').trim();
    return trimmed ? Array.from(trimmed)[0].toUpperCase() : '?';
  }

  function mount(body) {
    const state = { data: null, selectedId: '', busy: false, cleanup: null };
    let refreshTimer = null;
    let disposed = false;

    const toolbar = el('div', { class: 'game-toolbar' });
    const actions = el('div', { class: 'game-toolbar-actions' });
    const refreshBtn = el('button', {
      class: 'icon-btn h-6 w-6',
      type: 'button',
      'data-tip': i18n.t('gameTool.refresh'),
    });
    refreshBtn.innerHTML = Icons.refresh(14);
    const modifyBtn = el('button', {
      class: 'icon-btn h-6 w-6',
      type: 'button',
      'data-tip': i18n.t('gameTool.modify'),
    });
    modifyBtn.innerHTML = Icons.edit(14);
    actions.append(modifyBtn, refreshBtn);
    toolbar.append(actions);

    const status = el('div', { class: 'game-status hidden' }, '');
    const list = el('div', { class: 'game-list' }, '');

    refreshBtn.addEventListener('click', () => refresh());
    modifyBtn.addEventListener('click', () => window.ships.openSettings('games'));

    function setStatus(text, danger) {
      status.textContent = text || '';
      status.classList.toggle('hidden', !text);
      status.classList.toggle('text-danger', Boolean(danger));
    }

    function select(id) {
      state.selectedId = id;
      for (const node of list.querySelectorAll('.game-tile')) {
        node.classList.toggle('selected', node.dataset.id === id);
      }
    }

    async function openGame(id) {
      if (!id) return;
      setStatus('');
      const result = await window.ships.games.open(id);
      if (!result || !result.ok) {
        setStatus(i18n.t('gameTool.openFailed', { error: (result && result.error) || 'error' }), true);
      }
    }

    function tile(game, engineLabel) {
      const button = el('button', {
        class: 'game-tile',
        type: 'button',
        dataset: { id: game.id },
        'data-tip': game.name,
      });
      let cover;
      if (game.coverUrl) {
        cover = el('img', {
          class: 'game-cover',
          src: game.coverUrl,
          alt: game.name,
          draggable: 'false',
          loading: 'lazy',
        });
        cover.addEventListener('error', () => {
          const fallback = placeholder(game, engineLabel);
          if (cover.parentNode) cover.parentNode.replaceChild(fallback, cover);
        });
      } else {
        cover = placeholder(game, engineLabel);
      }
      const name = el('span', { class: 'game-name' }, game.name);
      button.append(cover, name);
      button.addEventListener('click', () => select(game.id));
      button.addEventListener('dblclick', () => openGame(game.id));
      return button;
    }

    function placeholder(game, engineLabel) {
      const node = el('div', { class: 'game-cover game-cover-placeholder' });
      node.style.background = colorFor(game.id);
      node.append(
        el('span', { class: 'game-cover-engine' }, engineLabel),
        el('span', { class: 'game-cover-initial' }, initialOf(game.name))
      );
      return node;
    }

    function render(data) {
      state.data = data;
      list.innerHTML = '';
      if (!data || !data.ok) {
        setStatus(i18n.t('gameTool.scanFailed', { error: (data && data.error) || 'error' }), true);
      }
      const engines = (data && data.engines) || [];
      const nonEmpty = engines.filter((engine) => engine.games && engine.games.length);
      if (!nonEmpty.length) {
        const empty = el('div', { class: 'game-empty' });
        empty.append(
          el('div', { class: 'text-[13px] text-fg' }, i18n.t('gameTool.empty')),
          el('div', { class: 'mt-1 text-[11px] text-fg-muted' }, i18n.t('gameTool.emptyHint'))
        );
        list.appendChild(empty);
        return;
      }
      for (const engine of nonEmpty) {
        const section = el('section', { class: 'game-category' });
        const head = el('div', { class: 'game-category-head' });
        head.append(
          el('span', { class: 'game-category-title' }, engine.label),
          el('span', { class: 'game-category-count' }, i18n.t('gameTool.count', { count: engine.games.length }))
        );
        const grid = el('div', { class: 'game-grid' });
        for (const game of engine.games) grid.appendChild(tile(game, engine.label));
        section.append(head, grid);
        list.appendChild(section);
      }
      if (state.selectedId) {
        const exists = nonEmpty.some((engine) =>
          (engine.games || []).some((game) => game.id === state.selectedId)
        );
        if (exists) select(state.selectedId);
        else state.selectedId = '';
      }
    }

    async function refresh() {
      if (state.busy || disposed) return;
      state.busy = true;
      refreshBtn.classList.add('spin');
      setStatus(i18n.t('gameTool.loading'));
      try {
        const data = await window.ships.games.scan();
        if (!disposed) {
          render(data);
          if (data && data.ok) setStatus('');
        }
      } catch (err) {
        if (!disposed) setStatus(i18n.t('gameTool.scanFailed', { error: err.message }), true);
      } finally {
        state.busy = false;
        refreshBtn.classList.remove('spin');
      }
    }

    function scheduleRefresh() {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        refresh();
      }, 500);
    }

    function onKeydown(event) {
      if (event.key !== 'Enter' || !state.selectedId) return;
      const target = event.target;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      event.preventDefault();
      openGame(state.selectedId);
    }

    const offWorkdir = window.ships.games.onWorkdirChanged(scheduleRefresh);
    window.addEventListener('focus', scheduleRefresh);
    document.addEventListener('keydown', onKeydown);

    body.append(toolbar, status, list);
    refresh();

    state.cleanup = () => {
      disposed = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (typeof offWorkdir === 'function') offWorkdir();
      window.removeEventListener('focus', scheduleRefresh);
      document.removeEventListener('keydown', onKeydown);
    };
    return () => state.cleanup && state.cleanup();
  }

  window.ShipsToolRegistry.register({
    id: 'games',
    icon: 'gamepad',
    mount,
  });
})();
