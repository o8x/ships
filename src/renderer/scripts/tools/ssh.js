'use strict';

(function registerSshTool() {
  const { Icons, el, section } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      ssh: {
        title: '主机',
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
        title: 'Hosts',
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
    unknown: 'var(--color-fg-muted)',
  };

  const LEGACY_FAMILY = { macos: 'macos', linux: 'linux', windows: 'windows', bsd: 'bsd' };

  // Detected distro id -> brand icon file in assets/icons (colored).
  const OS_ICON_FILE = {
    ubuntu: 'ubuntu',
    debian: 'debian',
    fedora: 'fedora',
    arch: 'arch',
    centos: 'centos',
    rhel: 'RHEL',
    redhat: 'RHEL',
    'red-hat': 'RHEL',
    rocky: 'rocky',
    linuxmint: 'mint',
    mint: 'mint',
    opensuse: 'opensuse',
    'opensuse-leap': 'opensuse',
    'opensuse-tumbleweed': 'opensuse',
    macos: 'command',
    windows: 'windows',
    linux: 'linux',
  };

  function familyOf(detected) {
    if (!detected) return null;
    if (detected.family) return detected.family;
    return LEGACY_FAMILY[detected.os] || 'unknown';
  }

  function iconFor(detected) {
    if (!detected) return { name: 'server', color: 'var(--color-fg-muted)' };
    const brand = OS_ICON_FILE[detected.os];
    if (brand && Icons[brand]) {
      return { name: brand, color: detected.os === 'macos' ? '#8e8e93' : '' };
    }
    const family = familyOf(detected);
    return { name: OS_ICON[family] || 'server', color: OS_COLOR[family] || 'var(--color-fg-muted)' };
  }

  function osLabel(detected) {
    if (!detected) return i18n.t('ssh.unknown');
    if (detected.label) return detected.label;
    const fallback = {
      macos: 'macOS',
      linux: 'Linux',
      windows: 'Windows',
      bsd: 'BSD',
      unknown: i18n.t('ssh.unknown'),
    };
    return fallback[detected.os] || detected.os || i18n.t('ssh.unknown');
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
      const pending = state.pending.has(host.alias);

      const row = el('div', { class: 'row-card' });

      const iconInfo = iconFor(detected);
      const icon = el('span', { class: 'flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-surface-2' });
      icon.innerHTML = Icons[iconInfo.name] ? Icons[iconInfo.name](17) : Icons.server(17);
      icon.style.color = iconInfo.color || '';
      const tip = detected ? i18n.t('ssh.detectedAs', { os: osLabel(detected) }) : i18n.t('ssh.detect');
      icon.setAttribute('data-tip', tip);

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
        state.detected[payload.alias] = {
          os: payload.os,
          family: payload.family,
          label: payload.label,
          at: payload.at,
        };
        render();
        const label = osLabel(payload);
        showStatus(
          i18n.t('ssh.detectDone', { host: payload.alias, os: label }),
          !payload.os || payload.os === 'unknown'
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
