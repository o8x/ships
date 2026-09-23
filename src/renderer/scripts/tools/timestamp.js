'use strict';

(function registerTimestampTool() {
  const { el, section, field, resultRow, createSelect, persistState } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      timestamp: {
        now: '当前时间',
        toDate: '时间戳 → 日期',
        toTs: '日期 → 时间戳',
        timestamp: '时间戳',
        dateTime: '日期时间',
        unit: '单位',
        unitAuto: '自动识别',
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
        unit: 'Unit',
        unitAuto: 'Auto',
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
        placeholderTs: 'e.g. 1700000000',
        placeholderDate: 'e.g. 2024-01-01 12:00:00',
      },
    },
  });

  const NS_PER_MS = 1000000n;
  const NS_PER_S = 1000000000n;
  const NS_PER_MS_NUMBER = 1e6;

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

  function parseTimestamp(raw, unit) {
    const text = (raw || '').trim();
    if (!text || !/^\d+$/.test(text)) return null;
    const value = BigInt(text);
    const effective = unit === 'auto' ? detectUnit(text.replace(/^0+/, '').length || 1) : unit;
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

  function unitLabel(unit) {
    if (unit === 's') return i18n.t('timestamp.unitS');
    if (unit === 'ms') return i18n.t('timestamp.unitMs');
    if (unit === 'ns') return i18n.t('timestamp.unitNs');
    return i18n.t('timestamp.unitAuto');
  }

  function mount(container) {
    const nowSection = section(i18n.t('timestamp.now'));
    const bigTime = el('div', { class: 'mb-1 font-mono text-[22px] font-semibold text-fg' }, '--:--:--');
    const tzLine = el('div', { class: 'mb-2 text-[11px] text-fg-muted' }, '');

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
    const unitSelect = createSelect({
      options: ['auto', 's', 'ms', 'ns'].map((unit) => ({ value: unit, label: unitLabel(unit) })),
      value: 'auto',
      align: 'right',
      className: 'w-[116px] shrink-0',
      onChange: () => {
        updateFromTimestamp();
        saveState();
      },
    });
    tsRow.append(tsField.wrapper, unitSelect.el);
    const detected = el('div', { class: 'mt-1 text-[11px] text-fg-muted' }, '');
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
    toTsSection.appendChild(dateField.wrapper);
    const tsRows = {
      s: resultRow(i18n.t('timestamp.seconds')),
      ms: resultRow(i18n.t('timestamp.milliseconds')),
      ns: resultRow(i18n.t('timestamp.nanoseconds')),
    };
    toTsSection.append(tsRows.s.root, tsRows.ms.root, tsRows.ns.root);

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
      const parsed = parseTimestamp(tsField.input.value, unitSelect.getValue());
      if (!parsed) {
        detected.textContent = tsField.input.value.trim() ? i18n.t('timestamp.detected', { unit: '—' }) : '';
        for (const key of Object.keys(dateRows)) dateRows[key].set(null);
        return;
      }
      detected.textContent = i18n.t('timestamp.detected', { unit: unitLabel(parsed.effective) });
      dateRows.local.set(formatLocal(parsed.date));
      dateRows.utc.set(formatUTC(parsed.date));
      dateRows.iso.set(parsed.date.toISOString());
      dateRows.relative.set(relativeTime(parsed.date));
    }

    function updateFromDate() {
      const date = parseDate(dateField.input.value);
      if (!date) {
        for (const key of Object.keys(tsRows)) tsRows[key].set(null);
        return;
      }
      tsRows.s.set(Math.floor(date.getTime() / 1000));
      tsRows.ms.set(date.getTime());
      tsRows.ns.set((BigInt(date.getTime()) * NS_PER_MS).toString());
    }

    const store = persistState('timestamp');
    function saveState() {
      store.save({
        ts: tsField.input.value,
        date: dateField.input.value,
        unit: unitSelect.getValue(),
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

    container.append(nowSection, toDateSection, toTsSection);

    updateNow();
    updateFromTimestamp();
    updateFromDate();

    store.load((saved) => {
      if (saved.ts != null) tsField.input.value = saved.ts;
      if (saved.date != null) dateField.input.value = saved.date;
      if (saved.unit) unitSelect.setValue(saved.unit);
      updateFromTimestamp();
      updateFromDate();
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
