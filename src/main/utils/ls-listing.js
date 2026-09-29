'use strict';

// Remote directory listing: builds the `sh` command and parses its output.
// Kept free of electron / ssh2 dependencies so it can be exercised in plain node.
// Entries keep the remote `ls` order (run with LC_ALL=C, i.e. byte order): this
// module never re-sorts, so what the panel shows matches `ls` on the host.

// Safety valve for very large directories (only the first entries are returned).
const LIST_LIMIT = 2000;

// `ls -l` prints, for both GNU coreutils and BSD/macOS:
//   mode links owner group size <date> <name>
// where <date> is "Mon DD HH:MM" for recent files and "Mon DD  YYYY" for older ones.
const ENTRY_RE = /^([-dlbcps])([rwxsStT-]{9})[+@.]?\s+\d+\s+\S+\s+\S+\s+(\d+)(?:,\s*\d+)?\s+(.*)$/;
// "Mon DD HH:MM" / "Mon DD  YYYY" (GNU, macOS) and the day-first variant (some BSDs).
// The month token stays loose so a non-C LC_TIME (e.g. "9月") still parses.
const DATE_RES = [
  /^\S+\s+\d{1,2}\s+(?:\d{1,2}:\d{2}|\d{4})\s+(.*)$/,
  /^\d{1,2}\s+\S+\s+(?:\d{1,2}:\d{2}|\d{4})\s+(.*)$/,
];

const TYPE_BY_MODE = {
  d: 'dir',
  l: 'link',
  '-': 'file',
};

/* `cd <dir> && pwd -P && ls -l`; exit codes: 3 no dir, 4 no pwd, 5 no listing.
   The body runs through `sh -c` so a non-POSIX login shell (fish / csh) cannot break
   it. LC_ALL is cleared (an empty value does not override) and only the time format is
   pinned to C, so the entry order stays whatever `ls` does for this session's locale —
   i.e. the panel lists a directory in the same order as plain `ls`.
   `--quoting-style=literal` (GNU) keeps names byte-for-byte instead of shell-escaping
   them; BSD/macOS `ls` lacks the flag, so a plain `ls -l` is used as fallback. */
function buildListCommand(quote, dir) {
  const target = dir ? quote(dir) : '~';
  const script =
    `cd ${target} 2>/dev/null || exit 3; pwd -P || exit 4; ` +
    'LC_ALL= LC_TIME=C ls -l --quoting-style=literal 2>/dev/null || ' +
    'LC_ALL= LC_TIME=C ls -l || exit 5';
  return `sh -c ${quote(script)}`;
}

/* Entries the panel must never show: the `.` / `..` placeholders and blank names. */
function isIgnoredName(name) {
  const value = String(name == null ? '' : name);
  if (!value || value === '.' || value === '..') return true;
  return !value.replace(/[\s\u0000-\u001f]/g, '');
}

/* Parses `pwd -P` + `ls -l` output; returns the absolute path and its entries. */
function parseListing(output) {
  const lines = String(output == null ? '' : output).split('\n');
  let index = 0;
  while (index < lines.length && !lines[index].trim()) index += 1;
  const path = (lines[index] || '').trim();
  const entries = [];
  let truncated = false;
  for (let i = index + 1; i < lines.length; i += 1) {
    const entry = parseEntry(lines[i]);
    if (!entry) continue;
    if (isIgnoredName(entry.name)) continue;
    if (entries.length >= LIST_LIMIT) {
      truncated = true;
      break;
    }
    entries.push(entry);
  }
  return { path, entries, truncated };
}

function parseEntry(line) {
  const match = ENTRY_RE.exec(String(line).replace(/\r$/, ''));
  if (!match) return null;
  const rest = match[4];
  let rawName = '';
  for (const dateRe of DATE_RES) {
    const nameMatch = dateRe.exec(rest);
    if (!nameMatch) continue;
    rawName = nameMatch[1];
    break;
  }
  if (!rawName) rawName = rest.split(/\s+/).slice(3).join(' ');
  if (!rawName) return null;

  const type = TYPE_BY_MODE[match[1]] || 'other';
  const entry = { name: rawName, type, size: Number(match[3]) || 0 };
  if (type === 'link') {
    const arrow = rawName.indexOf(' -> ');
    if (arrow > 0) {
      entry.name = rawName.slice(0, arrow);
      entry.target = rawName.slice(arrow + 4);
    }
  }
  entry.name = entry.name.replace(/\r$/, '');
  return entry;
}

/* Directories first, everything else after — both groups keep the order `ls` gave
   them (stable partition, nothing is re-sorted by name). */
function dirsFirst(entries) {
  const dirs = [];
  const rest = [];
  for (const entry of entries) (entry.type === 'dir' ? dirs : rest).push(entry);
  return dirs.concat(rest);
}

module.exports = { LIST_LIMIT, buildListCommand, parseListing, parseEntry, isIgnoredName, dirsFirst };
