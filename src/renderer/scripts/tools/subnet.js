'use strict';

(function registerSubnetTool() {
  const { el, section, field, resultRow, createGeoRow, segmented } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      subnet: {
        input: 'IP / 网段 / 掩码',
        placeholder: '如 192.168.1.10/24、192.168.1.0 255.255.255.0 或 3232235777',
        defaultMask: '未指定掩码，默认按 /24 计算',
        baseTitle: 'IP 进制',
        decimal: '十进制',
        hex: '十六进制',
        binary: '二进制',
        network: '网络地址',
        broadcast: '广播地址',
        netmask: '子网掩码',
        wildcard: '反掩码（通配符）',
        range: '可用地址范围',
        hosts: '可用主机数',
        prefix: '网络前缀',
        binaryMask: '掩码二进制',
        scope: '地址类型',
        cidr: 'CIDR',
        kindIpv4: '识别为 IPv4',
        kindIpv6: '识别为 IPv6',
        kindNumber: '识别为数字',
        kindHex: '识别为十六进制数字',
        errorIp: 'IP 地址无效',
        errorMask: '掩码无效',
        empty: '输入 IP / 网段 / 掩码，实时计算',
        scopePrivate: '私有地址',
        scopePublic: '公网地址',
        scopeLoopback: '环回地址',
        scopeLinkLocal: '链路本地',
        scopeCgnat: '运营商级 NAT',
        geo: '归属地',
        none: '无',
        testTitle: '网络测试',
        testIp: 'IP 地址',
        testProtocol: '类型',
        testPort: '端口',
        testRun: '测试',
        testHint: '点击测试会在 iTerm 新窗口执行对应命令（nc / ping / arp / curl 自带，扫描用 nmap）',
        testNeedIp: '需要有效的 IPv4 地址与端口',
        testNoPort: '该协议不使用端口',
        testStarted: '已在 iTerm 中执行：{command}',
        testFailed: '无法打开 iTerm：{error}',
        testScanHost: '扫描主机',
        testScanApp: '扫描应用',
        testNeedCidr: '需要有效的网段（如 172.16.3.0/24）与端口',
        testNeedTarget: '需要有效的 IPv4 地址或网段',
        testScanPrefix: '网段前缀需在 16–30 之间（如 192.168.1.0/24）',
        testScanAppHint: 'nmap 扫描可用端口；填了端口则精确扫该端口的 TCP + UDP',
        testPortOptional: '留空则扫描该目标的常用端口',
        testScanNoSubnet: '需要网段才能扫描：请在上方或 IP 地址里填如 192.168.1.0/24',
        testScanHint: 'nmap 扫描网段（未安装请先 brew install nmap）',
        tipTcp: 'TCP 端口测试：nc -vz -w 3',
        tipUdp: 'UDP 端口测试：nc -uzv -w 3（无握手，只能证明报文可发出）',
        tipHttp: 'HTTP(S)：curl -Ikm8（443 自动用 https）',
        tipIcmp: 'ICMP：ping -c 4',
        tipArp: 'ARP：arp -n（仅同网段有意义）',
        tipScanHost: '扫描主机：nmap -sn 网段（主机发现，需先输入网段）',
        tipScanApp: '扫描应用：nmap 扫可用端口；填端口则 sudo nmap -sS -sU -p 端口（单地址或网段均可）',
      },
    },
    en: {
      subnet: {
        input: 'IP / subnet / mask',
        placeholder: 'e.g. 192.168.1.10/24, 192.168.1.0 255.255.255.0 or 3232235777',
        defaultMask: 'No mask given, using /24',
        baseTitle: 'IP bases',
        decimal: 'Decimal',
        hex: 'Hex',
        binary: 'Binary',
        network: 'Network',
        broadcast: 'Broadcast',
        netmask: 'Netmask',
        wildcard: 'Wildcard',
        range: 'Usable range',
        hosts: 'Usable hosts',
        prefix: 'Prefix',
        binaryMask: 'Netmask binary',
        scope: 'Scope',
        cidr: 'CIDR',
        kindIpv4: 'Detected IPv4',
        kindIpv6: 'Detected IPv6',
        kindNumber: 'Detected number',
        kindHex: 'Detected hex number',
        errorIp: 'Invalid IP address',
        errorMask: 'Invalid mask',
        empty: 'Enter IP / subnet / mask to compute live',
        scopePrivate: 'Private',
        scopePublic: 'Public',
        scopeLoopback: 'Loopback',
        scopeLinkLocal: 'Link-local',
        scopeCgnat: 'CGNAT',
        geo: 'Location',
        none: 'None',
        testTitle: 'Network test',
        testIp: 'IP address',
        testProtocol: 'Type',
        testPort: 'Port',
        testRun: 'Test',
        testHint: 'Runs the matching command in a new iTerm window (nc / ping / arp / curl are built in; scans use nmap)',
        testNeedIp: 'A valid IPv4 address and port are required',
        testNoPort: 'This protocol does not use a port',
        testStarted: 'Running in iTerm: {command}',
        testFailed: 'Cannot open iTerm: {error}',
        testScanHost: 'Scan hosts',
        testScanApp: 'Scan app',
        testNeedCidr: 'A valid subnet (e.g. 192.168.1.0/24) and port are required',
        testNeedTarget: 'A valid IPv4 address or subnet is required',
        testScanPrefix: 'Subnet prefix must be between 16 and 30 (e.g. 192.168.1.0/24)',
        testScanAppHint: 'nmap lists the open ports; with a port it scans that port over TCP + UDP',
        testPortOptional: 'Leave empty to scan the usual ports of the target',
        testScanNoSubnet: 'Scanning needs a subnet: enter one above or in the IP field (e.g. 192.168.1.0/24)',
        testScanHint: 'nmap scans the subnet (install it with brew install nmap)',
        tipTcp: 'TCP test: nc -vz -w 3',
        tipUdp: 'UDP test: nc -uzv -w 3 (no handshake, only proves it can be sent)',
        tipHttp: 'HTTP(S): curl -Ikm8 (https on port 443)',
        tipIcmp: 'ICMP: ping -c 4',
        tipArp: 'ARP: arp -n (same subnet only)',
        tipScanHost: 'Scan hosts: nmap -sn subnet (needs a subnet above)',
        tipScanApp: 'Scan app: nmap finds open ports; with a port it runs sudo nmap -sS -sU -p (single host or subnet)',
      },
    },
  });

  const DEFAULT_PREFIX = 24;

  function ipToInt(text) {
    const parts = String(text).trim().split('.');
    if (parts.length !== 4) return null;
    let value = 0;
    for (const part of parts) {
      if (!/^\d{1,3}$/.test(part)) return null;
      const num = Number(part);
      if (num > 255) return null;
      value = (value * 256 + num) >>> 0;
    }
    return value >>> 0;
  }

  function intToIp(value) {
    const v = value >>> 0;
    return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join('.');
  }

  function maskFromPrefix(prefix) {
    return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  }

  function prefixFromMask(mask) {
    const binary = (mask >>> 0).toString(2).padStart(32, '0');
    if (!/^1*0*$/.test(binary)) return null;
    const firstZero = binary.indexOf('0');
    return firstZero === -1 ? 32 : firstZero;
  }

  function binaryIPv4(value) {
    return [24, 16, 8, 0].map((shift) => ((value >>> shift) & 255).toString(2).padStart(8, '0')).join('.');
  }

  function binaryMask(mask) {
    return (mask >>> 0).toString(2).padStart(32, '0').match(/.{8}/g).join('.');
  }

  function toHex(value) {
    return `0x${(value >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
  }

  function scopeOf(value) {
    const inRange = (base, prefix) => {
      const mask = maskFromPrefix(prefix);
      return ((value & mask) >>> 0) === ((base & mask) >>> 0);
    };
    if (inRange(ipToInt('127.0.0.0'), 8)) return 'scopeLoopback';
    if (inRange(ipToInt('10.0.0.0'), 8)) return 'scopePrivate';
    if (inRange(ipToInt('172.16.0.0'), 12)) return 'scopePrivate';
    if (inRange(ipToInt('192.168.0.0'), 16)) return 'scopePrivate';
    if (inRange(ipToInt('169.254.0.0'), 16)) return 'scopeLinkLocal';
    if (inRange(ipToInt('100.64.0.0'), 10)) return 'scopeCgnat';
    return 'scopePublic';
  }

  function parseIPv6(text) {
    let source = text.trim().toLowerCase();
    if (!source.includes(':')) return null;

    const lastColon = source.lastIndexOf(':');
    const tail = source.slice(lastColon + 1);
    if (tail.includes('.')) {
      const v4 = ipToInt(tail);
      if (v4 == null) return null;
      const high = ((v4 >>> 16) & 0xffff).toString(16);
      const low = (v4 & 0xffff).toString(16);
      source = `${source.slice(0, lastColon + 1)}${high}:${low}`;
    }

    const halves = source.split('::');
    if (halves.length > 2) return null;
    const head = halves[0] ? halves[0].split(':') : [];
    const rest = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : [];
    const all = head.concat(rest);
    if (all.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;

    let groups;
    if (halves.length === 2) {
      const missing = 8 - all.length;
      if (missing < 0) return null;
      groups = head.concat(new Array(missing).fill('0'), rest);
    } else {
      if (all.length !== 8) return null;
      groups = all;
    }

    let value = 0n;
    for (const group of groups) value = (value << 16n) + BigInt(parseInt(group || '0', 16));
    return value;
  }

  function parseInput(raw) {
    const text = (raw || '').trim();
    if (!text) return { empty: true };

    if (text.includes(':')) {
      const value = parseIPv6(text);
      return value == null ? { error: 'errorIp' } : { mode: 'ipv6', value, kind: 'kindIpv6' };
    }

    let ipPart = text;
    let maskPart = null;
    if (text.includes('/')) {
      const halves = text.split('/');
      ipPart = halves[0].trim();
      maskPart = halves[1].trim();
    } else {
      const parts = text.split(/\s+/);
      if (parts.length === 2) {
        ipPart = parts[0];
        maskPart = parts[1];
      }
    }

    let ip;
    let kind = 'kindIpv4';
    if (ipPart.includes('.')) {
      ip = ipToInt(ipPart);
    } else if (/^0x[0-9a-f]+$/i.test(ipPart)) {
      const big = BigInt(ipPart);
      kind = 'kindHex';
      ip = big <= 0xffffffffn ? Number(big) : null;
    } else if (/^\d+$/.test(ipPart)) {
      const big = BigInt(ipPart);
      kind = 'kindNumber';
      ip = big <= 0xffffffffn ? Number(big) : null;
    } else {
      ip = null;
    }
    if (ip == null) return { error: 'errorIp' };

    let prefix = DEFAULT_PREFIX;
    let defaulted = maskPart == null || maskPart === '';
    if (maskPart) {
      if (/^\d{1,2}$/.test(maskPart)) {
        prefix = Number(maskPart);
      } else if (maskPart.includes('.')) {
        const maskInt = ipToInt(maskPart);
        if (maskInt == null) return { error: 'errorMask' };
        const derived = prefixFromMask(maskInt);
        if (derived == null) return { error: 'errorMask' };
        prefix = derived;
      } else {
        return { error: 'errorMask' };
      }
    }
    if (prefix < 0 || prefix > 32) return { error: 'errorMask' };

    return { mode: 'ipv4', ip, prefix, defaulted, kind };
  }

  function mount(container) {
    const inputSection = section();
    const input = field(null, { placeholder: i18n.t('subnet.placeholder'), spellcheck: 'false' }).input;
    inputSection.appendChild(input);
    const hint = el('div', { class: 'text-[11px] text-fg-muted' }, i18n.t('subnet.empty'));
    inputSection.appendChild(hint);

    const baseRows = {
      decimal: resultRow(i18n.t('subnet.decimal')),
      hex: resultRow(i18n.t('subnet.hex')),
      binary: resultRow(i18n.t('subnet.binary')),
    };
    const baseSection = section();
    for (const key of Object.keys(baseRows)) baseSection.appendChild(baseRows[key].root);

    const rows = {
      network: resultRow(i18n.t('subnet.network')),
      broadcast: resultRow(i18n.t('subnet.broadcast')),
      range: resultRow(i18n.t('subnet.range')),
      hosts: resultRow(i18n.t('subnet.hosts')),
      netmask: resultRow(i18n.t('subnet.netmask')),
      wildcard: resultRow(i18n.t('subnet.wildcard')),
      prefix: resultRow(i18n.t('subnet.prefix')),
      binaryMask: resultRow(i18n.t('subnet.binaryMask')),
      scope: resultRow(i18n.t('subnet.scope')),
    };
    const calcSection = section();
    for (const key of Object.keys(rows)) calcSection.appendChild(rows[key].root);

    const geoSection = section();
    const geoRow = createGeoRow();
    geoSection.appendChild(geoRow.root);

    /* ------------------------------ port test ------------------------------ */

    const PROTOCOLS = (window.ShipsConstants && window.ShipsConstants.NET_TEST_PROTOCOLS) || [];
    const DEFAULT_PORT = (window.ShipsConstants && window.ShipsConstants.NET_TEST_DEFAULT_PORT) || 80;
    const SCAN_PREFIX_MIN = (window.ShipsConstants && window.ShipsConstants.NET_TEST_SCAN_PREFIX_MIN) || 16;
    const SCAN_PREFIX_MAX = (window.ShipsConstants && window.ShipsConstants.NET_TEST_SCAN_PREFIX_MAX) || 30;
    // Same rules as the main process (src/main/utils/net-test.js) — this copy only
    // drives the UI state; the command itself is validated and built in main.
    const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
    const CIDR_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}\/(\d{1,2})$/;
    const ipOk = (value) => IPV4_RE.test(String(value || '').trim());
    const cidrShapeOk = (value) => CIDR_RE.test(String(value || '').trim());
    const hostOrCidrOk = (value) => ipOk(value) || cidrOk(value);
    const cidrOk = (value) => {
      const match = CIDR_RE.exec(String(value || '').trim());
      if (!match) return false;
      const prefix = Number(match[4]);
      return prefix >= SCAN_PREFIX_MIN && prefix <= SCAN_PREFIX_MAX;
    };
    const portOk = (value) => {
      const text = String(value || '').trim();
      if (!/^\d{1,5}$/.test(text)) return false;
      const port = Number(text);
      return port >= 1 && port <= 65535;
    };

    const testSection = section(i18n.t('subnet.testTitle'));
    const testIp = field(i18n.t('subnet.testIp'), {
      placeholder: i18n.t('subnet.placeholder'),
      spellcheck: 'false',
    });
    const portInput = el('input', {
      class: 'field w-full font-mono',
      type: 'text',
      inputmode: 'numeric',
      spellcheck: 'false',
      'data-tip': i18n.t('subnet.testNoPort'),
    });
    portInput.value = String(DEFAULT_PORT);
    const portWrap = el('label', { class: 'block w-[74px] shrink-0' });
    portWrap.appendChild(el('span', { class: 'tool-label' }, i18n.t('subnet.testPort')));
    portWrap.appendChild(portInput);
    const runBtn = el('button', { class: 'btn btn-accent flex-1 py-2', type: 'button' }, i18n.t('subnet.testRun'));
    const testRow = el('div', { class: 'flex items-end gap-2' });
    const testHint = el('div', { class: 'truncate text-[11px] text-fg-muted' }, i18n.t('subnet.testHint'));

    const testState = {
      topIp: '',
      subnetCidr: '',
      scanAvailable: false,
      ipEdited: false,
      message: null,
    };

    const protocolLabel = (item) =>
      item.labelKey ? i18n.t(`subnet.${item.labelKey}`) : item.label;

    /* Labels stay short to fit one row; the full wording sits in the tooltip. */
    function protocolOptions() {
      return PROTOCOLS.map((entry) => ({
        value: entry.value,
        label: protocolLabel(entry),
        tip: entry.tipKey ? i18n.t(`subnet.${entry.tipKey}`) : '',
        disabled: Boolean(entry.subnetOnly) && !testState.scanAvailable,
      }));
    }

    const protocolSwitch = segmented(
      protocolOptions(),
      PROTOCOLS.length ? PROTOCOLS[0].value : '',
      () => {
        testState.message = null;
        syncTestTarget();
        refreshTest();
      },
      { className: 'segment-compact flex w-full overflow-x-auto' }
    );
    const typeWrap = el('div', { class: 'flex flex-col gap-1' });
    typeWrap.append(
      el('span', { class: 'tool-label' }, i18n.t('subnet.testProtocol')),
      protocolSwitch.root
    );

    function protocolInfo(value) {
      const wanted = value == null ? protocolSwitch.getValue() : value;
      return PROTOCOLS.find((item) => item.value === wanted) || PROTOCOLS[0] || null;
    }

    /* Where the target field defaults to: the subnet for the ping sweep, the parsed
       host address for everything else (scan-app accepts a single host too). */
    function defaultTarget(item) {
      if (!item) return '';
      if (item.subnetOnly) return testState.scanAvailable ? testState.subnetCidr : '';
      return testState.topIp;
    }

    function syncTestTarget() {
      if (testState.ipEdited) return;
      testIp.input.value = defaultTarget(protocolInfo());
    }

    function refreshTest() {
      const item = protocolInfo() || {};
      const portMode = item.port || 'required';
      const value = testIp.input.value.trim();
      // 扫描 IP 需要网段：上方输入或目标栏里任一带掩码的网段都算（前缀 16–30）。
      testState.scanAvailable = Boolean(testState.subnetCidr) || cidrOk(value);
      portInput.disabled = portMode === 'none';
      portInput.setAttribute(
        'data-tip',
        portMode === 'none'
          ? i18n.t('subnet.testNoPort')
          : portMode === 'optional'
            ? i18n.t('subnet.testPortOptional')
            : ''
      );
      protocolSwitch.setOptions(protocolOptions());

      const needsCidr = Boolean(item.subnetOnly);
      const targetOk = needsCidr ? cidrOk(value) : item.value === 'scan-app' ? hostOrCidrOk(value) : ipOk(value);
      let portOkValue = true;
      if (portMode === 'required') portOkValue = portOk(portInput.value);
      else if (portMode === 'optional') portOkValue = !portInput.value.trim() || portOk(portInput.value);
      const ready = targetOk && portOkValue;
      runBtn.disabled = !ready;

      if (testState.message) {
        testHint.textContent = testState.message.text;
        testHint.style.color = testState.message.error ? 'var(--color-danger)' : '';
        return;
      }
      testHint.style.color = '';
      if (needsCidr && !testState.scanAvailable) {
        testHint.textContent = i18n.t('subnet.testScanNoSubnet');
      } else if (!ready) {
        if (needsCidr) testHint.textContent = i18n.t('subnet.testNeedCidr');
        else if (item.value === 'scan-app' && cidrShapeOk(value)) testHint.textContent = i18n.t('subnet.testScanPrefix');
        else if (item.value === 'scan-app') testHint.textContent = i18n.t('subnet.testNeedTarget');
        else testHint.textContent = i18n.t('subnet.testNeedIp');
      } else if (needsCidr) {
        testHint.textContent = i18n.t('subnet.testScanHint');
      } else if (item.value === 'scan-app') {
        testHint.textContent = i18n.t('subnet.testScanAppHint');
      } else {
        testHint.textContent = i18n.t('subnet.testHint');
      }
    }

    /* Feed the address / subnet parsed from the field above. */
    function syncTestSource(ip, cidr, scanAvailable) {
      testState.topIp = ip;
      testState.subnetCidr = cidr;
      testState.scanAvailable = scanAvailable;
      // A new source address makes the previous run's message stale.
      testState.message = null;
      syncTestTarget();
      refreshTest();
    }

    function onTestInput() {
      testState.message = null;
      refreshTest();
    }

    async function runTest() {
      const item = protocolInfo() || {};
      const payload = {
        protocol: item.value,
        ip: testIp.input.value.trim(),
        port: item.port === 'none' ? '' : portInput.value.trim(),
      };
      runBtn.disabled = true;
      let result = null;
      try {
        result = await window.ships.netTest(payload);
      } catch (err) {
        result = { ok: false, error: err.message };
      }
      testState.message = result && result.ok
        ? { text: i18n.t('subnet.testStarted', { command: result.command }), error: false }
        : { text: i18n.t('subnet.testFailed', { error: (result && result.error) || 'error' }), error: true };
      refreshTest();
    }

    testIp.input.addEventListener('input', () => {
      const item = protocolInfo();
      const value = testIp.input.value.trim();
      testState.ipEdited = Boolean(value) && value !== defaultTarget(item);
      onTestInput();
    });
    testIp.input.addEventListener('blur', () => {
      if (testIp.input.value.trim()) return;
      testState.ipEdited = false;
      syncTestTarget();
      onTestInput();
    });
    portInput.addEventListener('input', () => {
      portInput.value = portInput.value.replace(/[^\d]/g, '');
      onTestInput();
    });
    runBtn.addEventListener('click', runTest);

    testRow.append(portWrap, runBtn);
    testSection.append(testIp.wrapper, typeWrap, testRow, testHint);

    let geoToken = 0;
    function lookupGeo(ip) {
      const token = ++geoToken;
      if (!ip || !window.ships.geoLookup) {
        geoRow.set(null);
        return;
      }
      window.ships.geoLookup(ip).then((info) => {
        if (token !== geoToken) return;
        geoRow.set(info);
      });
    }

    function clearAll() {
      for (const key of Object.keys(baseRows)) baseRows[key].set(null);
      for (const key of Object.keys(rows)) rows[key].set(null);
      geoToken += 1;
      geoRow.set(null);
    }

    function setBase(value, hex, binary) {
      baseRows.decimal.set(value);
      baseRows.hex.set(hex);
      baseRows.binary.set(binary);
    }

    function update() {
      const parsed = parseInput(input.value);
      if (parsed.empty) {
        hint.textContent = i18n.t('subnet.empty');
        hint.style.color = '';
        calcSection.classList.remove('hidden');
        geoSection.classList.remove('hidden');
        clearAll();
        syncTestSource('', '', false);
        return;
      }
      if (parsed.error) {
        hint.textContent = i18n.t(`subnet.${parsed.error}`);
        hint.style.color = 'var(--color-danger)';
        calcSection.classList.remove('hidden');
        geoSection.classList.remove('hidden');
        clearAll();
        syncTestSource('', '', false);
        return;
      }

      hint.style.color = '';

      if (parsed.mode === 'ipv6') {
        hint.textContent = i18n.t('subnet.kindIpv6');
        setBase(parsed.value.toString(), `0x${parsed.value.toString(16).toUpperCase()}`, parsed.value.toString(2).padStart(128, '0'));
        for (const key of Object.keys(rows)) rows[key].set(null);
        calcSection.classList.add('hidden');
        geoSection.classList.add('hidden');
        syncTestSource('', '', false);
        return;
      }

      calcSection.classList.remove('hidden');
      geoSection.classList.remove('hidden');
      hint.textContent = parsed.defaulted ? i18n.t('subnet.defaultMask') : i18n.t(`subnet.${parsed.kind}`);

      const { ip, prefix } = parsed;
      const mask = maskFromPrefix(prefix);
      const network = (ip & mask) >>> 0;
      const broadcast = (network | (~mask >>> 0)) >>> 0;

      setBase(String(ip), toHex(ip), binaryIPv4(ip));

      rows.network.set(intToIp(network));
      rows.broadcast.set(intToIp(broadcast));
      if (prefix >= 31) rows.range.set(intToIp(network));
      else rows.range.set(`${intToIp(network + 1)} - ${intToIp(broadcast - 1)}`);

      let hosts;
      if (prefix <= 30) hosts = Math.pow(2, 32 - prefix) - 2;
      else if (prefix === 31) hosts = 2;
      else hosts = 1;
      rows.hosts.set(hosts.toLocaleString());

      rows.netmask.set(intToIp(mask));
      rows.wildcard.set(intToIp(~mask >>> 0));
      rows.prefix.set(`/${prefix}  ·  ${intToIp(network)}/${prefix}`);
      rows.binaryMask.set(binaryMask(mask));
      rows.scope.set(i18n.t(`subnet.${scopeOf(ip)}`));

      lookupGeo(intToIp(ip));
      // Scans are only offered when the input carries an explicit, sane mask.
      const scanOk = !parsed.defaulted && prefix >= SCAN_PREFIX_MIN && prefix <= SCAN_PREFIX_MAX;
      syncTestSource(intToIp(ip), scanOk ? `${intToIp(network)}/${prefix}` : '', scanOk);
    }

    input.addEventListener('input', update);
    input.addEventListener('blur', update);

    container.append(inputSection, geoSection, baseSection, calcSection, testSection);
    update();
  }

  window.ShipsToolRegistry.register({ id: 'subnet', icon: 'layers', mount });
})();
