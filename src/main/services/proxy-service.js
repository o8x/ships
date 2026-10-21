'use strict';

// macOS system proxy support (off unless settings.followSystemProxy is true).
//
// Resolution is delegated to Electron's session.resolveProxy(), so both static
// system proxies and PAC scripts are honoured. Supported proxy kinds:
//   - SOCKS5 (used for SSH / SFTP, and for HTTP(S) requests)
//   - HTTP / HTTPS (CONNECT tunnel, used for HTTP(S) requests; SSH goes direct)
// Anything else falls back to a direct connection. Proxy authentication is not
// supported: a proxy that requires credentials is treated as unavailable.
//
// Terminal children get http(s)_proxy / all_proxy env vars; SSH clients started
// from the built-in terminal get a `ProxyCommand nc -X 5` option, and ssh2
// sessions get a pre-connected SOCKS5 socket.

const net = require('net');
const tls = require('tls');
const http = require('http');
const https = require('https');
const { execFileSync } = require('child_process');
const { session } = require('electron');
const settings = require('./settings-service');
const logger = require('../utils/logger');

const PROXY_CACHE_TTL_MS = 30000;
const PROXY_TIMEOUT_MS = 10000;
const NO_PROXY = 'localhost,127.0.0.1,::1';

const resolvedCache = new Map(); // `${host}:${port}` -> { at, proxy }
let genericProxy = null; // fallback for terminal env when only PAC is configured

function enabled() {
  return settings.get('followSystemProxy') === true;
}

function formatHost(host) {
  return net.isIPv6(host) ? `[${host}]` : host;
}

/* `scutil --proxy` prints a dictionary; parse the scalar keys we care about. */
function readSystemProxy() {
  if (process.platform !== 'darwin') return {};
  try {
    const out = execFileSync('/usr/sbin/scutil', ['--proxy'], { encoding: 'utf8' });
    const result = {};
    for (const line of out.split('\n')) {
      const match = /^\s*([A-Za-z0-9]+)\s*:\s*(.+?)\s*$/.exec(line);
      if (!match) continue;
      let value = match[2];
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (/^-?\d+$/.test(value)) value = Number(value);
      result[match[1]] = value;
    }
    return result;
  } catch (err) {
    return {};
  }
}

function staticProxy() {
  const p = readSystemProxy();
  if (p.HTTPEnable === 1 || p.HTTPEnable === true) {
    return { kind: 'http', host: p.HTTPProxy, port: Number(p.HTTPPort) };
  }
  if (p.HTTPSEnable === 1 || p.HTTPSEnable === true) {
    return { kind: 'http', host: p.HTTPSProxy, port: Number(p.HTTPSPort) };
  }
  if (p.SOCKSEnable === 1 || p.SOCKSEnable === true) {
    return { kind: 'socks5', host: p.SOCKSProxy, port: Number(p.SOCKSPort) };
  }
  return null;
}

/* Parse Electron's resolveProxy() result, e.g. "SOCKS5 127.0.0.1:7891; DIRECT". */
function parseResolverResult(text) {
  const entries = String(text || '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const entry of entries) {
    const [kindRaw, hostPortRaw] = entry.split(/\s+/, 2);
    const kind = String(kindRaw || '').toUpperCase();
    if (kind === 'DIRECT') return { kind: 'direct' };
    if (!hostPortRaw) continue;
    const match = /^\[?([^\]]+?)\]?:(\d+)$/.exec(hostPortRaw);
    if (!match) continue;
    const port = Number(match[2]);
    if (!port) continue;
    if (kind === 'PROXY' || kind === 'HTTP' || kind === 'HTTPS') {
      return { kind: 'http', host: match[1], port };
    }
    if (kind === 'SOCKS' || kind === 'SOCKS5') {
      return { kind: 'socks5', host: match[1], port };
    }
    // SOCKS4 / unknown: keep looking for a supported entry.
  }
  return { kind: 'direct' };
}

