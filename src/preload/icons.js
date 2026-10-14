'use strict';

const fs = require('fs');
const path = require('path');

const ICONS_DIR = path.join(__dirname, '..', '..', 'assets', 'icons');
// 悬浮球图标（设置里可选）：assets/icons/ball/*.svg，返回 { names, icons }。
const BALL_ICONS_DIR = path.join(ICONS_DIR, 'ball');

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

function loadBallIcons() {
  const icons = {};
  let files = [];
  try {
    files = fs.readdirSync(BALL_ICONS_DIR);
  } catch (err) {
    return { names: [], icons: {} };
  }
  const names = files.filter((file) => file.endsWith('.svg')).sort();
  for (const file of names) {
    try {
      icons[file] = fs.readFileSync(path.join(BALL_ICONS_DIR, file), 'utf8').trim();
    } catch (err) {
      /* skip unreadable icon */
    }
  }
  return { names, icons };
}

module.exports = { loadIcons, loadBallIcons, ICONS_DIR };
