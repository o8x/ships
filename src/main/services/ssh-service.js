'use strict';

const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { EventEmitter } = require('events');
const { Client } = require('ssh2');
const { SSH_DETECTED_FILE } = require('../utils/paths');
const { readJson, writeJson } = require('../utils/json-store');
const iterm = require('./iterm-service');
const logger = require('../utils/logger');

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_@%+=:,./~-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

function expandHome(filePath) {
  if (!filePath) return filePath;
  return filePath.startsWith('~') ? filePath.replace(/^~/, os.homedir()) : filePath;
}

// A GUI app launched from Finder does not inherit the shell's SSH_AUTH_SOCK;
// fall back to the value exported into launchd by the login session.
function getAgentSocket() {
  if (process.env.SSH_AUTH_SOCK) return process.env.SSH_AUTH_SOCK;
  try {
    const out = execFileSync('launchctl', ['getenv', 'SSH_AUTH_SOCK'], { encoding: 'utf8' }).trim();
    return out || '';
  } catch (err) {
    return '';
  }
}

// ~/.ssh/id_ed25519 and ~/.ssh/id_rsa are used by ssh automatically, so we omit
// -i for them (both the "~" form and the expanded absolute path).
const DEFAULT_IDENTITIES = ['~/.ssh/id_ed25519', '~/.ssh/id_rsa'];

function isDefaultIdentity(file) {
  const value = String(file || '').trim();
  if (!value) return false;
  const expanded = expandHome(value);
  return DEFAULT_IDENTITIES.some((def) => value === def || expanded === expandHome(def));
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

// Shared ssh2 connection options (agent socket + IdentityFile), reused by probes
// and by the directory browser.
function connectionOptions(host, overrides) {
  const options = {
    host: host.hostName,
    port: Number(host.port) || 22,
    username: host.user || undefined,
    readyTimeout: 8000,
    keepaliveInterval: 0,
  };
  const agentSocket = getAgentSocket();
  if (agentSocket) options.agent = agentSocket;
  if (host.identityFile) {
    try {
      options.privateKey = fs.readFileSync(expandHome(host.identityFile));
    } catch (err) {
      logger.error(`[ssh] read identity file failed (${host.identityFile}): ${err.message}`);
    }
  }
  return Object.assign(options, overrides || {});
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

  /* `ssh [选项] 目标主机 [远端命令]` —— 选项必须排在主机之前，命令必须排在主机之后。 */
  buildCommand(host, options) {
    const opts = options || {};
    const parts = ['ssh'];
    if (host.port && Number(host.port) !== 22) parts.push('-p', String(host.port));
    if (host.identityFile && !isDefaultIdentity(host.identityFile)) {
      parts.push('-i', shellQuote(host.identityFile));
    }
    if (host.proxyJump) parts.push('-J', host.proxyJump);
    if (opts.forceTty) parts.push('-t');
    parts.push(host.user ? `${host.user}@${host.hostName}` : host.hostName);
    if (opts.command) parts.push(opts.command);
    return parts.join(' ');
  }

  connect(host) {
    const command = this.buildCommand(host);
    logger.file(`[ssh] connect(alias=${host.alias}) command: ${command}`);
    return iterm.openCommand(command, `ssh connect(alias=${host.alias})`);
  }

  detect(host) {
    if (!host || !host.alias || this.pending.has(host.alias)) return;
    logger.file(`[ssh] detect start alias=${host.alias} host=${host.hostName} port=${host.port} user=${host.user || '-'} identity=${host.identityFile || '-'}`);
    this.pending.add(host.alias);
    this.runDetect(host)
      .then((info) => {
        this.pending.delete(host.alias);
        this.setDetected(host.alias, info);
      })
      .catch((err) => {
        logger.error(`[ssh] detect(alias=${host.alias}) failed: ${err.message}`);
        this.pending.delete(host.alias);
        this.setDetected(host.alias, UNKNOWN_OS);
      });
  }

  runDetect(host, auth) {
    return new Promise((resolve) => {
      const client = new Client();
      // 可选密码认证：设置里填了密码（或该主机已存密码）时，用它探测；
      // 同时开 tryKeyboard 以兼容用 keyboard-interactive 提交密码的服务器。
      const password = auth && auth.password ? String(auth.password) : '';
      const overrides = password ? { password, tryKeyboard: true } : null;
      const options = connectionOptions(host, overrides);

      logger.file(
        `[ssh] connecting ${host.alias} -> ${options.host}:${options.port} ` +
          `user=${options.username || '-'} agent=${options.agent || '-'} ` +
          `privateKey=${options.privateKey ? 'yes' : 'no'} password=${password ? 'yes' : 'no'}`
      );

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
        logger.file(`[ssh] ready ${host.alias}; exec: ${command}`);
        client.exec(command, (err, stream) => {
          if (err) {
            logger.error(`[ssh] exec failed (${host.alias}): ${err.message}`);
            return finish(UNKNOWN_OS);
          }
          let out = '';
          let errOut = '';
          stream.on('data', (data) => {
            out += data.toString();
          });
          stream.stderr.on('data', (data) => {
            errOut += data.toString();
          });
          stream.on('close', () => {
            logger.file(`[ssh] output ${host.alias}: ${JSON.stringify(out.trim())}`);
            if (errOut.trim()) logger.file(`[ssh] stderr ${host.alias}: ${JSON.stringify(errOut.trim())}`);
            const info = parseOsInfo(out);
            if (info) {
              logger.file(`[ssh] result ${host.alias}: ${JSON.stringify(info)}`);
              return finish(info);
            }
            client.exec('cmd /c ver', (winErr, winStream) => {
              if (winErr) return finish(UNKNOWN_OS);
              let winOut = '';
              winStream.on('data', (data) => {
                winOut += data.toString();
              });
              winStream.on('close', () => {
                const isWindows = winOut.toLowerCase().includes('windows');
                logger.file(`[ssh] windows fallback ${host.alias}: ${isWindows}`);
                finish(isWindows ? { os: 'windows', family: 'windows', label: 'Windows' } : UNKNOWN_OS);
              });
            });
          });
        });
      });

      // keyboard-interactive 认证（部分服务器）：对每个提示都回填密码。
      if (password) {
        client.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finishPrompt) => {
          finishPrompt((prompts || []).map(() => password));
        });
      }

      client.on('error', (err) => {
        logger.error(`[ssh] connection error (${host.alias} ${options.host}:${options.port}): ${err.message}`);
        finish(UNKNOWN_OS);
      });
      client.on('close', (hadError) => {
        if (hadError) logger.file(`[ssh] connection closed with error (${host.alias})`);
      });
      try {
        client.connect(options);
      } catch (err) {
        logger.error(`[ssh] connect throw (${host.alias}): ${err.message}`);
        finish(UNKNOWN_OS);
      }
    });
  }
}

module.exports = new SshService();
module.exports.parseOsInfo = parseOsInfo;
module.exports.OS_LABELS = OS_LABELS;
module.exports.connectionOptions = connectionOptions;
module.exports.shellQuote = shellQuote;
module.exports.getAgentSocket = getAgentSocket;
