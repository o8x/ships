'use strict';

const fs = require('fs');
const path = require('path');
const { SSH_CONFIG_FILE } = require('../utils/paths');
const logger = require('../utils/logger');

const MANAGED_KEYS = new Set(['hostname', 'user', 'port', 'identityfile', 'proxyjump']);

/* 分组：在 `~/.ssh/config` 里用一行注释 `# group: <名称>` 作为分组标记，
   紧随其后的 Host 属于该分组，直到遇到下一个分组标记或文件结束。
   未标记的 Host 属于「未分组」（group = ''）。ssh 会忽略注释，不影响连接行为。 */
const GROUP_RE = /^\s*#\s*group\s*:\s*(\S.*?)\s*$/i;

function isHostLine(line) {
  return !/^\s*#/.test(line) && /^\s*Host\s+/i.test(line);
}

function isMatchLine(line) {
  return !/^\s*#/.test(line) && /^\s*Match\s+/i.test(line);
}

function isGroupLine(line) {
  return GROUP_RE.test(line);
}

function groupNameFromLine(line) {
  const match = GROUP_RE.exec(line);
  return match ? match[1].trim() : '';
}

function parseEntries(content) {
  const lines = content.length ? content.split(/\r?\n/) : [];
  const entries = [];
  let current = { kind: 'raw', lines: [] };
  entries.push(current);
  let group = '';

  for (const line of lines) {
    if (isHostLine(line)) {
      const patterns = line.replace(/^\s*Host\s+/i, '').trim().split(/\s+/).filter(Boolean);
      current = { kind: 'host', patterns, group, lines: [line] };
      entries.push(current);
    } else if (isGroupLine(line)) {
      group = groupNameFromLine(line);
      current = { kind: 'group', name: group, lines: [line] };
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

function trimBlankEdges(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') start += 1;
  while (end > start && lines[end - 1].trim() === '') end -= 1;
  return lines.slice(start, end);
}

function serializeEntries(entries) {
  // 块之间留一个空行；分组标记紧跟其首个 Host（不留空行）。
  let out = '';
  let prevKind = null;
  for (const entry of entries) {
    const lines = trimBlankEdges(entry.lines);
    if (!lines.length) continue;
    if (out !== '') out += prevKind === 'group' && entry.kind === 'host' ? '\n' : '\n\n';
    out += lines.join('\n');
    prevKind = entry.kind;
  }
  return out;
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
    group: entry.group || '',
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

/* 列出所有分组名（按在文件中出现的先后、去重、忽略大小写；不含未分组）。 */
function listGroups() {
  const entries = parseEntries(readContent());
  const seen = new Set();
  const groups = [];
  for (const entry of entries) {
    if (entry.kind !== 'group') continue;
    const name = (entry.name || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    groups.push(name);
  }
  return groups;
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

/* 删除没有跟随任何 Host 的分组标记（例如删掉某分组最后一个主机后）。 */
function pruneEmptyGroups(entries) {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (entries[i].kind !== 'group') continue;
    let hasHost = false;
    for (let j = i + 1; j < entries.length; j += 1) {
      if (entries[j].kind === 'group') break;
      if (entries[j].kind === 'host') {
        hasHost = true;
        break;
      }
    }
    if (!hasHost) entries.splice(i, 1);
  }
}

/* 把主机块插到合适位置：未分组接在文件顶部说明之后；有分组接在该分组末尾。 */
function insertHostEntry(entries, hostEntry) {
  const groupName = (hostEntry.group || '').toLowerCase();

  if (!groupName) {
    const at = entries[0] && entries[0].kind === 'raw' ? 1 : 0;
    entries.splice(at, 0, hostEntry);
    return;
  }

  const gi = entries.findIndex(
    (entry) => entry.kind === 'group' && (entry.name || '').toLowerCase() === groupName
  );
  if (gi >= 0) {
    let at = gi + 1;
    for (let i = gi + 1; i < entries.length; i += 1) {
      if (entries[i].kind === 'group') break;
      at = i + 1;
    }
    entries.splice(at, 0, hostEntry);
    return;
  }

  entries.push({ kind: 'group', name: hostEntry.group, lines: [`# group: ${hostEntry.group}`] });
  entries.push(hostEntry);
}

function upsert(host) {
  if (!host || !host.alias) return list();
  const entries = parseEntries(readContent());
  const targetAlias = (host.originalAlias || host.alias).toLowerCase();
  const index = entries.findIndex(
    (entry) => entry.kind === 'host' && (entry.patterns[0] || '').toLowerCase() === targetAlias
  );

  const group = String(host.group || '').trim();
  const preserved = preservedFrom(index >= 0 ? entries[index] : null);
  const lines = serializeHost(host, preserved);
  const hostEntry = { kind: 'host', patterns: [host.alias], group, lines };

  // 分组未变：就地替换，保持原位置（避免每次编辑都挪到分组末尾）。
  if (index >= 0 && (entries[index].group || '').toLowerCase() === group.toLowerCase()) {
    entries[index] = hostEntry;
    writeContent(serializeEntries(entries));
    return list();
  }

  if (index >= 0) entries.splice(index, 1);
  pruneEmptyGroups(entries);
  insertHostEntry(entries, hostEntry);

  writeContent(serializeEntries(entries));
  return list();
}

/* 重命名分组：把 config 里所有匹配 `from` 的 `# group:` 注释改成 `to`（不区分大小写）。
   若目标名与已有分组同名，会在 config 中产生同名标记（UI 层已拦截，避免意外合并）。 */
function renameGroup(from, to) {
  const source = String(from || '').trim();
  const target = String(to || '').trim();
  if (!source || !target || source.toLowerCase() === target.toLowerCase()) return list();
  const entries = parseEntries(readContent());
  let changed = false;
  for (const entry of entries) {
    if (entry.kind === 'group' && (entry.name || '').toLowerCase() === source.toLowerCase()) {
      entry.name = target;
      entry.lines = [`# group: ${target}`];
      changed = true;
    }
  }
  if (changed) writeContent(serializeEntries(entries));
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
    pruneEmptyGroups(entries);
    writeContent(serializeEntries(entries));
  }
  return list();
}

module.exports = {
  list,
  listGroups,
  upsert,
  remove,
  renameGroup,
  _parseEntries: parseEntries,
  _serializeEntries: serializeEntries,
  CONFIG_FILE: SSH_CONFIG_FILE,
};
