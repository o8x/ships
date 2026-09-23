'use strict';

(function bootstrap() {
  const registry = window.ShipsToolRegistry;
  const { Icons, el } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  const dom = {
    tabbar: document.getElementById('tabbar'),
    content: document.getElementById('content'),
    version: document.getElementById('footer-version'),
    settings: document.getElementById('btn-settings'),
  };

  const state = {
    settings: {},
    version: window.ShipsConstants.FALLBACK_VERSION,
    activeId: null,
  };

  function emptyState(message) {
    return `<div class="flex h-full items-center justify-center text-fg-muted">${message}</div>`;
  }

  function mountTool(id) {
    dom.content.innerHTML = '';
    const tool = registry.get(id);
    if (!tool) {
      dom.content.innerHTML = emptyState(i18n.t('emptyTools'));
      return;
    }
    try {
      tool.mount(dom.content);
    } catch (err) {
      console.error(err);
      dom.content.innerHTML = emptyState(String(err && err.message));
    }
  }

  function setActive(id) {
    state.activeId = id;
    Array.from(dom.tabbar.children).forEach((btn) => {
      btn.classList.toggle('tab-active', btn.dataset.tool === id);
    });
    mountTool(id);
  }

  function renderTabs() {
    dom.tabbar.innerHTML = '';
    for (const tool of registry.all()) {
      const btn = el('button', {
        class: 'tab',
        title: i18n.t(`tools.${tool.id}`),
        dataset: { tool: tool.id },
      });
      btn.innerHTML = Icons[tool.icon](20);
      btn.addEventListener('click', () => setActive(tool.id));
      dom.tabbar.appendChild(btn);
    }
  }

  function renderFooter() {
    dom.version.textContent = `v${state.version}`;
    dom.settings.innerHTML = Icons.gear(18);
    dom.settings.title = i18n.t('settings');
  }

  function applySettings(settings) {
    state.settings = settings || {};
    i18n.setLocale(state.settings.locale || 'zh');
    window.ShipsTheme.set(state.settings);
  }

  async function boot() {
    if (!window.ships) {
      dom.content.innerHTML = emptyState('preload unavailable');
      return;
    }

    const [settings, info] = await Promise.all([window.ships.getSettings(), window.ships.getInfo()]);
    applySettings(settings);
    state.version = (info && info.version) || window.ShipsConstants.FALLBACK_VERSION;

    renderTabs();
    renderFooter();

    const tools = registry.all();
    if (tools.length) setActive(tools[0].id);
    else dom.content.innerHTML = emptyState(i18n.t('emptyTools'));

    dom.settings.addEventListener('click', () => window.ships.openSettings());

    window.ships.onSettingsChanged((next) => {
      const localeChanged = next.locale !== state.settings.locale;
      applySettings(next);
      if (localeChanged) {
        renderTabs();
        renderFooter();
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
