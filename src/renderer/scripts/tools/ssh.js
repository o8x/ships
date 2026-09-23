'use strict';

(function registerSshTool() {
  const { Icons, el, section } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      ssh: {
        title: '🖥 主机',
        refresh: '刷新',
        empty: '未找到主机，请检查 ~/.ssh/config',
        connect: '连接',
        detect: '探测操作系统',
        detecting: '探测中…',
        unknown: '未知',
        alias: '别名',
        connected: '已在 iTerm 中连接 {host}',
        connectFailed: '连接失败：{error}',
        detectedAs: '系统：{os}',
        detectDone: '{host}：{os}',
        copyCmd: '复制连接命令',
      },
    },
    en: {
      ssh: {
        title: '🖥 Hosts',
        refresh: 'Refresh',
        empty: 'No hosts found. Check ~/.ssh/config',
        connect: 'Connect',
        detect: 'Detect OS',
        detecting: 'Detecting…',
        unknown: 'Unknown',
        alias: 'Alias',
        connected: 'Connecting to {host} in iTerm',
        connectFailed: 'Connect failed: {error}',
        detectedAs: 'OS: {os}',
        detectDone: '{host}: {os}',
        copyCmd: 'Copy connect command',
      },
    },
  });

  const OS_ICON = {
    macos: 'command',
    linux: 'terminal',
    windows: 'windows',
    bsd: 'server',
    unknown: 'server',
  };

  const OS_COLOR = {
    macos: '#8e8e93',
    linux: '#e95420',
    windows: '#0a84ff',
    bsd: '#e5484d',
  };

  function osLabel(os) {
    if (!os || os === 'unknown') return i18n.t('ssh.unknown');
    if (os === 'macos') return 'macOS';
    if (os === 'linux') return 'Linux';
    if (os === 'windows') return 'Windows';
    if (os === 'bsd') return 'BSD';
    return os;
  }

  function mount(container) {
    const state = {
      hosts: [],
      detected: {},
      pending: new Set(),
      disposers: [],
      statusTimer: null,
    };

    const header = el('div', { class: 'mb-3 flex items-center justify-between' });
    header.appendChild(el('h2', { class: 'tool-title mb-0' }, i18n.t('ssh.title')));
    const refreshBtn = el('button', { class: 'icon-btn h-7 w-7', type: 'button', 'data-tip': i18n.t('ssh.refresh') });
    refreshBtn.innerHTML = Icons.refresh(15);
    header.appendChild(refreshBtn);

    const status = el('div', { class: 'mb-2 hidden text-[11px]' }, '');
    const list = el('div', { class: 'flex flex-col gap-1.5' }, '');

    container.append(header, status, list);

    function showStatus(text, isError) {
      status.textContent = text;
      status.style.color = isError ? 'var(--color-danger)' : 'var(--color-success)';
      status.classList.remove('hidden');
      clearTimeout(state.statusTimer);
      state.statusTimer = setTimeout(() => status.classList.add('hidden'), 3200);
    }

    function buildRow(host) {
      const detected = state.detected[host.alias];
      const osName = detected && detected.os;
      const pending = state.pending.has(host.alias);

      const row = el('div', { class: 'row-card' });

      const icon = el('span', { class: 'flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-surface-2' });
      icon.innerHTML = Icons[OS_ICON[osName] || 'server'](17);
      icon.style.color = osName && OS_COLOR[osName] ? OS_COLOR[osName] : 'var(--color-fg-muted)';
      icon.title = osName ? i18n.t('ssh.detectedAs', { os: osLabel(osName) }) : i18n.t('ssh.detect');
      icon.setAttribute('data-tip', icon.title);
      icon.removeAttribute('title');

      const info = el('div', { class: 'min-w-0 flex-1' });
      const address = el('div', { class: 'truncate font-mono text-[13px] text-fg' }, '');
      const portSuffix = host.port && Number(host.port) !== 22 ? `:${host.port}` : '';
      address.textContent = `${host.user ? `${host.user}@` : ''}${host.hostName}${portSuffix}`;
      info.appendChild(address);
      if (host.alias && host.alias !== host.hostName) {
        info.appendChild(el('div', { class: 'truncate text-[10px] text-fg-muted' }, host.alias));
      }

      const actions = el('div', { class: 'flex shrink-0 items-center gap-1' });
      const connectBtn = el('button', { class: 'icon-btn h-7 w-7', type: 'button', 'data-tip': i18n.t('ssh.connect') });
      connectBtn.innerHTML = Icons.plug(15);
      connectBtn.addEventListener('click', () => connect(host));
      const detectBtn = el('button', {
        class: 'icon-btn h-7 w-7',
        type: 'button',
        'data-tip': pending ? i18n.t('ssh.detecting') : i18n.t('ssh.detect'),
      });
      detectBtn.innerHTML = Icons.search(15);
      if (pending) detectBtn.querySelector('svg').classList.add('animate-spin');
      detectBtn.disabled = pending;
      detectBtn.addEventListener('click', () => detect(host));
      actions.append(connectBtn, detectBtn);

      row.append(icon, info, actions);
      return row;
    }

    function render() {
      list.innerHTML = '';
      if (!state.hosts.length) {
        list.appendChild(
          el('div', { class: 'py-10 text-center text-[12px] text-fg-muted' }, i18n.t('ssh.empty'))
        );
        return;
      }
      for (const host of state.hosts) list.appendChild(buildRow(host));
    }

    async function load() {
      try {
        const result = await window.ships.ssh.list();
        state.hosts = (result && result.hosts) || [];
        state.detected = (result && result.detected) || {};
        render();
      } catch (err) {
        console.error(err);
      }
    }

    async function connect(host) {
      const result = await window.ships.ssh.connect({ alias: host.alias });
      if (result && result.ok) showStatus(i18n.t('ssh.connected', { host: host.alias }), false);
      else showStatus(i18n.t('ssh.connectFailed', { error: (result && result.error) || 'error' }), true);
    }

    async function detect(host) {
      state.pending.add(host.alias);
      render();
      await window.ships.ssh.detect({ alias: host.alias });
    }

    refreshBtn.addEventListener('click', load);

    state.disposers.push(
      window.ships.ssh.onDetected((payload) => {
        if (!payload) return;
        state.pending.delete(payload.alias);
        state.detected[payload.alias] = { os: payload.os, at: payload.at };
        render();
        showStatus(
          i18n.t('ssh.detectDone', { host: payload.alias, os: osLabel(payload.os) }),
          payload.os === 'unknown'
        );
      })
    );

    load();

    return () => {
      state.disposers.forEach((dispose) => dispose && dispose());
      clearTimeout(state.statusTimer);
    };
  }

  window.ShipsToolRegistry.register({ id: 'ssh', icon: 'terminal', mount });
})();
