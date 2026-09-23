'use strict';

const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { EventEmitter } = require('events');
const { Client } = require('ssh2');
const { SSH_DETECTED_FILE } = require('../utils/paths');
const { readJson, writeJson } = require('../utils/json-store');
const logger = require('../utils/logger');

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_@%+=:,./~-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

function appleScriptString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function expandHome(filePath) {
  if (!filePath) return filePath;
  return filePath.startsWith('~') ? filePath.replace(/^~/, os.homedir()) : filePath;
}

const OS_LABELS = {
  ubuntu: 'Ubuntu',
  debian: 'Debian',
  fedora: 'Fedora',
  arch: 'Arch Linux',
  centos: 'CentOS',
  rhel: 'Red Hat',
  redhat: 'Red Hat',
  'red-hat': 'Red Hat',
  rocky: 'Rocky Linux',
  almalinux: 'AlmaLinux',
  alpine: 'Alpine',
  manjaro: 'Manjaro',
  opensuse: 'openSUSE',
  'opensuse-leap': 'openSUSE',
  'opensuse-tumbleweed': 'openSUSE',
  kali: 'Kali Linux',
  linuxmint: 'Linux Mint',
  mint: 'Linux Mint',
  gentoo: 'Gentoo',
  slackware: 'Slackware',
  oracle: 'Oracle Linux',
  amzn: 'Amazon Linux',
  elementary: 'elementary OS',
  freebsd: 'FreeBSD',
  openbsd: 'OpenBSD',
  netbsd: 'NetBSD',
  dragonfly: 'DragonFly BSD',
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
  bsd: 'BSD',
  unknown: 'Unknown',
};

const UNKNOWN_OS = { os: 'unknown', family: 'unknown', label: 'Unknown' };

function capitalize(text) {
  const value = String(text || '');
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function labelFor(id) {
  return OS_LABELS[id] || capitalize(id);
}

// Parses combined `uname -s` + `/etc/os-release` output into an OS descriptor.
function parseOsInfo(output) {
  const text = String(output || '');
  const separator = text.indexOf('|||');
  const uname = (separator >= 0 ? text.slice(0, separator) : text).trim().toLowerCase();
  const release = separator >= 0 ? text.slice(separator + 3) : '';

  if (uname.includes('darwin')) return { os: 'macos', family: 'macos', label: 'macOS' };

  if (uname.includes('linux')) {
    const idMatch = /^ID="?([a-z0-9._-]+)"?/im.exec(release);
    const id = idMatch ? idMatch[1].toLowerCase() : 'linux';
    return { os: id, family: 'linux', label: labelFor(id) };
  }

  if (uname.includes('bsd')) {
    const name = uname.split(/\s+/)[0];
    return { os: name, family: 'bsd', label: labelFor(name) };
  }

  return null;
}

class SshService extends EventEmitter {
  constructor() {
    super();
    this.detected = readJson(SSH_DETECTED_FILE, {});
    this.pending = new Set();
  }

  getDetected() {
    return Object.assign({}, this.detected);
  }

  isPending(alias) {
    return this.pending.has(alias);
  }

  setDetected(alias, info) {
    const result = info || UNKNOWN_OS;
    this.detected[alias] = {
      os: result.os,
      family: result.family,
      label: result.label,
      at: Date.now(),
    };
    writeJson(SSH_DETECTED_FILE, this.detected);
    this.emit('detected', { alias, ...this.detected[alias] });
  }

  buildCommand(host) {
    const parts = ['ssh'];
    if (host.port && Number(host.port) !== 22) parts.push('-p', String(host.port));
    if (host.identityFile) parts.push('-i', shellQuote(host.identityFile));
    if (host.proxyJump) parts.push('-J', host.proxyJump);
    parts.push(host.user ? `${host.user}@${host.hostName}` : host.hostName);
    return parts.join(' ');
  }

  connect(host) {
    const command = this.buildCommand(host);
    const script =
      'tell application "iTerm"\n' +
      '  activate\n' +
      '  set newWindow to (create window with default profile)\n' +
      '  tell current session of newWindow\n' +
      `    write text ${appleScriptString(command)}\n` +
      '  end tell\n' +
      'end tell';

    return new Promise((resolve) => {
      execFile('osascript', ['-e', script], (err) => {
        if (err) {
          logger.warn('iTerm launch failed:', err.message);
          resolve({ ok: false, error: err.message, command });
          return;
        }
        resolve({ ok: true, command });
      });
    });
  }

  detect(host) {
    if (!host || !host.alias || this.pending.has(host.alias)) return;
    this.pending.add(host.alias);
    this.runDetect(host)
      .then((info) => {
        this.pending.delete(host.alias);
        this.setDetected(host.alias, info);
      })
      .catch((err) => {
        logger.warn('detect failed:', err.message);
        this.pending.delete(host.alias);
        this.setDetected(host.alias, UNKNOWN_OS);
      });
  }

  runDetect(host) {
    return new Promise((resolve) => {
      const client = new Client();
      const options = {
        host: host.hostName,
        port: Number(host.port) || 22,
        username: host.user || undefined,
        readyTimeout: 8000,
        keepaliveInterval: 0,
      };
      if (process.env.SSH_AUTH_SOCK) options.agent = process.env.SSH_AUTH_SOCK;
      if (host.identityFile) {
        try {
          options.privateKey = fs.readFileSync(expandHome(host.identityFile));
        } catch (err) {
          logger.debug('read identity file failed:', err.message);
        }
      }

      let settled = false;
      const finish = (info) => {
        if (settled) return;
        settled = true;
        try {
          client.end();
        } catch (err) {
          /* ignore */
        }
        resolve(info || UNKNOWN_OS);
      };

      client.on('ready', () => {
        const command = "uname -s 2>/dev/null; echo '|||'; (cat /etc/os-release 2>/dev/null || true)";
        client.exec(command, (err, stream) => {
          if (err) return finish(UNKNOWN_OS);
          let out = '';
          stream.on('data', (data) => {
            out += data.toString();
          });
          stream.stderr.on('data', () => {});
          stream.on('close', () => {
            const info = parseOsInfo(out);
            if (info) return finish(info);
            client.exec('cmd /c ver', (winErr, winStream) => {
              if (winErr) return finish(UNKNOWN_OS);
              let winOut = '';
              winStream.on('data', (data) => {
                winOut += data.toString();
              });
              winStream.on('close', () =>
                finish(
                  winOut.toLowerCase().includes('windows')
                    ? { os: 'windows', family: 'windows', label: 'Windows' }
                    : UNKNOWN_OS
                )
              );
            });
          });
        });
      });

      client.on('error', () => finish(UNKNOWN_OS));
      try {
        client.connect(options);
      } catch (err) {
        finish(UNKNOWN_OS);
      }
    });
  }
}

module.exports = new SshService();
module.exports.parseOsInfo = parseOsInfo;
module.exports.OS_LABELS = OS_LABELS;
