'use strict';

const fs = require('fs');
const path = require('path');

const FLAGS_DIR = path.join(__dirname, '..', '..', 'assets', 'flags');
const cache = new Map();
const CODE_RE = /^[A-Za-z]{2}$/;

function get(code, shape) {
  if (typeof code !== 'string' || !CODE_RE.test(code)) return '';
  const suffix = shape === '1x1' ? '_1x1' : '';
  const key = `${code.toUpperCase()}${suffix}`;
  if (cache.has(key)) return cache.get(key);
  let svg = '';
  try {
    svg = fs.readFileSync(path.join(FLAGS_DIR, `${key}.svg`), 'utf8').trim();
  } catch (err) {
    svg = '';
  }
  cache.set(key, svg);
  return svg;
}

module.exports = { get, FLAGS_DIR };
