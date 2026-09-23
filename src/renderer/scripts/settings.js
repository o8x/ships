'use strict';

(function bootstrapSettings() {
  const registry = window.ShipsSettingsRegistry;
  const { Icons, el } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  const dom = {
    nav: document.getElementById('settings-nav'),
    pane: document.getElementById('settings-pane'),
    title: document.getElementById('settings-title'),
  };

  const state = { settings: {}, info: null, activeId: null, cleanup: null };

  const ctx = {
    get settings() {
      return state.settings;
    },
    get info() {
      return state.info;
    },
    patch(partial) {
      window.ships.setSettings(partial).then((next) => {
        state.settings = next;
      });
    },
  };

  function drawNav() {
    dom.nav.innerHTML = '';
    for (const item of registry.all()) {
      const button = el('button', { class: 'settings-nav-item', dataset: { id: item.id }, type: 'button' });
      button.appendChild(el('span', { class: 'inline-flex' }, Icons[item.icon](16)));
      button.appendChild(el('span', {}, i18n.t(item.labelKey)));
      button.addEventListener('click', () => setActive(item.id));
      dom.nav.appendChild(button);
    }
  }

  function setActive(id) {
    if (typeof state.cleanup === 'function') {
      try {
        state.cleanup();
      } catch (err) {
        console.error(err);
      }
    }
    state.cleanup = null;
    state.activeId = id;
    Array.from(dom.nav.children).forEach((button) =>
      button.classList.toggle('active', button.dataset.id === id)
    );
    const item = registry.get(id);
    dom.title.textContent = item ? i18n.t(item.labelKey) : '';
    dom.pane.innerHTML = '';
    if (!item) return;
    const dispose = item.mount(dom.pane, ctx);
    if (typeof dispose === 'function') state.cleanup = dispose;
  }

  async function boot() {
    if (!window.ships) return;
    const [settings, info] = await Promise.all([window.ships.getSettings(), window.ships.getInfo()]);
    state.settings = settings || {};
    state.info = info;
    i18n.setLocale(state.settings.locale || 'zh');
    window.ShipsTheme.set(state.settings);

    drawNav();
    const sections = registry.all();
    if (sections.length) setActive(sections[0].id);

    window.ships.onSettingsChanged((next) => {
      const localeChanged = next.locale !== state.settings.locale;
      state.settings = next;
      window.ShipsTheme.set(next);
      if (localeChanged) {
        i18n.setLocale(next.locale);
        drawNav();
        setActive(state.activeId);
      }
    });

    window.ships.onThemeChanged(() => window.ShipsTheme.apply());

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') window.ships.closeSettings();
    });
  }

  boot().catch((err) => console.error(err));
})();
