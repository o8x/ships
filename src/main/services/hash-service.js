'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ALGORITHMS = ['md5', 'sha1', 'sha256'];

function hashText(text) {
  const out = {};
  for (const algorithm of ALGORITHMS) {
    out[algorithm] = crypto.createHash(algorithm).update(String(text), 'utf8').digest('hex');
  }
  return out;
}

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const hashes = {};
    for (const algorithm of ALGORITHMS) hashes[algorithm] = crypto.createHash(algorithm);
    const stream = fs.createReadStream(file);
    stream.on('data', (chunk) => {
      for (const algorithm of ALGORITHMS) hashes[algorithm].update(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => {
      const out = {};
      for (const algorithm of ALGORITHMS) out[algorithm] = hashes[algorithm].digest('hex');
      resolve(out);
    });
  });
}

function fileInfo(file) {
  const stat = fs.statSync(file);
  const home = os.homedir();
  const tilde = file.startsWith(home) ? `~${file.slice(home.length)}` : file;
  return { path: file, name: path.basename(file), size: stat.size, tilde };
}

module.exports = { hashText, hashFile, fileInfo, ALGORITHMS };
