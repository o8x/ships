'use strict';

(function registerSubnetTool() {
  const { el, section, field, resultRow } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      subnet: {
        input: '网段 / 掩码',
        placeholder: '如 192.168.1.10/24 或 192.168.1.0 255.255.255.0',
        defaultMask: '未指定掩码，默认按 /24 计算',
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
        errorIp: 'IP 地址无效',
        errorMask: '掩码无效',
        empty: '输入网段或 IP/掩码，实时计算',
        scopePrivate: '私有地址',
        scopePublic: '公网地址',
        scopeLoopback: '环回地址',
        scopeLinkLocal: '链路本地',
        scopeCgnat: '运营商级 NAT',
        none: '无',
      },
    },
    en: {
      subnet: {
        input: 'Subnet / mask',
        placeholder: 'e.g. 192.168.1.10/24 or 192.168.1.0 255.255.255.0',
        defaultMask: 'No mask given, using /24',
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
        errorIp: 'Invalid IP address',
        errorMask: 'Invalid mask',
        empty: 'Enter a subnet or IP/mask to compute live',
        scopePrivate: 'Private',
        scopePublic: 'Public',
        scopeLoopback: 'Loopback',
        scopeLinkLocal: 'Link-local',
        scopeCgnat: 'CGNAT',
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

  function binaryMask(mask) {
    const binary = (mask >>> 0).toString(2).padStart(32, '0');
    return binary.match(/.{8}/g).join('.');
  }

  function scopeOf(value) {
    const inRange = (base, prefix) => {
      const mask = maskFromPrefix(prefix);
      return (value & mask) >>> 0 === (base & mask) >>> 0;
    };
    if (inRange(ipToInt('127.0.0.0'), 8)) return 'scopeLoopback';
    if (inRange(ipToInt('10.0.0.0'), 8)) return 'scopePrivate';
    if (inRange(ipToInt('172.16.0.0'), 12)) return 'scopePrivate';
    if (inRange(ipToInt('192.168.0.0'), 16)) return 'scopePrivate';
    if (inRange(ipToInt('169.254.0.0'), 16)) return 'scopeLinkLocal';
    if (inRange(ipToInt('100.64.0.0'), 10)) return 'scopeCgnat';
    return 'scopePublic';
  }

  function parseInput(raw) {
    const text = (raw || '').trim();
    if (!text) return { empty: true };

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

    const ip = ipToInt(ipPart);
    if (ip == null) return { error: 'errorIp' };

    let prefix = DEFAULT_PREFIX;
    let defaulted = false;
    if (maskPart == null || maskPart === '') {
      defaulted = true;
    } else if (/^\d{1,2}$/.test(maskPart)) {
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

    if (prefix < 0 || prefix > 32) return { error: 'errorMask' };
    return { ip, prefix, defaulted };
  }

  function mount(container) {
    const inputSection = section(i18n.t('subnet.input'));
    const input = field(null, { placeholder: i18n.t('subnet.placeholder'), spellcheck: 'false' }).input;
    inputSection.appendChild(input);
    const hint = el('div', { class: 'mt-2 text-[11px] text-fg-muted' }, i18n.t('subnet.empty'));
    inputSection.appendChild(hint);

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

    const outSection = section();
    for (const key of Object.keys(rows)) outSection.appendChild(rows[key].root);

    function clearRows() {
      for (const key of Object.keys(rows)) rows[key].set(null);
    }

    function update() {
      const parsed = parseInput(input.value);
      if (parsed.empty) {
        hint.textContent = i18n.t('subnet.empty');
        hint.style.color = '';
        clearRows();
        return;
      }
      if (parsed.error) {
        hint.textContent = i18n.t(`subnet.${parsed.error}`);
        hint.style.color = 'var(--color-danger)';
        clearRows();
        return;
      }

      const { ip, prefix } = parsed;
      const mask = maskFromPrefix(prefix);
      const network = (ip & mask) >>> 0;
      const broadcast = (network | (~mask >>> 0)) >>> 0;

      hint.textContent = parsed.defaulted ? i18n.t('subnet.defaultMask') : '';
      hint.style.color = '';

      rows.network.set(intToIp(network));
      rows.broadcast.set(intToIp(broadcast));

      if (prefix >= 31) {
        rows.range.set(intToIp(network));
      } else {
        rows.range.set(`${intToIp(network + 1)} - ${intToIp(broadcast - 1)}`);
      }

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
    }

    input.addEventListener('input', update);
    input.addEventListener('blur', update);

    container.append(inputSection, outSection);
    update();
  }

  window.ShipsToolRegistry.register({ id: 'subnet', icon: 'layers', mount });
})();
