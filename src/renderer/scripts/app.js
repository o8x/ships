'use strict';

(function bootstrap() {
  const registry = window.ShipsToolRegistry;
  const { Icons, el } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  const dom = {
    tablist: document.getElementById('tablist'),
    brand: document.getElementById('brand'),
    brandName: document.getElementById('brand-name'),
    content: document.getElementById('content'),
    headerHost: document.getElementById('tool-head-host'),
    version: document.getElementById('footer-version'),
    dev: document.getElementById('footer-dev'),
    terminal: document.getElementById('btn-terminal'),
    files: document.getElementById('btn-files'),
    networkTest: document.getElementById('btn-network-test'),
    theme: document.getElementById('btn-theme'),
    pin: document.getElementById('btn-pin'),
    settings: document.getElementById('btn-settings'),
  };

  const state = {
    settings: {},
    version: window.ShipsConstants.FALLBACK_VERSION,
    platform: null,
    activeId: null,
    cleanup: null,
  };

  function emptyState(message) {
    return `<div class="flex h-full items-center justify-center text-fg-muted">${message}</div>`;
  }

  function mountTool(id) {
    if (typeof state.cleanup === 'function') {
      try {
        state.cleanup();
      } catch (err) {
        console.error(err);
      }
    }
    state.cleanup = null;
    dom.content.innerHTML = '';
    dom.headerHost.innerHTML = '';
    dom.headerHost.classList.remove('is-compact');
    const tool = registry.get(id);
    dom.content.classList.toggle('tool-fill', Boolean(tool && tool.fill === true));
    if (!tool) {
      dom.content.innerHTML = emptyState(i18n.t('emptyTools'));
      return;
    }

    const header = el('div', { class: 'tool-head' });
    header.appendChild(el('h1', { class: 'tool-head-title' }, i18n.t(`tools.${id}`)));
    header.appendChild(el('div', { class: 'tool-head-desc' }, i18n.t(`toolDesc.${id}`)));
    dom.headerHost.appendChild(header);

    const body = el('div', { class: 'tool-body' });
    dom.content.appendChild(body);

    try {
      const dispose = tool.mount(body);
      if (typeof dispose === 'function') state.cleanup = dispose;
    } catch (err) {
      console.error(err);
      dom.content.innerHTML = emptyState(String(err && err.message));
    }

    dom.content.scrollTop = 0;
    updateHeaderCompact();
  }

  /* 工具标题固定在内容区上方；内容滚动后标题缩小、说明并到同一行。 */
  let headerCompact = false;
  let headerScrollFrame = 0;
  const headerCollapseLockMs =
    (window.ShipsConstants && window.ShipsConstants.HEADER_COLLAPSE_LOCK_MS) || 190;
  let headerLockUntil = 0;

  function setHeaderCompact(compact) {
    if (compact === headerCompact) return;
    headerCompact = compact;
    headerLockUntil = performance.now() + headerCollapseLockMs;
    dom.headerHost.classList.toggle('is-compact', compact);
  }

  function updateHeaderCompact(scrolled) {
    const compact = typeof scrolled === 'boolean' ? scrolled : dom.content.scrollTop > 0.5;
    setHeaderCompact(compact);
  }

  function onContentScroll(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target !== dom.content && !dom.content.contains(target)) return;
    if (headerScrollFrame) return;
    headerScrollFrame = requestAnimationFrame(() => {
      headerScrollFrame = 0;
      updateHeaderCompact(target.scrollTop > 0.5);
    });
  }

  document.addEventListener('scroll', onContentScroll, true);

  /* 内容在最顶部时，第一次滚轮先把标题收起（内容保持不动），之后才滚动内容；
     回到顶部后向上滚则先展开标题。标题始终独占一行，内容不会滚到它下面。 */
  function canScroll(el) {
    return Boolean(el) && el.scrollHeight > el.clientHeight + 1;
  }

  function nearestScroller(node) {
    let el = node instanceof Element ? node : null;
    while (el) {
      if (el === dom.content) return canScroll(el) ? el : null;
      const style = getComputedStyle(el);
      if (/(auto|scroll)/.test(style.overflowY) && canScroll(el)) return el;
      el = el.parentElement;
    }
    return null;
  }

  function onContentWheel(event) {
    if (!event.deltaY || Math.abs(event.deltaY) < 0.5) return;
    if (nearestScroller(event.target) !== dom.content) return;
    if (dom.content.scrollTop > 0) return;
    if (event.deltaY > 0 && !headerCompact) {
      event.preventDefault();
      setHeaderCompact(true);
      return;
    }
    if (event.deltaY > 0 && headerCompact && performance.now() < headerLockUntil) {
      // 标题收起动画尚未完成：继续吞掉滚轮，内容保持不动。
      event.preventDefault();
      return;
    }
    if (event.deltaY < 0 && headerCompact) {
      event.preventDefault();
      setHeaderCompact(false);
    }
  }

  dom.content.addEventListener('wheel', onContentWheel, { passive: false });

  function setActive(id) {
    state.activeId = id;
    Array.from(dom.tablist.children).forEach((btn) => {
      btn.classList.toggle('tab-active', btn.dataset.tool === id);
    });
    mountTool(id);
  }

  function orderedTools() {
    const all = registry.all();
    const order = window.ShipsToolOrder;
    if (!Array.isArray(order) || !order.length) return all;
    const index = new Map(order.map((id, position) => [id, position]));
    return all.slice().sort((a, b) => {
      const ia = index.has(a.id) ? index.get(a.id) : Number.MAX_SAFE_INTEGER;
      const ib = index.has(b.id) ? index.get(b.id) : Number.MAX_SAFE_INTEGER;
      return ia - ib;
    });
  }

  function renderTabs() {
    dom.tablist.innerHTML = '';
    for (const tool of orderedTools()) {
      const btn = el('button', {
        class: 'tab',
        'data-tip': i18n.t(`tools.${tool.id}`),
        dataset: { tool: tool.id },
      });
      btn.innerHTML = Icons[tool.icon](24, true);
      btn.addEventListener('click', () => setActive(tool.id));
      dom.tablist.appendChild(btn);
    }
  }

  function renderBrand() {
    dom.brandName.textContent = i18n.t('appName');
  }

  function updatePin() {
    // 图钉只在悬浮模式有意义；窗口模式隐藏。
    if (isWindowMode()) {
      dom.pin.style.display = 'none';
      dom.brand.classList.remove('brand-drag');
      return;
    }
    dom.pin.style.display = '';
    const pinned = Boolean(state.settings.pinWindow);
    dom.pin.innerHTML = Icons.pin(15);
    dom.pin.setAttribute('data-tip', i18n.t(pinned ? 'common.unpin' : 'common.pin'));
    dom.pin.style.color = pinned ? 'var(--color-accent)' : '';
    dom.pin.style.background = pinned
      ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)'
      : '';
    dom.brand.classList.toggle('brand-drag', pinned);
  }

  /* 底部「外观」按钮：跟随系统 / 浅色 / 深色 循环切换，图标与提示随当前值变化。 */
  function renderThemeButton() {
    if (!dom.theme) return;
    const theme = state.settings.theme || 'system';
    const icon = theme === 'light' ? Icons.sun : theme === 'dark' ? Icons.moon : Icons.monitor;
    dom.theme.innerHTML = (icon || Icons.monitor)(15);
    dom.theme.setAttribute('data-tip', i18n.t(`theme${theme.charAt(0).toUpperCase()}${theme.slice(1)}`));
    dom.theme.style.color = theme === 'system' ? '' : 'var(--color-accent)';
  }

  function cycleTheme() {
    const theme = state.settings.theme || 'system';
    const next = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
    window.ships.setSettings({ theme: next });
  }

  function renderDevBadge() {
    if (!dom.dev) return;
    const on = Boolean(state.settings.developerMode);
    dom.dev.textContent = on ? i18n.t('developerMode') : '';
    dom.dev.classList.toggle('hidden', !on);
  }

  function renderFooter() {
    dom.version.textContent = `v${state.version}`;
    renderDevBadge();
    dom.settings.innerHTML = Icons.gear(18);
    dom.settings.setAttribute('data-tip', i18n.t('settings'));
    dom.networkTest.innerHTML = Icons.wifi(15);
    dom.networkTest.setAttribute('data-tip', i18n.t('networkTest'));
    dom.terminal.innerHTML = Icons.terminal(15);
    dom.terminal.setAttribute('data-tip', i18n.t('terminal'));
    dom.files.innerHTML = Icons.folder(15);
    dom.files.setAttribute('data-tip', i18n.t('fileManager'));
    renderThemeButton();
  }

  function isWindowMode() {
    return state.settings.floatMode !== true;
  }

  function applySettings(settings) {
    state.settings = settings || {};
    i18n.setLocale(state.settings.locale || 'zh');
    window.ShipsTheme.set(state.settings);
    // 悬浮 / 窗口模式：供 CSS 切换外观（圆角、内容多列、红绿灯留白等）。
    document.documentElement.setAttribute('data-window-mode', isWindowMode() ? 'window' : 'float');
    // Glass 仅 macOS；悬浮与窗口模式都生效。
    const glass = Boolean(state.settings.vibrancy) && state.platform === 'darwin';
    document.documentElement.setAttribute('data-vibrancy', glass ? 'on' : 'off');
    applyGlassOpacity(state.settings.glassOpacity);
    renderDevBadge();
  }

  /* Liquid Glass 表面透明度（设置滑块，实时生效）：把 0–100 的透明度换算成
     surface / surface-2 / surface-3 的填充 alpha 写到 :root 的 CSS 变量。 */
  function applyGlassOpacity(value) {
    const constants = window.ShipsConstants || {};
    const def = Number.isFinite(constants.GLASS_DEFAULT_OPACITY) ? constants.GLASS_DEFAULT_OPACITY : 80;
    const maxAlpha = Number.isFinite(constants.GLASS_MAX_ALPHA) ? constants.GLASS_MAX_ALPHA : 0.4;
    let t = Number(value);
    if (!Number.isFinite(t)) t = def;
    t = Math.max(0, Math.min(100, t));
    const base = ((100 - t) / 100) * maxAlpha;
    const root = document.documentElement.style;
    root.setProperty('--glass-surface', `rgba(255, 255, 255, ${base.toFixed(3)})`);
    root.setProperty('--glass-surface-2', `rgba(255, 255, 255, ${(base * 1.5).toFixed(3)})`);
    root.setProperty('--glass-surface-3', `rgba(255, 255, 255, ${(base * 2.75).toFixed(3)})`);
  }

  async function boot() {
    if (!window.ships) {
      dom.content.innerHTML = emptyState('preload unavailable');
      return;
    }

    const [settings, info] = await Promise.all([window.ships.getSettings(), window.ships.getInfo()]);
    state.version = (info && info.version) || window.ShipsConstants.FALLBACK_VERSION;
    state.platform = (info && info.platform) || null;
    applySettings(settings);

    renderTabs();
    renderFooter();
    renderBrand();
    updatePin();

    const tools = orderedTools();
    if (tools.length) setActive(tools[0].id);
    else dom.content.innerHTML = emptyState(i18n.t('emptyTools'));

    dom.settings.addEventListener('click', () => window.ships.openSettings());
    dom.networkTest.addEventListener('click', () => window.ships.openSettings('network'));
    dom.terminal.addEventListener('click', () => window.ships.openTerminal());
    // 打开独立文件管理窗口，不选中任何连接（target 传空串）。
    dom.files.addEventListener('click', () => window.ships.fileWindow.open(''));
    dom.pin.addEventListener('click', () => {
      window.ships.setSettings({ pinWindow: !state.settings.pinWindow });
    });
    dom.theme.addEventListener('click', cycleTheme);

    window.ships.onSettingsChanged((next) => {
      const localeChanged = next.locale !== state.settings.locale;
      applySettings(next);
      updatePin();
      renderThemeButton();
      if (localeChanged) {
        renderTabs();
        renderFooter();
        renderBrand();
        mountTool(state.activeId);
      }
    });

    window.ships.onThemeChanged(() => window.ShipsTheme.apply());

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') window.ships.hideWindow();
    });
  }

  boot().catch((err) => {
    console.error(err);
  });
})();
