'use strict';

(function registerGamesTool() {
  const { Icons, el } = window.ShipsUI;
  const i18n = window.ShipsI18n;
  const constants = window.ShipsConstants || {};
  const CHUNK_SIZE = constants.GAME_TILE_CHUNK_SIZE || 120;
  const SEARCH_DEBOUNCE_MS = constants.DEBOUNCE_MS || 120;

  i18n.extend({
    zh: {
      tools: { games: '游戏' },
      toolDesc: { games: '双击封面启动游戏' },
      gameTool: {
        empty: '工作目录中未找到游戏',
        emptyHint: '把 ROM 放进 roms/fc、roms/gba、roms/n64 或 roms/sfc',
        noResults: '没有匹配的游戏',
        search: '搜索游戏…',
        recent: '最近启动',
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
        empty: 'No games found in the working folder',
        emptyHint: 'Put ROMs in roms/fc, roms/gba, roms/n64 or roms/sfc',
        noResults: 'No matching games',
        search: 'Search games…',
        recent: 'Recently played',
        scanFailed: 'Scan failed: {error}',
        openFailed: 'Cannot start game: {error}',
        loading: 'Scanning…',
        count: '{count} games',
      },
    },
  });

  function initialOf(name) {
    const trimmed = String(name || '').trim();
    return trimmed ? Array.from(trimmed)[0].toUpperCase() : '?';
  }

  function fuzzyMatch(text, query) {
    if (!query) return true;
    if (text.includes(query)) return true;
    let index = 0;
    for (let i = 0; i < text.length && index < query.length; i += 1) {
      if (text[i] === query[index]) index += 1;
    }
    return index === query.length;
  }

  function buildNameIndex(data) {
    const index = new Map();
    const engines = (data && data.engines) || [];
    for (const engine of engines) {
      for (const game of engine.games || []) {
        if (!index.has(game.id)) index.set(game.id, String(game.name || '').toLowerCase());
      }
    }
    return index;
  }

  function mount(body) {
    const state = {
      data: null,
      selectedId: '',
      busy: false,
      cleanup: null,
      query: '',
      collapsed: new Set(),
      nameIndex: new Map(),
      searchTimer: null,
    };
    let refreshTimer = null;
    let disposed = false;
    let categories = [];

    const scrollRoot = document.getElementById('content');
    const sentinelCallbacks = new WeakMap();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const callback = sentinelCallbacks.get(entry.target);
          if (callback) callback();
        }
      },
      { root: scrollRoot || null, rootMargin: '300px 0px', threshold: 0 }
    );

    function watchSentinel(node, callback) {
      sentinelCallbacks.set(node, callback);
      observer.observe(node);
    }

    function unwatchSentinel(node) {
      sentinelCallbacks.delete(node);
      observer.unobserve(node);
    }

    const searchWrap = el('div', { class: 'game-search' });
    const searchIcon = el('span', { class: 'game-search-icon' }, Icons.search(14));
    const searchInput = el('input', {
      class: 'field game-search-input',
      type: 'search',
      placeholder: i18n.t('gameTool.search'),
      spellcheck: 'false',
      autocomplete: 'off',
    });
    searchWrap.append(searchIcon, searchInput);

    const status = el('div', { class: 'game-status hidden' }, '');
    const list = el('div', { class: 'game-list' }, '');

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
      const label = game.label || engineLabel;
      const button = el('button', {
        class: 'game-tile',
        type: 'button',
        dataset: { id: game.id },
        'data-tip': game.name,
      });
      if (game.id === state.selectedId) button.classList.add('selected');
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
          const fallback = placeholder(game, label);
          if (cover.parentNode) cover.parentNode.replaceChild(fallback, cover);
        });
      } else {
        cover = placeholder(game, label);
      }
      const name = el('span', { class: 'game-name' }, game.name);
      button.append(cover, name);
      button.addEventListener('click', () => select(game.id));
      button.addEventListener('dblclick', () => openGame(game.id));
      return button;
    }

    function placeholder(game, engineLabel) {
      const node = el('div', { class: 'game-cover game-cover-placeholder' });
      node.append(
        el('span', { class: 'game-cover-engine' }, engineLabel),
        el('span', { class: 'game-cover-initial' }, initialOf(game.name))
      );
      return node;
    }

    function renderChunk(category) {
      if (disposed || !category.active) return;
      if (category.rendered >= category.games.length) {
        unwatchSentinel(category.sentinel);
        return;
      }
      const end = Math.min(category.rendered + CHUNK_SIZE, category.games.length);
      const fragment = document.createDocumentFragment();
      for (let i = category.rendered; i < end; i += 1) {
        fragment.appendChild(tile(category.games[i], category.label));
      }
      category.grid.appendChild(fragment);
      category.rendered = end;
      if (category.rendered >= category.games.length) unwatchSentinel(category.sentinel);
    }

    function setCategoryCollapsed(category, collapsed) {
      category.active = !collapsed;
      category.section.classList.toggle('collapsed', collapsed);
      category.head.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      category.grid.hidden = collapsed;
      if (collapsed) {
        unwatchSentinel(category.sentinel);
        category.grid.innerHTML = '';
        category.rendered = 0;
        state.collapsed.add(category.id);
        return;
      }
      state.collapsed.delete(category.id);
      renderChunk(category);
      if (category.rendered < category.games.length) {
        watchSentinel(category.sentinel, () => renderChunk(category));
      }
    }

    function createCategory(engine, games) {
      const section = el('section', { class: 'game-category' });
      const head = el('button', { class: 'game-category-head', type: 'button' });
      const caret = el('span', { class: 'game-category-caret' }, Icons.caretRight(11));
      const label = engine.id === 'recent' ? i18n.t('gameTool.recent') : engine.label;
      head.append(
        caret,
        el('span', { class: 'game-category-title' }, label),
        el('span', { class: 'game-category-count' }, i18n.t('gameTool.count', { count: games.length }))
      );
      const grid = el('div', { class: 'game-grid' });
      const sentinel = el('div', { class: 'game-chunk-sentinel', 'aria-hidden': 'true' });
      section.append(head, grid, sentinel);

      const category = {
        id: engine.id,
        label,
        games,
        section,
        head,
        grid,
        sentinel,
        rendered: 0,
        active: true,
      };
      head.addEventListener('click', () => setCategoryCollapsed(category, category.active));
      if (state.collapsed.has(category.id)) {
        setCategoryCollapsed(category, true);
      } else {
        watchSentinel(sentinel, () => renderChunk(category));
      }
      return category;
    }

    function clearCategories() {
      for (const category of categories) unwatchSentinel(category.sentinel);
      categories = [];
      list.innerHTML = '';
    }

    function restoreSelection() {
      if (!state.selectedId) return;
      const exists = categories.some((category) =>
        category.games.some((game) => game.id === state.selectedId)
      );
      if (exists) select(state.selectedId);
      else state.selectedId = '';
    }

    function emptyState(isSearch) {
      const empty = el('div', { class: 'game-empty' });
      empty.appendChild(
        el('div', { class: 'text-[13px] text-fg' }, i18n.t(isSearch ? 'gameTool.noResults' : 'gameTool.empty'))
      );
      if (!isSearch) {
        empty.appendChild(
          el('div', { class: 'mt-1 text-[11px] text-fg-muted' }, i18n.t('gameTool.emptyHint'))
        );
      }
      return empty;
    }

    function renderList() {
      clearCategories();
      const query = state.query.trim().toLowerCase();
      const engines = (state.data && state.data.engines) || [];
      let total = 0;
      for (const engine of engines) {
        let games = engine.games || [];
        if (query) {
          games = games.filter((game) =>
            fuzzyMatch(state.nameIndex.get(game.id) || String(game.name || '').toLowerCase(), query)
          );
        }
        if (!games.length) continue;
        total += games.length;
        const category = createCategory(engine, games);
        categories.push(category);
        list.appendChild(category.section);
      }
      if (!total) {
        list.appendChild(emptyState(Boolean(query)));
        state.selectedId = '';
        return;
      }
      restoreSelection();
    }

    function applyQuery(value) {
      const next = String(value == null ? '' : value);
      if (next === state.query) return;
      state.query = next;
      if (scrollRoot) scrollRoot.scrollTop = 0;
      renderList();
    }

    function scheduleSearch() {
      if (state.searchTimer) clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => {
        state.searchTimer = null;
        applyQuery(searchInput.value);
      }, SEARCH_DEBOUNCE_MS);
    }

    function applyData(data) {
      state.data = data;
      state.nameIndex = buildNameIndex(data);
      if (!data || !data.ok) {
        setStatus(i18n.t('gameTool.scanFailed', { error: (data && data.error) || 'error' }), true);
      } else {
        setStatus('');
      }
      renderList();
    }

    async function refresh() {
      if (state.busy || disposed) return;
      state.busy = true;
      setStatus(i18n.t('gameTool.loading'));
      try {
        const data = await window.ships.games.scan();
        if (!disposed) applyData(data);
      } catch (err) {
        if (!disposed) setStatus(i18n.t('gameTool.scanFailed', { error: err.message }), true);
      } finally {
        state.busy = false;
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

    searchInput.addEventListener('input', scheduleSearch);
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        if (state.searchTimer) clearTimeout(state.searchTimer);
        state.searchTimer = null;
        applyQuery(searchInput.value);
        return;
      }
      if (event.key === 'Escape' && searchInput.value) {
        event.stopPropagation();
        searchInput.value = '';
        applyQuery('');
      }
    });

    const offWorkdir = window.ships.games.onWorkdirChanged(scheduleRefresh);
    window.addEventListener('focus', scheduleRefresh);
    document.addEventListener('keydown', onKeydown);

    body.append(searchWrap, status, list);
    refresh();

    state.cleanup = () => {
      disposed = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (state.searchTimer) clearTimeout(state.searchTimer);
      observer.disconnect();
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
