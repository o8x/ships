'use strict';

(function registerIpNumberTool() {
  const { el, section, field, resultRow, createGeoRow, persistState } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      ipNumber: {
        input: 'IP 地址 / 数字',
        placeholder: '如 192.168.1.1 或 3232235777',
        decimal: '十进制',
        hex: '十六进制',
        binary: '二进制',
        geo: '归属地',
        kindIpv4: '识别为 IPv4',
        kindIpv6: '识别为 IPv6',
        kindNumber: '识别为数字',
        kindHex: '识别为十六进制数字',
        invalid: '无法识别',
        outOfRange: '超出 IPv4 范围（最大 4294967295）',
        empty: '输入 IP 地址或数字，实时转换',
      },
    },
    en: {
      ipNumber: {
        input: 'IP address / number',
        placeholder: 'e.g. 192.168.1.1 or 3232235777',
        decimal: 'Decimal',
        hex: 'Hex',
        binary: 'Binary',
        geo: 'Location',
        kindIpv4: 'Detected IPv4',
        kindIpv6: 'Detected IPv6',
        kindNumber: 'Detected number',
        kindHex: 'Detected hex number',
        invalid: 'Unrecognized',
        outOfRange: 'Out of IPv4 range (max 4294967295)',
        empty: 'Type an IP address or number to convert live',
      },
    },
  });

  const MAX_IPV4 = 0xffffffffn;

  function parseIPv4(text) {
    const parts = text.split('.');
    if (parts.length !== 4) return null;
    let value = 0n;
    for (const part of parts) {
      if (!/^\d{1,3}$/.test(part)) return null;
      const num = Number(part);
      if (num > 255) return null;
      value = (value << 8n) + BigInt(num);
    }
    return value;
  }

  function parseIPv6(text) {
    let source = text.trim().toLowerCase();
    if (!source.includes(':')) return null;

    const lastColon = source.lastIndexOf(':');
    const tail = source.slice(lastColon + 1);
    if (tail.includes('.')) {
      const v4 = parseIPv4(tail);
      if (v4 == null) return null;
      const high = ((v4 >> 16n) & 0xffffn).toString(16);
      const low = (v4 & 0xffffn).toString(16);
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

  function ipv4ToString(value) {
    return [24n, 16n, 8n, 0n].map((shift) => ((value >> shift) & 0xffn).toString()).join('.');
  }

  function ipv6ToString(value) {
    const groups = [];
    for (let i = 7; i >= 0; i--) groups.push(Number((value >> BigInt(i * 16)) & 0xffffn).toString(16));
    let bestStart = -1;
    let bestLen = 0;
    let currentStart = -1;
    let currentLen = 0;
    for (let i = 0; i < 8; i++) {
      if (groups[i] === '0') {
        if (currentStart === -1) currentStart = i;
        currentLen++;
        if (currentLen > bestLen) {
          bestLen = currentLen;
          bestStart = currentStart;
        }
      } else {
        currentStart = -1;
        currentLen = 0;
      }
    }
    if (bestLen < 2) return groups.join(':');
    const before = groups.slice(0, bestStart).join(':');
    const after = groups.slice(bestStart + bestLen).join(':');
    return `${before}::${after}`;
  }

  function binaryIPv4(value) {
    return [24n, 16n, 8n, 0n]
      .map((shift) => Number((value >> shift) & 0xffn).toString(2).padStart(8, '0'))
      .join('.');
  }

  function detect(text) {
    if (text.includes(':')) return parseIPv6(text) != null ? 'ipv6' : null;
    if (text.includes('.')) return parseIPv4(text) != null ? 'ipv4' : null;
    if (/^0x[0-9a-f]+$/i.test(text)) return 'hex';
    if (/^\d+$/.test(text)) return 'number';
    return null;
  }

  function mount(container) {
    const inputSection = section(i18n.t('ipNumber.input'));
    const input = field(null, {
      placeholder: i18n.t('ipNumber.placeholder'),
      spellcheck: 'false',
    }).input;
    inputSection.appendChild(input);
    const store = persistState('ipNumber');

    const hint = el('div', { class: 'mt-2 text-[11px] text-fg-muted' }, i18n.t('ipNumber.empty'));
    inputSection.appendChild(hint);

    const rows = {
      decimal: resultRow(i18n.t('ipNumber.decimal')),
      hex: resultRow(i18n.t('ipNumber.hex')),
      binary: resultRow(i18n.t('ipNumber.binary')),
    };

    const outSection = section();
    for (const key of Object.keys(rows)) outSection.appendChild(rows[key].root);

    const geoSection = section(i18n.t('ipNumber.geo'));
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

    function clearRows() {
      for (const key of Object.keys(rows)) rows[key].set(null);
      geoToken += 1;
      geoRow.set(null);
    }

    function toHex(value) {
      return `0x${value.toString(16).toUpperCase()}`;
    }

    function update() {
      const raw = input.value.trim();
      if (!raw) {
        hint.textContent = i18n.t('ipNumber.empty');
        hint.style.color = '';
        clearRows();
        return;
      }

      const kind = detect(raw);
      if (!kind) {
        hint.textContent = i18n.t('ipNumber.invalid');
        hint.style.color = 'var(--color-danger)';
        clearRows();
        return;
      }

      hint.style.color = '';

      if (kind === 'ipv4') {
        const value = parseIPv4(raw);
        hint.textContent = i18n.t('ipNumber.kindIpv4');
        rows.decimal.set(value.toString());
        rows.hex.set(toHex(value));
        rows.binary.set(binaryIPv4(value));
        lookupGeo(ipv4ToString(value));
        return;
      }

      if (kind === 'ipv6') {
        const value = parseIPv6(raw);
        hint.textContent = i18n.t('ipNumber.kindIpv6');
        rows.decimal.set(value.toString());
        rows.hex.set(toHex(value));
        rows.binary.set(value.toString(2).padStart(128, '0'));
        geoToken += 1;
        geoRow.set(null);
        return;
      }

      const value = kind === 'hex' ? BigInt(raw) : BigInt(raw);
      if (value > MAX_IPV4) {
        hint.textContent = i18n.t('ipNumber.outOfRange');
        hint.style.color = 'var(--color-danger)';
        geoToken += 1;
        geoRow.set(null);
      } else {
        const ipStr = ipv4ToString(value);
        hint.textContent = `${i18n.t(kind === 'hex' ? 'ipNumber.kindHex' : 'ipNumber.kindNumber')} · ${ipStr}`;
        lookupGeo(ipStr);
      }
      rows.decimal.set(value.toString());
      rows.hex.set(toHex(value));
      rows.binary.set(value.toString(2).padStart(32, '0'));
    }

    input.addEventListener('input', () => {
      update();
      store.save({ value: input.value });
    });
    input.addEventListener('blur', update);

    container.append(inputSection, outSection, geoSection);
    update();

    store.load((saved) => {
      if (saved && saved.value != null) {
        input.value = saved.value;
        update();
      }
    });
  }

  window.ShipsToolRegistry.register({ id: 'ipNumber', icon: 'globe', mount });
})();
