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

  setDetected(alias, osName) {
    this.detected[alias] = { os: osName, at: Date.now() };
    writeJson(SSH_DETECTED_FILE, this.detected);
    this.emit('detected', { alias, os: osName, at: Date.now() });
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
      .then((osName) => {
        this.pending.delete(host.alias);
        this.setDetected(host.alias, osName);
      })
      .catch((err) => {
        logger.warn('detect failed:', err.message);
        this.pending.delete(host.alias);
        this.setDetected(host.alias, 'unknown');
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
      const finish = (osName) => {
        if (settled) return;
        settled = true;
        try {
          client.end();
        } catch (err) {
          /* ignore */
        }
        resolve(osName);
      };

      const classify = (output) => {
        const lower = String(output).trim().toLowerCase();
        if (lower.includes('darwin') || lower.includes('mac')) return 'macos';
        if (lower.includes('linux')) return 'linux';
        if (lower.includes('bsd')) return 'bsd';
        return null;
      };

      client.on('ready', () => {
        client.exec('uname -s', (err, stream) => {
          if (err) return finish('unknown');
          let out = '';
          stream.on('data', (data) => {
            out += data.toString();
          });
          stream.stderr.on('data', () => {});
          stream.on('close', () => {
            const osName = classify(out);
            if (osName) return finish(osName);
            client.exec('cmd /c ver', (winErr, winStream) => {
              if (winErr) return finish('unknown');
              let winOut = '';
              winStream.on('data', (data) => {
                winOut += data.toString();
              });
              winStream.on('close', () =>
                finish(winOut.toLowerCase().includes('windows') ? 'windows' : 'unknown')
              );
            });
          });
        });
      });

      client.on('error', () => finish('unknown'));
      try {
        client.connect(options);
      } catch (err) {
        finish('unknown');
      }
    });
  }
}

module.exports = new SshService();
