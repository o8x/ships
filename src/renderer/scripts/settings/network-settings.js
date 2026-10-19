'use strict';

(function registerNetworkSettings() {
  const { el, field, createSelect, segmented } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      netTest: {
        title: '网络测试',
        subtitle: '在本地或 SSH 主机上执行测试命令，下方是可直接输入的交互终端',
        runOn: '执行位置',
        local: '本地',
        ungrouped: '未分组',
        type: '类型',
        target: 'IP / 网段',
        targetPlaceholder: '如 172.16.3.155 或 172.16.3.0/24',
        port: '端口',
        portOptional: '留空则扫描该目标的常用端口',
        noPort: '该类型不使用端口',
        run: '测试',
        stop: '停止',
        ready: 'Ships 网络测试 · 交互终端',
        idle: '终端可直接输入命令；选好类型与目标后点「测试」会把命令送进终端执行',
        sessionEnded: '会话已结束，输入任意键或点「测试」重新启动',
        sessionFailed: '无法启动终端会话：{error}',
        needTarget: '需要有效的 IPv4 地址与端口',
        needCidr: '执行扫描需要带掩码的网段（如 172.16.3.0/24）',
        prefixInvalid: '网段前缀需在 16–30 之间（如 192.168.1.0/24）',
        needHost: '需要有效的 IP 或网段',
        failed: '执行失败：{error}',
        noTerminal: 'xterm 未能加载，无法显示终端输出',
        scanApp: '扫描应用',
        scanHost: '扫描主机',
        tipTcp: 'TCP：nc -vz -w 3',
        tipUdp: 'UDP：nc -uzv -w 3（无握手）',
        tipHttp: 'HTTP(S)：curl -Ikm8（443 用 https）',
        tipIcmp: 'ICMP：ping -c 4',
        tipArp: 'ARP：arp -n（同网段）',
        tipScanApp: '扫描应用：nmap -sT 扫可用端口或指定端口',
        tipScanHost: '扫描主机：nmap -sn 网段（需网段）',
      },
    },
    en: {
      netTest: {
        title: 'Network test',
        subtitle: 'Run test commands locally or on an SSH host in the terminal below',
        runOn: 'Run on',
        local: 'Local',
        ungrouped: 'Ungrouped',
        type: 'Type',
        target: 'IP / subnet',
        targetPlaceholder: 'e.g. 172.16.3.155 or 172.16.3.0/24',
        port: 'Port',
        portOptional: 'Leave empty to scan the usual ports',
        noPort: 'This type does not use a port',
        run: 'Test',
        stop: 'Stop',
        ready: 'Ships network test · interactive terminal',
        idle: 'Type in the terminal, or pick a type + target and press Test',
        sessionEnded: 'Session ended — press any key or Test to restart',
        sessionFailed: 'Cannot start the terminal session: {error}',
        needTarget: 'A valid IPv4 address and port are required',
        needCidr: 'Scanning needs a subnet with a mask (e.g. 172.16.3.0/24)',
        prefixInvalid: 'Subnet prefix must be 16–30 (e.g. 192.168.1.0/24)',
        needHost: 'A valid IP or subnet is required',
        failed: 'Run failed: {error}',
        noTerminal: 'xterm failed to load, no terminal output available',
        scanApp: 'Scan app',
        scanHost: 'Scan hosts',
        tipTcp: 'TCP: nc -vz -w 3',
        tipUdp: 'UDP: nc -uzv -w 3 (no handshake)',
        tipHttp: 'HTTP(S): curl -Ikm8 (https on 443)',
        tipIcmp: 'ICMP: ping -c 4',
        tipArp: 'ARP: arp -n (same subnet)',
        tipScanApp: 'Scan app: nmap -sT open ports / a given port',
        tipScanHost: 'Scan hosts: nmap -sn subnet (needs a subnet)',
      },
    },
  });

  const TYPES = (window.ShipsConstants && window.ShipsConstants.NET_TEST_PROTOCOLS) || [];
  const DEFAULT_PORT = (window.ShipsConstants && window.ShipsConstants.NET_TEST_DEFAULT_PORT) || 80;
  const SCAN_MIN = (window.ShipsConstants && window.ShipsConstants.NET_TEST_SCAN_PREFIX_MIN) || 16;
  const SCAN_MAX = (window.ShipsConstants && window.ShipsConstants.NET_TEST_SCAN_PREFIX_MAX) || 30;

  // Mirrors src/main/utils/net-test.js — the main process validates again before it
  // builds anything; this copy only drives the UI state.
  const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
  const CIDR_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}\/(\d{1,2})$/;
  const ipOk = (value) => IPV4_RE.test(String(value || '').trim());
  const cidrShapeOk = (value) => CIDR_RE.test(String(value || '').trim());
  const cidrOk = (value) => {
    const match = CIDR_RE.exec(String(value || '').trim());
    if (!match) return false;
    const prefix = Number(match[4]);
    return prefix >= SCAN_MIN && prefix <= SCAN_MAX;
  };
  const hostOrCidrOk = (value) => ipOk(value) || cidrOk(value);
  const portOk = (value) => {
    const text = String(value || '').trim();
    if (!/^\d{1,5}$/.test(text)) return false;
    const port = Number(text);
    return port >= 1 && port <= 65535;
  };

  const ANSI = {
    command: '\u001b[36m',
    meta: '\u001b[90m',
    error: '\u001b[31m',
    reset: '\u001b[0m',
  };

  function mount(pane, ctx) {
    const state = { type: TYPES.length ? TYPES[0].value : '', runId: '', hosts: [] };

    const section = el('div', { class: 'flex h-full min-h-0 flex-col gap-card' });
    section.appendChild(el('div', { class: 'shrink-0 truncate text-[12px] text-fg-muted' }, i18n.t('netTest.subtitle')));

    const typeFor = (value) =>
      TYPES.find((entry) => entry.value === (value == null ? state.type : value)) || TYPES[0] || null;
    const typeLabel = (entry) => (entry.labelKey ? i18n.t(`netTest.${entry.labelKey}`) : entry.label);

    /* Run on: local machine, or one of the hosts from ~/.ssh/config (jump host). */
    const targetSelect = createSelect({
      options: [{ value: '', label: i18n.t('netTest.local') }],
      value: '',
      align: 'left',
      onChange: () => refresh(),
    });
    const targetWrap = el('label', { class: 'block w-[190px] shrink-0' });
    targetWrap.append(el('span', { class: 'tool-label' }, i18n.t('netTest.runOn')), targetSelect.el);

    const typeSwitch = segmented(
      [],
      state.type,
      (value) => {
        state.type = value;
        refresh();
      },
      { className: 'segment-compact flex w-full overflow-x-auto' }
    );
    const typeWrap = el('div', { class: 'flex min-w-0 flex-1 flex-col gap-1' });
    typeWrap.append(el('span', { class: 'tool-label' }, i18n.t('netTest.type')), typeSwitch.root);

    const targetField = field(i18n.t('netTest.target'), {
      placeholder: i18n.t('netTest.targetPlaceholder'),
      spellcheck: 'false',
    });
    targetField.wrapper.classList.add('min-w-0', 'flex-1');
    const portInput = el('input', {
      class: 'field w-full font-mono',
      type: 'text',
      inputmode: 'numeric',
      spellcheck: 'false',
    });
    portInput.value = String(DEFAULT_PORT);
    const portWrap = el('label', { class: 'block w-[80px] shrink-0' });
    portWrap.append(el('span', { class: 'tool-label' }, i18n.t('netTest.port')), portInput);
    const runBtn = el('button', { class: 'btn btn-accent shrink-0 py-2', type: 'button' }, i18n.t('netTest.run'));
    const stopBtn = el('button', { class: 'btn shrink-0 py-2', type: 'button' }, i18n.t('netTest.stop'));
    stopBtn.disabled = true;
    const row1 = el('div', { class: 'flex shrink-0 items-end gap-card' });
    row1.append(targetWrap, targetField.wrapper, portWrap);
    const row2 = el('div', { class: 'flex shrink-0 items-end gap-card' });
    row2.append(typeWrap, runBtn, stopBtn);

    const termHost = el('div', { class: 'min-h-0 flex-1' });
    const termBox = el('div', { class: 'flex min-h-[200px] flex-1 flex-col rounded-card border border-border p-2' });
    termBox.appendChild(termHost);

    const hint = el('div', { class: 'shrink-0 truncate text-[11px] text-fg-muted' }, i18n.t('netTest.idle'));
    section.append(row1, row2, termBox, hint);
    pane.appendChild(section);

    /* ------------------------- interactive terminal ------------------------- */

    function terminalTheme() {
      // macOS-like overlay scrollbar (only a safety net: the scrollbar is hidden below)
      const dark = document.documentElement.dataset.theme === 'dark';

      const css = getComputedStyle(document.documentElement);
      const read = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
      return {
        background: read('--color-bg', '#ffffff'),
        foreground: read('--color-fg', '#1d1d1f'),
        cursor: read('--color-accent', '#2e6bfc'),
        selectionBackground: read('--color-fg-muted', '#8a8a8f'),
        scrollbarSliderBackground: dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.2)',
        scrollbarSliderHoverBackground: dark ? 'rgba(255,255,255,0.34)' : 'rgba(0,0,0,0.32)',
        scrollbarSliderActiveBackground: dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.42)',
      };
    }

    let term = null;
    let fit = null;
    let observer = null;
    let resizeTimer = null;
    let sessionRunning = false;
    let sessionId = '';
    let lastCols = 0;
    let lastRows = 0;
    let lastBoxKey = '';

    if (window.Terminal) {
      const mono = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim();
      const cfg = (ctx && ctx.settings) || {};
      term = new window.Terminal({
        convertEol: true,
        cursorBlink: true,
        scrollback: cfg.terminalScrollback || 10000,
        fontSize: Math.max(8, Math.min(24, cfg.terminalFontSize || 12)),
        fontFamily: mono || 'monospace',
        theme: terminalTheme(),
      });
      term.open(termHost);
      if (window.FitAddon && window.FitAddon.FitAddon) {
        fit = new window.FitAddon.FitAddon();
        term.loadAddon(fit);
        fit.fit();
      }
      observer = new ResizeObserver(() => scheduleFit());
      observer.observe(termBox);
      term.onData((data) => sendInput(data));
    } else {
      termHost.appendChild(el('div', { class: 'p-2 text-[12px] text-fg-muted' }, i18n.t('netTest.noTerminal')));
    }

    function write(text) {
      if (term) term.write(text);
    }

    /* Guarded fit / PTY resize: redundant resizes make the shell redraw and look like
       the view jumps while scrolling. */
    function syncPtySize() {
      if (!term || !sessionId) return;
      if (term.cols === lastCols && term.rows === lastRows) return;
      lastCols = term.cols;
      lastRows = term.rows;
      window.ships.terminal.resize(sessionId, term.cols, term.rows);
    }

    function fitIfNeeded() {
      if (!fit || !term || !termBox) return;
      const rect = termBox.getBoundingClientRect();
      const key = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
      if (key === lastBoxKey) return;
      lastBoxKey = key;
      fit.fit();
      syncPtySize();
    }

    function scheduleFit() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(fitIfNeeded, 150);
    }

    async function startSession() {
      if (!term || sessionRunning) return sessionRunning;
      sessionRunning = true;
      const result = await window.ships.terminal.start(term.cols, term.rows, (ctx && ctx.settings && ctx.settings.terminalShell) || '');
      if (!result || !result.ok) {
        sessionRunning = false;
        sessionId = '';
        write(`\r\n${ANSI.error}${i18n.t('netTest.sessionFailed', { error: (result && result.error) || 'error' })}${ANSI.reset}\r\n`);
      } else {
        sessionId = result.id;
        lastCols = term.cols;
        lastRows = term.rows;
      }
      refresh();
      return sessionRunning;
    }

    function sendInput(data) {
      if (!term) return;
      if (sessionRunning && sessionId) {
        window.ships.terminal.input(sessionId, data);
        return;
      }
      startSession().then(() => {
        if (sessionId) window.ships.terminal.input(sessionId, data);
      });
    }

    function selection() {
      const item = typeFor() || {};
      return {
        item,
        portMode: item.port || 'required',
        host: targetSelect.getValue(),
        target: targetField.input.value.trim(),
        port: portInput.value.trim(),
      };
    }

    function readiness() {
      const { item, portMode, target } = selection();
      const targetOk = item.subnetOnly
        ? cidrOk(target)
        : item.value === 'scan-app'
          ? hostOrCidrOk(target)
          : ipOk(target);
      let portOkValue = true;
      if (portMode === 'required') portOkValue = portOk(portInput.value);
      else if (portMode === 'optional') portOkValue = !portInput.value.trim() || portOk(portInput.value);
      return targetOk && portOkValue;
    }

    function refresh() {
      const { item, portMode, target } = selection();
      portInput.disabled = portMode === 'none';
      portInput.setAttribute(
        'data-tip',
        portMode === 'none' ? i18n.t('netTest.noPort') : portMode === 'optional' ? i18n.t('netTest.portOptional') : ''
      );
      typeSwitch.setOptions(
        TYPES.map((entry) => ({
          value: entry.value,
          label: typeLabel(entry),
          tip: entry.tipKey ? i18n.t(`netTest.${entry.tipKey}`) : '',
        }))
      );

      const ready = readiness();
      runBtn.disabled = !ready;
      stopBtn.disabled = !sessionRunning;

      hint.style.color = '';
      if (item.subnetOnly && !cidrOk(target)) {
        hint.textContent = cidrShapeOk(target) ? i18n.t('netTest.prefixInvalid') : i18n.t('netTest.needCidr');
        return;
      }
      if (!ready) {
        const hostLike = item.subnetOnly || item.value === 'scan-app' || item.value === 'icmp' || item.value === 'arp';
        hint.textContent = i18n.t(hostLike ? 'netTest.needHost' : 'netTest.needTarget');
        return;
      }
      hint.textContent = i18n.t('netTest.idle');
    }

    async function runTest() {
      const { item, host, target, port, portMode } = selection();
      if (!sessionRunning) await startSession();
      const result = await window.ships.netTest.command({
        id: sessionId,
        protocol: item.value,
        target,
        port: portMode === 'none' ? '' : port,
        host,
      });
      if (!result || !result.ok) {
        hint.textContent = i18n.t('netTest.failed', { error: (result && result.error) || 'error' });
        hint.style.color = 'var(--color-danger)';
        return;
      }
      if (term) term.focus();
    }

    const offData = window.ships.terminal.onData((message) => {
      if (message && message.id === sessionId && message.type === 'data') write(message.data);
    });
    const offExit = window.ships.terminal.onExit((message) => {
      if (message && message.id !== sessionId) return;
      sessionRunning = false;
      sessionId = '';
      if (message && message.type === 'error') {
        write(`\r\n${ANSI.error}${i18n.t('netTest.sessionFailed', { error: message.message })}${ANSI.reset}\r\n`);
      } else {
        write(`\r\n${ANSI.meta}${i18n.t('netTest.sessionEnded')}${ANSI.reset}\r\n`);
      }
      refresh();
    });
    const offSettings = window.ships.onSettingsChanged(() => {
      if (term) term.options.theme = terminalTheme();
    });

    runBtn.addEventListener('click', runTest);
    stopBtn.addEventListener('click', () => {
      if (sessionId) window.ships.terminal.interrupt(sessionId);
    });
    portInput.addEventListener('input', () => {
      portInput.value = portInput.value.replace(/[^\d]/g, '');
      refresh();
    });
    targetField.input.addEventListener('input', refresh);

    /* Jump-host list = the same ~/.ssh/config hosts the SSH tool uses. */
    window.ships.sshConfig
      .read()
      .then((hosts) => {
        state.hosts = Array.isArray(hosts) ? hosts : [];
        const options = [{ value: '', label: i18n.t('netTest.local') }];
        // 多个分组时，在两组之间插入分组小标题（唯一分组 / 未分组不显示）。
        const groups = new Set(state.hosts.map((host) => host.group || ''));
        const showHeaders = groups.size > 1;
        let lastGroup = null;
        for (const host of state.hosts) {
          const group = host.group || '';
          if (showHeaders && group !== lastGroup) {
            options.push({ header: true, label: group || i18n.t('netTest.ungrouped') });
          }
          lastGroup = group;
          const address = `${host.user ? `${host.user}@` : ''}${host.hostName}`;
          options.push({
            value: host.alias,
            label: host.alias && host.alias !== host.hostName ? `${host.alias} · ${address}` : address,
          });
        }
        targetSelect.setOptions(options);
      })
      .catch((err) => console.error(err));

    refresh();
    startSession();

    return () => {
      offData();
      offExit();
      offSettings();
      clearTimeout(resizeTimer);
      if (observer) observer.disconnect();
      if (sessionId) window.ships.terminal.kill(sessionId);
      sessionRunning = false;
      sessionId = '';
      if (fit) fit.dispose();
      if (term) term.dispose();
    };
  }

  window.ShipsSettingsRegistry.register({
    id: 'network',
    icon: 'wifi',
    labelKey: 'netTest.title',
    mount,
  });
})();
