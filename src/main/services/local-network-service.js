'use strict';

const os = require('os');
const dgram = require('dgram');
const logger = require('../utils/logger');

const BROADCAST_PORT = 9;
const MDNS_ADDRESS = '224.0.0.251';
const MDNS_PORT = 5353;
// 只请求一次，并让触发用的 socket 保持 30 秒，避免系统授权框随操作瞬间结束而消失。
const SOCKET_HOLD_MS = 30000;

let requested = false;

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
   向各网卡广播地址和 mDNS 组播各发一个空 UDP 包触发系统授权，socket 保持 30 秒；
   成功 / 失败都写一条日志（不再定时重试 / 不再由窗口焦点反复触发）。 */
function triggerOnce() {
  const targets = broadcastAddresses();
  let socket;
  try {
    socket = dgram.createSocket('udp4');
  } catch (err) {
    logger.file(`[net] local network access failed: ${err.message}`);
    return;
  }

  let closed = false;
  let reported = false;
  const report = (ok, detail) => {
    if (reported) return;
    reported = true;
    if (ok) logger.file(`[net] local network access requested (hold=${SOCKET_HOLD_MS}ms, targets=${detail})`);
    else logger.file(`[net] local network access failed: ${detail}`);
  };
  const close = () => {
    if (closed) return;
    closed = true;
    try {
      socket.close();
    } catch (err) {
      /* ignore */
    }
  };

  socket.on('error', (err) => {
    report(false, err.message);
    close();
  });
  socket.bind(() => {
    try {
      socket.setBroadcast(true);
      const packet = Buffer.from([0]);
      const destinations = targets.map((address) => ({ address, port: BROADCAST_PORT }));
      destinations.push({ address: MDNS_ADDRESS, port: MDNS_PORT });
      let pending = destinations.length;
      let firstError = null;
      for (const destination of destinations) {
        socket.send(packet, destination.port, destination.address, (err) => {
          if (err && !firstError) firstError = err;
          pending -= 1;
          if (pending === 0) {
            if (firstError) report(false, firstError.message);
            else report(true, destinations.length);
          }
        });
      }
    } catch (err) {
      report(false, err.message);
      close();
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

/* 请求本地网络授权：每个进程只执行一次（启动时），之后的所有调用都是空操作。
   触发用 socket 保持 30 秒；成功 / 失败均写日志。 */
function requestLocalNetworkAccess() {
  if (process.platform !== 'darwin') return;
  if (requested) return;
  requested = true;
  activateApp();
  triggerOnce();
}

module.exports = { requestLocalNetworkAccess };