async function resolveTarget(host, port) {
  if (!enabled() || !host || !port) return { kind: 'direct' };
  const key = `${host}:${port}`;
  const cached = resolvedCache.get(key);
  if (cached && Date.now() - cached.at < PROXY_CACHE_TTL_MS) return cached.proxy;

  let proxy = { kind: 'direct' };
  try {
    const text = await session.defaultSession.resolveProxy(`http://${formatHost(host)}:${port}/`);
    proxy = parseResolverResult(text);
  } catch (err) {
    logger.file(`[proxy] resolve failed for ${key}: ${err.message}`);
  }
  resolvedCache.set(key, { at: Date.now(), proxy });
  return proxy;
}

/* SOCKS5 only: used by ssh2 and by the CLI ssh ProxyCommand. */
async function resolveSocks(host, port) {
  const proxy = await resolveTarget(host, port);
  return proxy.kind === 'socks5' ? proxy : null;
}

function ipv6ToBuffer(address) {
  const [head, tail] = String(address).split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const fill = 8 - left.length - right.length;
  const parts = left.concat(Array(Math.max(0, fill)).fill('0'), right);
  const buffer = Buffer.alloc(16);
  parts.forEach((part, index) => buffer.writeUInt16BE(parseInt(part || '0', 16), index * 2));
  return buffer;
}

function createSocksSocket(proxy, targetHost, targetPort) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: proxy.host, port: proxy.port });
    let buffer = Buffer.alloc(0);
    let stage = 0;
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch (e) {
        /* ignore */
      }
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      if (stage === 0) {
        if (buffer.length < 2) return;
        if (buffer[0] !== 0x05 || buffer[1] !== 0x00) return fail(new Error('SOCKS5 authentication rejected'));
        buffer = buffer.subarray(2);
        const host = String(targetHost);
        const hostBuffer = Buffer.from(host, 'utf8');
        const address = net.isIPv4(host)
          ? Buffer.from([0x01, ...host.split('.').map(Number)])
          : net.isIPv6(host)
            ? Buffer.concat([Buffer.from([0x04]), ipv6ToBuffer(host)])
            : Buffer.concat([Buffer.from([0x03, hostBuffer.length]), hostBuffer]);
        const port = Buffer.alloc(2);
        port.writeUInt16BE(Number(targetPort));
        socket.write(Buffer.concat([Buffer.from([0x05, 0x01, 0x00]), address, port]));
        stage = 1;
        return;
      }

      if (stage === 1) {
        if (buffer.length < 5) return;
        if (buffer[0] !== 0x05) return fail(new Error('SOCKS5 invalid reply'));
        if (buffer[1] !== 0x00) return fail(new Error(`SOCKS5 connect failed (${buffer[1]})`));
        const atyp = buffer[3];
        const addressLength =
          atyp === 0x01 ? 4 : atyp === 0x04 ? 16 : atyp === 0x03 ? 1 + (buffer[4] || 0) : 0;
        const total = 4 + addressLength + 2;
        if (buffer.length < total) return;
        const rest = buffer.subarray(total);
        settled = true;
        socket.removeListener('data', onData);
        socket.removeListener('error', fail);
        socket.setTimeout(0);
        if (rest.length) socket.unshift(rest);
        resolve(socket);
      }
    };

    socket.setTimeout(PROXY_TIMEOUT_MS, () => fail(new Error('SOCKS5 proxy timeout')));
    socket.once('error', fail);
    socket.once('connect', () => socket.write(Buffer.from([0x05, 0x01, 0x00])));
    socket.on('data', onData);
  });
}

