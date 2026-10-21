'use strict';

(function registerSshTool() {
  const { Icons, el, osIconInfo } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      ssh: {
        title: '主机',
        refresh: '刷新',
        empty: '未找到主机，请检查 ~/.ssh/config',
        connect: '连接',
        edit: '编辑',
        detect: '探测操作系统',
        detecting: '探测中…',
        notDetected: '未探测',
        unknown: '未知',
        alias: '别名',
        connectFailed: '连接失败：{error}',
        detectedAs: '系统：{os}',
        detectDone: '{host}：{os}',
        files: '打开文件管理',
        ungrouped: '未分组',
      },
    },
    en: {
      ssh: {
        title: 'Hosts',
        refresh: 'Refresh',
        empty: 'No hosts found. Check ~/.ssh/config',
        connect: 'Connect',
        edit: 'Edit',
        detect: 'Detect OS',
        detecting: 'Detecting…',
        notDetected: 'Not detected',
        unknown: 'Unknown',
        alias: 'Alias',
        connectFailed: 'Connect failed: {error}',
        detectedAs: 'OS: {os}',
        detectDone: '{host}: {os}',
        files: 'Open file manager',
        ungrouped: 'Ungrouped',
      },
    },
  });

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
      disposers: [],
      statusTimer: null,
      // 折叠的分组（默认空 = 全部分组展开）。key 为分组名，未分组用 ''。
      collapsed: new Set(),
    };

    const status = el('div', { class: 'mb-card hidden text-[11px]' }, '');
    const list = el('div', { class: 'flex flex-col gap-card' }, '');
    container.append(status, list);

    function showStatus(text, isError) {
      status.textContent = text;
      status.style.color = isError ? 'var(--color-danger)' : 'var(--color-success)';
      status.classList.remove('hidden');
      clearTimeout(state.statusTimer);
      state.statusTimer = setTimeout(() => status.classList.add('hidden'), 3200);
    }

    function buildRow(host) {
      const detected = state.detected[host.alias];

      const row = el('div', { class: 'row-card cursor-pointer' });
      row.addEventListener('dblclick', (event) => {
        if (event.target.closest('button')) return;
        connect(host);
      });

      const iconInfo = osIconInfo(detected);
      const icon = el('span', { class: 'flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-surface-2' });
      icon.innerHTML = Icons[iconInfo.name] ? Icons[iconInfo.name](17) : Icons.server(17);
      icon.style.color = iconInfo.color || '';
      const tip = detected ? i18n.t('ssh.detectedAs', { os: osLabel(detected) }) : i18n.t('ssh.notDetected');
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
      const editBtn = el('button', { class: 'icon-btn h-7 w-7', type: 'button', 'data-tip': i18n.t('ssh.edit') });
      editBtn.innerHTML = Icons.edit(15);
      editBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        window.ships.ssh.edit(host.alias);
      });
      const filesBtn = el('button', {
        class: 'icon-btn h-7 w-7',
        type: 'button',
        'data-tip': i18n.t('ssh.files'),
      });
      filesBtn.innerHTML = Icons.folder(15);
      filesBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        window.ships.fileWindow.open(host.alias);
      });
      const connectBtn = el('button', { class: 'icon-btn h-7 w-7', type: 'button', 'data-tip': i18n.t('ssh.connect') });
      connectBtn.innerHTML = Icons.plug(15);
      connectBtn.addEventListener('click', () => connect(host));
      actions.append(editBtn, filesBtn, connectBtn);

      row.append(icon, info, actions);
      return row;
    }

    function namedGroups() {
      const seen = new Set();
      const groups = [];
      for (const host of state.hosts) {
        const group = host.group || '';
        if (!group) continue;
        const key = group.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        groups.push(group);
      }
      return groups;
    }

    function buildGroupSection(group, hosts) {
      const collapsed = state.collapsed.has(group);
      const item = el('div', { class: collapsed ? 'accordion-item collapsed' : 'accordion-item' });
      const head = el('div', { class: 'accordion-header' });
      const toggle = el('button', { class: 'accordion-toggle', type: 'button' });
      const chevron = el('span', { class: 'accordion-chevron inline-flex' });
      chevron.innerHTML = Icons.chevronDown(14);
      const name = el('span', { class: 'accordion-name truncate' });
      name.textContent = group || i18n.t('ssh.ungrouped');
      toggle.append(chevron, name, el('span', { class: 'accordion-count' }, String(hosts.length)));
      toggle.addEventListener('click', () => {
        if (state.collapsed.has(group)) state.collapsed.delete(group);
        else state.collapsed.add(group);
        render();
      });
      head.appendChild(toggle);
      const body = el('div', { class: 'accordion-body' });
      for (const host of hosts) body.appendChild(buildRow(host));
      item.append(head, body);
      return item;
    }

    function render() {
      list.innerHTML = '';
      if (!state.hosts.length) {
        list.appendChild(el('div', { class: 'py-10 text-center text-[12px] text-fg-muted' }, i18n.t('ssh.empty')));
        return;
      }
      const named = namedGroups();
      if (!named.length) {
        for (const host of state.hosts) list.appendChild(buildRow(host));
        return;
      }
      const accordion = el('div', { class: 'accordion' });
      for (const group of named) {
        accordion.appendChild(
          buildGroupSection(group, state.hosts.filter((host) => (host.group || '') === group))
        );
      }
      const ungrouped = state.hosts.filter((host) => !host.group);
      if (ungrouped.length) accordion.appendChild(buildGroupSection('', ungrouped));
      list.appendChild(accordion);
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
      if (!result || !result.ok) {
        showStatus(i18n.t('ssh.connectFailed', { error: (result && result.error) || 'error' }), true);
      }
    }

    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    const onVisible = () => {
      if (!document.hidden) load();
    };
    document.addEventListener('visibilitychange', onVisible);

    state.disposers.push(
      window.ships.ssh.onDetected((payload) => {
        if (!payload) return;
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
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      clearTimeout(state.statusTimer);
    };
  }

  window.ShipsToolRegistry.register({ id: 'ssh', icon: 'terminal', mount });
})();
