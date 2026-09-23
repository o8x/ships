'use strict';

window.ShipsToolRegistry = (function createRegistry() {
  const tools = [];
  return {
    register(tool) {
      if (!tool || !tool.id || typeof tool.mount !== 'function') return;
      tools.push(tool);
    },
    all() {
      return tools.slice();
    },
    get(id) {
      return tools.find((tool) => tool.id === id);
    },
  };
})();
