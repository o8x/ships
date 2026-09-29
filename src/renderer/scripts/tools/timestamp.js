'use strict';

(function registerTimestampTool() {
  const { el, section, field, resultRow, persistState } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      timestamp: {
        now: '当前时间',
        toDate: '时间戳 → 日期',
        toTs: '日期 → 时间戳',
        timestamp: '时间戳',
        dateTime: '日期时间',
        unitS: '秒',
        unitMs: '毫秒',
        unitNs: '纳秒',
        local: '本地时间',
        utc: 'UTC 时间',
        iso: 'ISO 8601',
        relative: '相对时间',
        seconds: '秒',
        milliseconds: '毫秒',
        nanoseconds: '纳秒',
        detected: '识别单位：{unit}',
        offset: '时间偏移',
        offsetPlaceholder: '如 -30m / +2h',
        offsetTip: '偏移表达式：-30m / +2h / 90（纯数字按秒），单位 s/m/h/d/w/mo',
        diffTitle: '时间戳差值',
        diffA: '时间戳 A',
        diffB: '时间戳 B',
        diffSeconds: '时间差（秒）',
        diffHuman: '时间差（格式化）',
        durDay: '天',
        durHour: '小时',
        durMinute: '分钟',
        durSecond: '秒',
        durMs: '毫秒',
        durZero: '0 秒',
        placeholderTs: '输入时间戳，如 1700000000',
        placeholderDate: '输入日期，如 2024-01-01 12:00:00',
      },
    },
    en: {
      timestamp: {
        now: 'Current time',
        toDate: 'Timestamp → Date',
        toTs: 'Date → Timestamp',
        timestamp: 'Timestamp',
        dateTime: 'Date & time',
        unitS: 'Seconds',
        unitMs: 'Milliseconds',
        unitNs: 'Nanoseconds',
        local: 'Local time',
        utc: 'UTC time',
        iso: 'ISO 8601',
        relative: 'Relative',
        seconds: 'Seconds',
        milliseconds: 'Milliseconds',
        nanoseconds: 'Nanoseconds',
        detected: 'Detected unit: {unit}',
        offset: 'Offset',
        offsetPlaceholder: 'e.g. -30m / +2h',
        offsetTip: 'Offset expression: -30m / +2h / 90 (bare number = seconds); units s/m/h/d/w/mo',
        diffTitle: 'Timestamp difference',
        diffA: 'Timestamp A',
        diffB: 'Timestamp B',
        diffSeconds: 'Difference (seconds)',
        diffHuman: 'Difference (format)',
        durDay: 'day',
        durHour: 'hour',
        durMinute: 'minute',
        durSecond: 'second',
        durMs: 'ms',
        durZero: '0 seconds',
        placeholderTs: 'e.g. 1700000000',
        placeholderDate: 'e.g. 2024-01-01 12:00:00',
      },
    },
  });

  const NS_PER_MS = 1000000n;
  const NS_PER_S = 1000000000n;
  const NS_PER_MS_NUMBER = 1e6;
  const NS_PER_MIN = 60n * NS_PER_S;
  const NS_PER_HOUR = 60n * NS_PER_MIN;
  const NS_PER_DAY = 24n * NS_PER_HOUR;

  const MS_PER_SECOND = 1000;
  const MS_PER_MINUTE = 60 * MS_PER_SECOND;
  const MS_PER_HOUR = 60 * MS_PER_MINUTE;
  const MS_PER_DAY = 24 * MS_PER_HOUR;

  // "mo"/"M" both mean a month, approximated as 30 days (same as relativeTime).
  const OFFSET_FACTORS = {
    s: MS_PER_SECOND,
    m: MS_PER_MINUTE,
    h: MS_PER_HOUR,
    d: MS_PER_DAY,
    w: 7 * MS_PER_DAY,
    mo: 30 * MS_PER_DAY,
    M: 30 * MS_PER_DAY,
  };

  // Human-readable duration decomposition, largest unit first.
  const DURATION_UNITS = [
    ['durDay', NS_PER_DAY, true],
    ['durHour', NS_PER_HOUR, true],
    ['durMinute', NS_PER_MIN, true],
    ['durSecond', NS_PER_S, true],
    ['durMs', NS_PER_MS, false],
  ];

  function pad(value, width) {
    return String(value).padStart(width || 2, '0');
  }

  function formatLocal(date) {
    return (
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
      `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
    );
  }

  function formatUTC(date) {
    return (
      `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
      `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}`
    );
  }

  function timezoneLabel(date) {
    const offsetMin = -date.getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    const abs = Math.abs(offsetMin);
    return `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  }

  function intlLocale() {
    return i18n.getLocale() === 'zh' ? 'zh-CN' : 'en-US';
  }

  function relativeTime(date) {
    const diff = date.getTime() - Date.now();
    const abs = Math.abs(diff);
    const units = [
      ['year', 31536000000],
      ['month', 2592000000],
      ['day', 86400000],
      ['hour', 3600000],
      ['minute', 60000],
      ['second', 1000],
    ];
    const rtf = new Intl.RelativeTimeFormat(intlLocale(), { numeric: 'auto' });
    for (const [unit, ms] of units) {
      if (abs >= ms || unit === 'second') {
        return rtf.format(Math.round(diff / ms), unit);
      }
    }
    return '';
  }

  function detectUnit(digits) {
    if (digits <= 11) return 's';
    if (digits <= 15) return 'ms';
    return 'ns';
  }

  function parseTimestamp(raw) {
    const text = (raw || '').trim();
    if (!text || !/^\d+$/.test(text)) return null;
    const value = BigInt(text);
    const effective = detectUnit(text.replace(/^0+/, '').length || 1);
    let ns;
    if (effective === 's') ns = value * NS_PER_S;
    else if (effective === 'ms') ns = value * NS_PER_MS;
    else ns = value;
    const ms = Number(ns / NS_PER_MS);
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return null;
    return { date, effective, ns };
  }

  function parseDate(raw) {
    const text = (raw || '').trim();
    if (!text) return null;
    let date = new Date(text.replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) date = new Date(text);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  // Offset text like "-30m", "+2h", "90" (bare number = seconds), "1.5h".
  function parseOffset(raw) {
    const text = (raw || '').trim();
    if (!text) return { ms: 0, valid: true };
    const match = text.match(/^([+-]?)\s*(\d+(?:\.\d+)?)\s*([a-zA-Z]*)$/);
    if (!match) return { ms: 0, valid: false };
    let unit = match[3] || 's';
    if (unit !== 'M') unit = unit.toLowerCase();
    const factor = OFFSET_FACTORS[unit];
    if (!factor) return { ms: 0, valid: false };
    const sign = match[1] === '-' ? -1 : 1;
    return { ms: sign * parseFloat(match[2]) * factor, valid: true };
  }

  function unitLabel(unit) {
    if (unit === 's') return i18n.t('timestamp.unitS');
    if (unit === 'ms') return i18n.t('timestamp.unitMs');
    if (unit === 'ns') return i18n.t('timestamp.unitNs');
    return '—';
  }

  /* Free-text offset input; the expression syntax is unchanged (see parseOffset). */
  function offsetField(onChange) {
    const offset = field(i18n.t('timestamp.offset'), {
      class: 'field w-[112px] shrink-0',
      placeholder: i18n.t('timestamp.offsetPlaceholder'),
      autocomplete: 'off',
    });
    offset.wrapper.classList.add('shrink-0');
    offset.wrapper.style.marginBottom = '0';
    offset.input.dataset.tip = i18n.t('timestamp.offsetTip');
    offset.input.addEventListener('input', onChange);
    offset.input.addEventListener('blur', onChange);
    return offset;
  }

  /* Signed seconds with up to 9 decimals, trailing zeros trimmed. */
  function formatSeconds(ns) {
    const negative = ns < 0n;
    const abs = negative ? -ns : ns;
    const whole = abs / NS_PER_S;
    const fraction = abs % NS_PER_S;
    if (fraction === 0n) return `${negative ? '-' : ''}${whole}`;
    const digits = fraction.toString().padStart(9, '0').replace(/0+$/, '');
    return `${negative ? '-' : ''}${whole}.${digits}`;
  }

  function durationUnitLabel(key, value, plural) {
    const label = i18n.t(`timestamp.${key}`);
    return plural && i18n.getLocale() === 'en' && value !== 1n ? `${label}s` : label;
  }

  /* Human-readable duration, e.g. "1 天 2 小时 3 分钟"; keeps the sign of ns. */
  function formatDuration(ns) {
    const negative = ns < 0n;
    let rest = negative ? -ns : ns;
    const parts = [];
    for (const [key, size, plural] of DURATION_UNITS) {
      const value = rest / size;
      if (value > 0n) {
        parts.push(`${value} ${durationUnitLabel(key, value, plural)}`);
        rest -= value * size;
      }
    }
    const text = parts.length ? parts.join(' ') : i18n.t('timestamp.durZero');
    return negative ? `-${text}` : text;
  }

  function mount(container) {
    const nowSection = section(i18n.t('timestamp.now'));
    const bigTime = el('div', { class: 'font-mono text-[22px] font-semibold text-fg' }, '--:--:--');
    const tzLine = el('div', { class: 'text-[11px] text-fg-muted' }, '');

    const nowRows = {
      s: resultRow(i18n.t('timestamp.seconds')),
      ms: resultRow(i18n.t('timestamp.milliseconds')),
      ns: resultRow(i18n.t('timestamp.nanoseconds')),
    };
    nowSection.append(bigTime, tzLine, nowRows.s.root, nowRows.ms.root, nowRows.ns.root);

    const toDateSection = section(i18n.t('timestamp.toDate'));
    const tsField = field(i18n.t('timestamp.timestamp'), {
      placeholder: i18n.t('timestamp.placeholderTs'),
      inputmode: 'numeric',
    });
    const tsRow = el('div', { class: 'flex items-end gap-2' });
    tsField.wrapper.classList.add('min-w-0', 'flex-1');
    tsField.wrapper.style.marginBottom = '0';
    const tsOffset = offsetField(() => {
      updateFromTimestamp();
      saveState();
    });
    tsRow.append(tsField.wrapper, tsOffset.wrapper);
    const detected = el('div', { class: 'text-[11px] text-fg-muted' }, '');
    toDateSection.append(tsRow, detected);

    const dateRows = {
      local: resultRow(`${i18n.t('timestamp.local')} (${timezoneLabel(new Date())})`),
      utc: resultRow(i18n.t('timestamp.utc')),
      iso: resultRow(i18n.t('timestamp.iso')),
      relative: resultRow(i18n.t('timestamp.relative')),
    };
    for (const key of Object.keys(dateRows)) toDateSection.appendChild(dateRows[key].root);

    const toTsSection = section(i18n.t('timestamp.toTs'));
    const dateField = field(i18n.t('timestamp.dateTime'), {
      placeholder: i18n.t('timestamp.placeholderDate'),
    });
    const dateRow = el('div', { class: 'flex items-end gap-2' });
    dateField.wrapper.classList.add('min-w-0', 'flex-1');
    dateField.wrapper.style.marginBottom = '0';
    const dateOffset = offsetField(() => {
      updateFromDate();
      saveState();
    });
    dateRow.append(dateField.wrapper, dateOffset.wrapper);
    toTsSection.appendChild(dateRow);
    const tsRows = {
      s: resultRow(i18n.t('timestamp.seconds')),
      ms: resultRow(i18n.t('timestamp.milliseconds')),
      ns: resultRow(i18n.t('timestamp.nanoseconds')),
    };
    toTsSection.append(tsRows.s.root, tsRows.ms.root, tsRows.ns.root);

    const diffSection = section(i18n.t('timestamp.diffTitle'));
    const diffA = field(i18n.t('timestamp.diffA'), {
      placeholder: i18n.t('timestamp.placeholderTs'),
      inputmode: 'numeric',
    });
    const diffB = field(i18n.t('timestamp.diffB'), {
      placeholder: i18n.t('timestamp.placeholderTs'),
      inputmode: 'numeric',
    });
    const diffRow = el('div', { class: 'flex items-end gap-2' });
    for (const entry of [diffA, diffB]) {
      entry.wrapper.classList.add('min-w-0', 'flex-1');
      entry.wrapper.style.marginBottom = '0';
    }
    diffRow.append(diffA.wrapper, diffB.wrapper);
    const diffRows = {
      seconds: resultRow(i18n.t('timestamp.diffSeconds')),
      human: resultRow(i18n.t('timestamp.diffHuman')),
    };
    diffSection.append(diffRow, diffRows.seconds.root, diffRows.human.root);

    // High-resolution current time: performance.timeOrigin + performance.now()
    // gives sub-millisecond precision so ns isn't always ...000000.
    function currentParts() {
      const totalMs = performance.timeOrigin + performance.now();
      let seconds = Math.floor(totalMs / 1000);
      let fractionNs = Math.round((totalMs - seconds * 1000) * NS_PER_MS_NUMBER);
      if (fractionNs >= 1000000000) {
        fractionNs -= 1000000000;
        seconds += 1;
      }
      return {
        totalMs,
        seconds,
        date: new Date(Math.floor(totalMs)),
        ns: BigInt(seconds) * 1000000000n + BigInt(fractionNs),
      };
    }

    function updateNow() {
      const { totalMs, seconds, date, ns } = currentParts();
      bigTime.textContent = formatLocal(date).slice(11, 23);
      tzLine.textContent = `${formatLocal(date).slice(0, 10)} · ${timezoneLabel(date)}`;
      nowRows.s.set(seconds);
      nowRows.ms.set(Math.floor(totalMs));
      nowRows.ns.set(ns.toString());
    }

    function updateFromTimestamp() {
      const offset = parseOffset(tsOffset.input.value);
      tsOffset.input.classList.toggle('invalid', !offset.valid);
      const parsed = parseTimestamp(tsField.input.value);
      if (!parsed) {
        detected.textContent = tsField.input.value.trim() ? i18n.t('timestamp.detected', { unit: '—' }) : '';
        for (const key of Object.keys(dateRows)) dateRows[key].set(null);
        return;
      }
      detected.textContent = i18n.t('timestamp.detected', { unit: unitLabel(parsed.effective) });
      const date = new Date(parsed.date.getTime() + (offset.valid ? offset.ms : 0));
      dateRows.local.set(formatLocal(date));
      dateRows.utc.set(formatUTC(date));
      dateRows.iso.set(date.toISOString());
      dateRows.relative.set(relativeTime(date));
    }

    function updateFromDate() {
      const offset = parseOffset(dateOffset.input.value);
      dateOffset.input.classList.toggle('invalid', !offset.valid);
      const date = parseDate(dateField.input.value);
      if (!date) {
        for (const key of Object.keys(tsRows)) tsRows[key].set(null);
        return;
      }
      const ms = date.getTime() + (offset.valid ? offset.ms : 0);
      tsRows.s.set(Math.floor(ms / 1000));
      tsRows.ms.set(ms);
      tsRows.ns.set((BigInt(Math.round(ms)) * NS_PER_MS).toString());
    }

    /* B − A, both sides auto-detected (s / ms / ns), so mixed units compare correctly. */
    function updateDiff() {
      const a = parseTimestamp(diffA.input.value);
      const b = parseTimestamp(diffB.input.value);
      if (!a || !b) {
        diffRows.seconds.set(null);
        diffRows.human.set(null);
        return;
      }
      const ns = b.ns - a.ns;
      diffRows.seconds.set(formatSeconds(ns));
      diffRows.human.set(formatDuration(ns));
    }

    const store = persistState('timestamp');
    function saveState() {
      store.save({
        ts: tsField.input.value,
        date: dateField.input.value,
        tsOffset: tsOffset.input.value,
        dateOffset: dateOffset.input.value,
        diffA: diffA.input.value,
        diffB: diffB.input.value,
      });
    }

    tsField.input.addEventListener('input', () => {
      updateFromTimestamp();
      saveState();
    });
    tsField.input.addEventListener('blur', updateFromTimestamp);
    dateField.input.addEventListener('input', () => {
      updateFromDate();
      saveState();
    });
    dateField.input.addEventListener('blur', updateFromDate);
    diffA.input.addEventListener('input', () => {
      updateDiff();
      saveState();
    });
    diffA.input.addEventListener('blur', updateDiff);
    diffB.input.addEventListener('input', () => {
      updateDiff();
      saveState();
    });
    diffB.input.addEventListener('blur', updateDiff);

    container.append(nowSection, toDateSection, toTsSection, diffSection);

    updateNow();
    updateFromTimestamp();
    updateFromDate();
    updateDiff();

    store.load((saved) => {
      if (saved.ts != null) tsField.input.value = saved.ts;
      if (saved.date != null) dateField.input.value = saved.date;
      if (saved.tsOffset != null) tsOffset.input.value = saved.tsOffset;
      if (saved.dateOffset != null) dateOffset.input.value = saved.dateOffset;
      if (saved.diffA != null) diffA.input.value = saved.diffA;
      if (saved.diffB != null) diffB.input.value = saved.diffB;
      updateFromTimestamp();
      updateFromDate();
      updateDiff();
    });

    const timer = setInterval(updateNow, 50);
    return () => clearInterval(timer);
  }

  window.ShipsToolRegistry.register({
    id: 'timestamp',
    icon: 'clock',
    mount,
  });
})();
