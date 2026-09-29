'use strict';

// Port / reachability test commands for the IP tool. Host tests use tools that ship
// with macOS (nc, ping, arp, curl); the two subnet scans use nmap.
// Pure module: no electron, no side effects, so command building and validation can
// be exercised in plain node.

const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const CIDR_RE = /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})\/(\d{1,2})$/;

// protocol -> { port: 'required' | 'optional' | 'none', subnetOnly?, label }
const PROTOCOLS = {
  tcp: { port: 'required', label: 'TCP' },
  udp: { port: 'required', label: 'UDP' },
  http: { port: 'required', label: 'HTTP(S)' },
  icmp: { port: 'none', label: 'ICMP' },
  arp: { port: 'none', label: 'ARP' },
  // Port discovery on a single host or a range; a port narrows it down.
  'scan-app': { port: 'optional', label: 'Scan app' },
  // Ping sweep of a range — needs a subnet.
  'scan-host': { port: 'none', subnetOnly: true, label: 'Scan hosts' },
};

// Connection attempts that never answer should not hang iTerm forever.
const NET_TIMEOUT_SEC = 3;
const CURL_TIMEOUT_SEC = 8;
// Subnet scans are limited to /16../30: anything wider would hammer the network and
// take forever, anything narrower is not a range worth sweeping.
const SCAN_PREFIX_MIN = 16;
const SCAN_PREFIX_MAX = 30;

function isValidIpv4(value) {
  return IPV4_RE.test(String(value == null ? '' : value).trim());
}

function isValidPort(value) {
  const text = String(value == null ? '' : value).trim();
  if (!/^\d{1,5}$/.test(text)) return false;
  const port = Number(text);
  return port >= 1 && port <= 65535;
}

function isValidCidr(value) {
  const match = CIDR_RE.exec(String(value == null ? '' : value).trim());
  if (!match) return false;
  const prefix = Number(match[5]);
  return prefix >= SCAN_PREFIX_MIN && prefix <= SCAN_PREFIX_MAX;
}

function isValidHostOrCidr(value) {
  return isValidIpv4(value) || isValidCidr(value);
}

/* Returns the shell command for a test, or null when the input is not valid. */
function buildCommand(payload) {
  const protocol = String((payload && payload.protocol) || '').toLowerCase();
  const spec = PROTOCOLS[protocol];
  const target = String((payload && payload.ip) || '').trim();
  if (!spec) return null;

  if (spec.subnetOnly) {
    if (!isValidCidr(target)) return null;
    return `nmap -sn ${target}`;
  }

  if (protocol === 'scan-app') {
    if (!isValidHostOrCidr(target)) return null;
    const port = String((payload && payload.port) || '').trim();
    // No port → nmap's default port set ("which ports are open").
    if (!port) return `nmap ${target}`;
    if (!isValidPort(port)) return null;
    // -sS (SYN) and -sU both need raw sockets, hence sudo; -p applies to both scans.
    return `sudo nmap -sS -sU -p ${Number(port)} ${target}`;
  }

  if (!isValidIpv4(target)) return null;
  const ip = target;

  if (!spec.needsPort) {
    if (protocol === 'icmp') return `ping -c 4 ${ip}`;
    return `arp -n ${ip}`;
  }

  const port = String((payload && payload.port) || '').trim();
  if (!isValidPort(port)) return null;
  const portNumber = Number(port);

  if (protocol === 'tcp') {
    // -v verbose, -z zero-I/O scan, -w timeout
    return `nc -vz -w ${NET_TIMEOUT_SEC} ${ip} ${portNumber}`;
  }
  if (protocol === 'udp') {
    // UDP has no handshake: nc only proves the datagram could be sent.
    return `nc -uzv -w ${NET_TIMEOUT_SEC} ${ip} ${portNumber}`;
  }
  const scheme = portNumber === 443 ? 'https' : 'http';
  const insecure = scheme === 'https' ? 'k' : '';
  return `curl -I${insecure}m${CURL_TIMEOUT_SEC} ${scheme}://${ip}:${portNumber}/`;
}

module.exports = {
  PROTOCOLS,
  NET_TIMEOUT_SEC,
  CURL_TIMEOUT_SEC,
  SCAN_PREFIX_MIN,
  SCAN_PREFIX_MAX,
  isValidIpv4,
  isValidPort,
  isValidCidr,
  isValidHostOrCidr,
  buildCommand,
};
