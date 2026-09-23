'use strict';

const fs = require('fs');
const path = require('path');
const { SSH_CONFIG_FILE } = require('../utils/paths');
const logger = require('../utils/logger');

const MANAGED_KEYS = new Set(['hostname', 'user', 'port', 'identityfile', 'proxyjump']);

function isHostLine(line) {
  return !/^\s*#/.test(line) && /^\s*Host\s+/i.test(line);
}

function isMatchLine(line) {
  return !/^\s*#/.test(line) && /^\s*Match\s+/i.test(line);
}

function parseEntries(content) {
  const lines = content.length ? content.split(/\r?\n/) : [];
  const entries = [];
  let current = { kind: 'raw', lines: [] };
  entries.push(current);

  for (const line of lines) {
    if (isHostLine(line)) {
      const patterns = line.replace(/^\s*Host\s+/i, '').trim().split(/\s+/).filter(Boolean);
      current = { kind: 'host', patterns, lines: [line] };
      entries.push(current);
    } else if (isMatchLine(line)) {
      current = { kind: 'raw', lines: [line] };
      entries.push(current);
    } else {
      current.lines.push(line);
    }
  }
  return entries;
}

function serializeEntries(entries) {
  return entries.map((entry) => entry.lines.join('\n')).join('\n');
}

function parseFields(entry) {
  const fields = {};
  for (const line of entry.lines.slice(1)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^(\S+)\s+(.*)$/.exec(trimmed);
    if (!match) continue;
    fields[match[1].toLowerCase()] = match[2].trim();
  }
  return fields;
}

function hostFromEntry(entry) {
  const alias = entry.patterns[0];
  const fields = parseFields(entry);
  const wildcard = entry.patterns.some((pattern) => /[*?]/.test(pattern));
  return {
    alias,
    aliases: entry.patterns,
    wildcard,
    hostName: fields.hostname || alias,
    user: fields.user || '',
    port: Number(fields.port) || 22,
    identityFile: fields.identityfile || '',
    proxyJump: fields.proxyjump || '',
    fields,
  };
}

function readContent() {
  try {
    return fs.readFileSync(SSH_CONFIG_FILE, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') logger.warn('read ssh config failed:', err.message);
    return '';
  }
}

function writeContent(content) {
  fs.mkdirSync(path.dirname(SSH_CONFIG_FILE), { recursive: true, mode: 0o700 });
  const existing = fs.existsSync(SSH_CONFIG_FILE);
  fs.writeFileSync(SSH_CONFIG_FILE, content, { mode: 0o600 });
  if (!existing) fs.chmodSync(SSH_CONFIG_FILE, 0o600);
}

function list() {
  const entries = parseEntries(readContent());
  return entries
    .filter((entry) => entry.kind === 'host')
    .map(hostFromEntry)
    .filter((host) => !host.wildcard);
}

function serializeHost(host, preservedLines) {
  const lines = [`Host ${host.alias}`];
  if (host.hostName && host.hostName !== host.alias) lines.push(`  HostName ${host.hostName}`);
  if (host.user) lines.push(`  User ${host.user}`);
  if (host.port && Number(host.port) !== 22) lines.push(`  Port ${host.port}`);
  if (host.identityFile) lines.push(`  IdentityFile ${host.identityFile}`);
  if (host.proxyJump) lines.push(`  ProxyJump ${host.proxyJump}`);
  if (preservedLines && preservedLines.length) lines.push(...preservedLines);
  return lines;
}

function preservedFrom(entry) {
  if (!entry) return [];
  return entry.lines.slice(1).filter((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return true;
    const match = /^(\S+)\s/.exec(trimmed);
    return !match || !MANAGED_KEYS.has(match[1].toLowerCase());
  });
}

function upsert(host) {
  if (!host || !host.alias) return list();
  const entries = parseEntries(readContent());
  const targetAlias = (host.originalAlias || host.alias).toLowerCase();
  const index = entries.findIndex(
    (entry) => entry.kind === 'host' && (entry.patterns[0] || '').toLowerCase() === targetAlias
  );

  const preserved = preservedFrom(index >= 0 ? entries[index] : null);
  const lines = serializeHost(host, preserved);

  if (index >= 0) {
    entries[index] = { kind: 'host', patterns: [host.alias], lines };
  } else {
    const last = entries[entries.length - 1];
    if (last && last.lines.length && last.lines[last.lines.length - 1].trim() !== '') {
      last.lines.push('');
    }
    entries.push({ kind: 'host', patterns: [host.alias], lines });
  }

  writeContent(serializeEntries(entries));
  return list();
}

function remove(alias) {
  const target = String(alias || '').toLowerCase();
  if (!target) return list();
  const entries = parseEntries(readContent());
  const index = entries.findIndex(
    (entry) => entry.kind === 'host' && (entry.patterns[0] || '').toLowerCase() === target
  );
  if (index >= 0) {
    entries.splice(index, 1);
    writeContent(serializeEntries(entries));
  }
  return list();
}

module.exports = {
  list,
  upsert,
  remove,
  _parseEntries: parseEntries,
  _serializeEntries: serializeEntries,
  CONFIG_FILE: SSH_CONFIG_FILE,
};
