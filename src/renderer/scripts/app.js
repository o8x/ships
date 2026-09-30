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
    version: document.getElementById('footer-version'),
    terminal: document.getElementById('btn-terminal'),
    networkTest: document.getElementById('btn-network-test'),
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
    const tool = registry.get(id);
    if (!tool) {
      dom.content.innerHTML = emptyState(i18n.t('emptyTools'));
      return;
    }

    const header = el('div', { class: 'tool-head' });
    header.appendChild(el('h1', { class: 'tool-head-title' }, i18n.t(`tools.${id}`)));
    header.appendChild(el('div', { class: 'tool-head-desc' }, i18n.t(`toolDesc.${id}`)));
    dom.content.appendChild(header);

    const body = el('div', {});
    dom.content.appendChild(body);

    try {
      const dispose = tool.mount(body);
      if (typeof dispose === 'function') state.cleanup = dispose;
    } catch (err) {
      console.error(err);
      dom.content.innerHTML = emptyState(String(err && err.message));
    }

    dom.content.scrollTop = 0;
  }

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
      btn.innerHTML = Icons[tool.icon](22);
      btn.addEventListener('click', () => setActive(tool.id));
      dom.tablist.appendChild(btn);
    }
  }

  function renderBrand() {
    dom.brandName.textContent = i18n.t('appName');
  }

  function updatePin() {
    const pinned = Boolean(state.settings.pinWindow);
    dom.pin.innerHTML = Icons.pin(15);
    dom.pin.setAttribute('data-tip', i18n.t(pinned ? 'common.unpin' : 'common.pin'));
    dom.pin.style.color = pinned ? 'var(--color-accent)' : '';
    dom.pin.style.background = pinned
      ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)'
      : '';
    dom.brand.classList.toggle('brand-drag', pinned);
  }

  function renderFooter() {
    dom.version.textContent = `v${state.version}`;
    dom.settings.innerHTML = Icons.gear(18);
    dom.settings.setAttribute('data-tip', i18n.t('settings'));
    dom.networkTest.innerHTML = Icons.wifi(15);
    dom.networkTest.setAttribute('data-tip', i18n.t('networkTest'));
    dom.terminal.innerHTML = Icons.terminal(15);
    dom.terminal.setAttribute('data-tip', i18n.t('terminal'));
  }

  function applySettings(settings) {
    state.settings = settings || {};
    i18n.setLocale(state.settings.locale || 'zh');
    window.ShipsTheme.set(state.settings);
    // Glass is macOS-only; on other platforms keep the opaque surfaces.
    const glass = Boolean(state.settings.vibrancy) && state.platform === 'darwin';
    document.documentElement.setAttribute('data-vibrancy', glass ? 'on' : 'off');
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
    dom.pin.addEventListener('click', () => {
      window.ships.setSettings({ pinWindow: !state.settings.pinWindow });
    });

    window.ships.onSettingsChanged((next) => {
      const localeChanged = next.locale !== state.settings.locale;
      applySettings(next);
      updatePin();
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
