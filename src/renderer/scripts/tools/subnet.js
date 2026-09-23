'use strict';

(function registerSubnetTool() {
  const { el, section, field, resultRow, createGeoRow, persistState } = window.ShipsUI;
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
    const inputSection = section(i18n.t('subnet.input'));
    const input = field(null, { placeholder: i18n.t('subnet.placeholder'), spellcheck: 'false' }).input;
    inputSection.appendChild(input);
    const store = persistState('subnet');
    const hint = el('div', { class: 'mt-2 text-[11px] text-fg-muted' }, i18n.t('subnet.empty'));
    inputSection.appendChild(hint);

    const baseRows = {
      decimal: resultRow(i18n.t('subnet.decimal')),
      hex: resultRow(i18n.t('subnet.hex')),
      binary: resultRow(i18n.t('subnet.binary')),
    };
    const baseSection = section(i18n.t('subnet.baseTitle'));
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

    const geoSection = section(i18n.t('subnet.geo'));
    const geoRow = createGeoRow();
    geoSection.appendChild(geoRow.root);

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
        return;
      }
      if (parsed.error) {
        hint.textContent = i18n.t(`subnet.${parsed.error}`);
        hint.style.color = 'var(--color-danger)';
        calcSection.classList.remove('hidden');
        geoSection.classList.remove('hidden');
        clearAll();
        return;
      }

      hint.style.color = '';

      if (parsed.mode === 'ipv6') {
        hint.textContent = i18n.t('subnet.kindIpv6');
        setBase(parsed.value.toString(), `0x${parsed.value.toString(16).toUpperCase()}`, parsed.value.toString(2).padStart(128, '0'));
        for (const key of Object.keys(rows)) rows[key].set(null);
        calcSection.classList.add('hidden');
        geoSection.classList.add('hidden');
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
    }

    input.addEventListener('input', () => {
      update();
      store.save({ value: input.value });
    });
    input.addEventListener('blur', update);

    container.append(inputSection, geoSection, baseSection, calcSection);
    update();

    store.load((saved) => {
      if (saved && saved.value != null) {
        input.value = saved.value;
        update();
      }
    });
  }

  window.ShipsToolRegistry.register({ id: 'subnet', icon: 'layers', mount });
})();
