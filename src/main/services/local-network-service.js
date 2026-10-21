'use strict';

const os = require('os');
const dgram = require('dgram');
const logger = require('../utils/logger');

const BROADCAST_PORT = 9;
const MDNS_ADDRESS = '224.0.0.251';
const MDNS_PORT = 5353;
// Keep the triggering socket alive so the system alert is not tied to a very
// short-lived operation, and retry a few times: macOS may dismiss the alert
// without recording a decision, in which case a later operation prompts again.
const SOCKET_HOLD_MS = 30000;
const RETRY_DELAY_MS = 2500;
const RETRY_ATTEMPTS = 3;
// Coalesce requests fired by several window focus / connection events at once.
const MIN_REQUEST_INTERVAL_MS = 2000;

let lastRequestAt = 0;

function ipv4ToInt(ip) {
  return ip.split('.').reduce((value, part) => (value << 8) + (Number(part) & 0xff), 0) >>> 0;
}

function intToIpv4(value) {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 0xff).join('.');
}

function broadcastAddresses() {
  const result = new Set();
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family !== 'IPv4' || entry.internal || !entry.netmask) continue;
      const address = ipv4ToInt(entry.address);
      const mask = ipv4ToInt(entry.netmask);
      result.add(intToIpv4((address | (~mask >>> 0)) >>> 0));
    }
  }
  return Array.from(result);
}

/* macOS 15+ 的「本地网络」权限只会在应用实际访问局域网时弹出。
   向各网卡广播地址和 mDNS 组播发送一个空 UDP 包触发系统授权；
   socket 保持打开一段时间，并在请求时重试几次，避免弹窗因操作过快结束而消失。 */
function triggerOnce() {
  const targets = broadcastAddresses();
  let socket;
  try {
    socket = dgram.createSocket('udp4');
  } catch (err) {
    return;
  }

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    try {
      socket.close();
    } catch (err) {
      /* ignore */
    }
  };

  socket.on('error', close);
  socket.bind(() => {
    try {
      socket.setBroadcast(true);
      const packet = Buffer.from([0]);
      for (const target of targets) socket.send(packet, BROADCAST_PORT, target, () => {});
      socket.send(packet, MDNS_PORT, MDNS_ADDRESS, () => {});
      logger.file('[net] requested macOS local network access');
    } catch (err) {
      /* ignore */
    }
    setTimeout(close, SOCKET_HOLD_MS);
  });
}

/* macOS 只有在应用处于前台时才会稳定展示本地网络授权框；
   菜单栏 app（LSUIElement）不会自动成为前台，这里主动激活一次。 */
function activateApp() {
  try {
    const { app } = require('electron');
    if (app && typeof app.focus === 'function') app.focus({ steal: true });
  } catch (err) {
    /* ignore */
  }
}

/* 请求本地网络授权。可在启动、窗口获得焦点、发起 SSH / 网络测试时重复调用；
   短时间内多次调用会合并，不会连续轰炸系统弹窗。 */
function requestLocalNetworkAccess() {
  if (process.platform !== 'darwin') return;
  const now = Date.now();
  if (now - lastRequestAt < MIN_REQUEST_INTERVAL_MS) return;
  lastRequestAt = now;
  activateApp();
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    setTimeout(triggerOnce, attempt * RETRY_DELAY_MS);
  }
}

module.exports = { requestLocalNetworkAccess };
