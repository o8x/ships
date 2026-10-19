'use strict';

const os = require('os');
const dgram = require('dgram');
const logger = require('../utils/logger');

const BROADCAST_PORT = 9;
const MDNS_ADDRESS = '224.0.0.251';
const MDNS_PORT = 5353;

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
   启动时向各网卡广播地址和 mDNS 组播发送一个空 UDP 包，提前触发系统授权。 */
function requestLocalNetworkAccess() {
  if (process.platform !== 'darwin') return;
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
    setTimeout(close, 400);
  });
}

module.exports = { requestLocalNetworkAccess };
