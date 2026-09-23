'use strict';

(function initTheme() {
  const root = document.documentElement;
  let settings = { theme: 'system', accent: '#2e6bfc' };
  const mql = window.matchMedia('(prefers-color-scheme: dark)');

  function effectiveTheme() {
    if (settings.theme === 'dark') return 'dark';
    if (settings.theme === 'light') return 'light';
    return mql.matches ? 'dark' : 'light';
  }

  function apply() {
    root.setAttribute('data-theme', effectiveTheme());
    if (settings.accent) root.style.setProperty('--color-accent', settings.accent);
  }

  mql.addEventListener('change', apply);

  window.ShipsTheme = {
    set(next) {
      settings = Object.assign({}, settings, next || {});
      apply();
    },
    get() {
      return Object.assign({}, settings);
    },
    apply,
  };

  apply();
})();
