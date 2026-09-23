'use strict';

(async function initApp() {
  if (!window.ships) return;

  try {
    const settings = await window.ships.getSettings();
    window.ShipsTheme.set(settings);
  } catch (err) {
    console.error(err);
  }

  window.ships.onSettingsChanged((settings) => {
    window.ShipsTheme.set(settings);
  });

  window.ships.onThemeChanged(() => {
    window.ShipsTheme.apply();
  });
})();
