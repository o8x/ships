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

  // Expose the display pixel density so CSS can enable Retina-only effects
  // (hairline borders / subtle elevation) only on HiDPI screens.
  const dprMql = window.matchMedia('(resolution: 2dppx)');

  function applyDpr() {
    root.setAttribute('data-dpr', window.devicePixelRatio >= 2 ? '2' : '1');
  }

  function apply() {
    root.setAttribute('data-theme', effectiveTheme());
    if (settings.accent) root.style.setProperty('--color-accent', settings.accent);
  }

  mql.addEventListener('change', apply);
  dprMql.addEventListener('change', applyDpr);
  window.addEventListener('resize', applyDpr);

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
  applyDpr();
})();