function createHttpTunnel(proxy, targetHost, targetPort) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: proxy.host, port: proxy.port });
    let buffer = Buffer.alloc(0);
    let settled = false;
    const target = `${formatHost(targetHost)}:${targetPort}`;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch (e) {
        /* ignore */
      }
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const end = buffer.indexOf('\r\n\r\n');
      if (end < 0) return;
      const head = buffer.subarray(0, end).toString('latin1');
      const rest = buffer.subarray(end + 4);
      const match = /^HTTP\/\d\.\d\s+(\d{3})/.exec(head);
      if (!match || Number(match[1]) < 200 || Number(match[1]) >= 300) {
        return fail(new Error(`proxy CONNECT failed: ${head.split('\r\n')[0] || 'unknown'}`));
      }
      settled = true;
      socket.removeListener('data', onData);
      socket.removeListener('error', fail);
      socket.setTimeout(0);
      if (rest.length) socket.unshift(rest);
      resolve(socket);
    };

    socket.setTimeout(PROXY_TIMEOUT_MS, () => fail(new Error('HTTP proxy timeout')));
    socket.once('error', fail);
    socket.once('connect', () => {
      socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\nProxy-Connection: keep-alive\r\n\r\n`);
    });
    socket.on('data', onData);
  });
}

function createTunnelSocket(proxy, targetHost, targetPort) {
  if (proxy.kind === 'socks5') return createSocksSocket(proxy, targetHost, targetPort);
  if (proxy.kind === 'http') return createHttpTunnel(proxy, targetHost, targetPort);
  return Promise.reject(new Error('unsupported proxy'));
}

/* Agent for the updater's Node http(s) requests. */
async function agentForUrl(parsed) {
  if (!enabled() || !parsed || !parsed.hostname) return null;
  const secure = parsed.protocol === 'https:';
  const port = Number(parsed.port) || (secure ? 443 : 80);
  const proxy = await resolveTarget(parsed.hostname, port);
  if (proxy.kind === 'direct') return null;

  const Base = secure ? https.Agent : http.Agent;
  class TunnelAgent extends Base {
    createConnection(options, callback) {
      createTunnelSocket(proxy, options.host, options.port)
        .then((socket) => {
          if (!secure) {
            callback(null, socket);
            return;
          }
          const tlsSocket = tls.connect({
            socket,
            servername: options.servername || options.host,
          });
          tlsSocket.once('error', callback);
          tlsSocket.once('secureConnect', () => callback(null, tlsSocket));
        })
        .catch(callback);
    }
  }
  return new TunnelAgent({ keepAlive: false });
}

/* Env for terminal children. PAC can only be resolved per target; we use the
   static proxy when present, otherwise a generic resolution warmed at startup. */
function terminalEnv() {
  if (!enabled()) return {};
  const proxy = staticProxy() || genericProxy;
  if (!proxy || proxy.kind === 'direct' || !proxy.host || !proxy.port) return {};

  const hostPort = `${formatHost(proxy.host)}:${proxy.port}`;
  const env = {};
  if (proxy.kind === 'socks5') {
    env.ALL_PROXY = `socks5h://${hostPort}`;
    env.all_proxy = env.ALL_PROXY;
  } else {
    env.HTTP_PROXY = `http://${hostPort}`;
    env.http_proxy = env.HTTP_PROXY;
    env.HTTPS_PROXY = env.HTTP_PROXY;
    env.https_proxy = env.HTTPS_PROXY;
  }
  env.NO_PROXY = NO_PROXY;
  env.no_proxy = NO_PROXY;
  logger.file(`[proxy] terminal env -> ${proxy.kind} ${hostPort}`);
  return env;
}

/* Pre-resolve a generic proxy for terminal env when only PAC is configured. */
async function warmUp() {
  resolvedCache.clear();
  genericProxy = null;
  if (!enabled()) return;
  try {
    const proxy = await resolveTarget('example.com', 443);
    if (proxy.kind !== 'direct') genericProxy = proxy;
  } catch (err) {
    logger.file(`[proxy] warm-up failed: ${err.message}`);
  }
}

function init() {
  settings.on('changed', (_data, keys) => {
    if (!keys || keys.includes('followSystemProxy')) warmUp().catch(() => {});
  });
  warmUp().catch(() => {});
}

module.exports = {
  init,
  enabled,
  resolveTarget,
  resolveSocks,
  createSocksSocket,
  createHttpTunnel,
  createTunnelSocket,
  agentForUrl,
  terminalEnv,
  warmUp,
  // exported for offline verification
  parseResolverResult,
  staticProxy,
};
