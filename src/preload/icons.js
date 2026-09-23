'use strict';

const fs = require('fs');
const path = require('path');

const ICONS_DIR = path.join(__dirname, '..', '..', 'assets', 'icons');

function camelCase(name) {
  return name.replace(/-([a-z0-9])/g, (_match, char) => char.toUpperCase());
}

function loadIcons() {
  const icons = {};
  let files = [];
  try {
    files = fs.readdirSync(ICONS_DIR);
  } catch (err) {
    return icons;
  }
  for (const file of files) {
    if (!file.endsWith('.svg')) continue;
    const name = camelCase(file.slice(0, -4));
    try {
      icons[name] = fs.readFileSync(path.join(ICONS_DIR, file), 'utf8').trim();
    } catch (err) {
      /* skip unreadable icon */
    }
  }
  return icons;
}

module.exports = { loadIcons, ICONS_DIR };
