'use strict';

window.ShipsSettingsRegistry = (function createSettingsRegistry() {
  const sections = [];
  return {
    register(section) {
      if (!section || !section.id || typeof section.mount !== 'function') return;
      sections.push(section);
    },
    all() {
      return sections.slice();
    },
    get(id) {
      return sections.find((section) => section.id === id);
    },
  };
})();
