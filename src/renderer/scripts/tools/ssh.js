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
        detect: '探测操作系统',
        detecting: '探测中…',
        notDetected: '未探测',
        unknown: '未知',
        alias: '别名',
        connectFailed: '连接失败：{error}',
        detectedAs: '系统：{os}',
        detectDone: '{host}：{os}',
        copyCmd: '复制连接命令',
        browse: '浏览目录',
        backHosts: '返回主机列表',
        parentDir: '上一级',
        openHere: '在终端中打开并进入该目录',
        openFailed: '打开失败：{error}',
        dirFailed: '无法打开目录：{error}',
        errNoDir: '目录不存在或没有权限',
        errNoPath: '无法解析绝对路径',
        errList: '无法列出目录内容',
        errTimeout: '连接超时',
        errConnect: '连接失败',
        loadingDir: '加载中…',
        emptyDir: '空目录',
        truncatedDir: '目录过大，仅显示部分内容',
        lastDir: '上次',
        enterDir: '进入该目录',
        pathPlaceholder: '输入路径，回车进入',
        quickPath: '进入 {path}',
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
        notDetected: 'Not detected',
        unknown: 'Unknown',
        alias: 'Alias',
        connectFailed: 'Connect failed: {error}',
        detectedAs: 'OS: {os}',
        detectDone: '{host}: {os}',
        copyCmd: 'Copy connect command',
        browse: 'Browse files',
        backHosts: 'Back to hosts',
        parentDir: 'Parent',
        openHere: 'Open in the terminal inside this directory',
        openFailed: 'Open failed: {error}',
        dirFailed: 'Cannot open directory: {error}',
        errNoDir: 'Directory not found or permission denied',
        errNoPath: 'Cannot resolve absolute path',
        errList: 'Cannot list directory',
        errTimeout: 'Connection timed out',
        errConnect: 'Connection failed',
        loadingDir: 'Loading…',
        emptyDir: 'Empty directory',
        truncatedDir: 'Directory too large, showing part of it',
        lastDir: 'Last',
        enterDir: 'Open this directory',
        pathPlaceholder: 'Type a path, press Enter',
        quickPath: 'Open {path}',
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

  function formatSize(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value)) return '';
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
    return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  function parentOf(dir) {
    const value = String(dir || '');
    if (!value || value === '/') return '/';
    const index = value.lastIndexOf('/');
    if (index <= 0) return '/';
    return value.slice(0, index);
  }

  function baseName(dir) {
    const value = String(dir || '');
    const index = value.lastIndexOf('/');
    return index < 0 ? value : value.slice(index + 1);
  }

  function joinPath(dir, name) {
    return dir === '/' ? `/${name}` : `${dir}/${name}`;
  }

  const DIR_ERROR_KEYS = {
    noDir: 'ssh.errNoDir',
    noPath: 'ssh.errNoPath',
    listFailed: 'ssh.errList',
    timeout: 'ssh.errTimeout',
    connect: 'ssh.errConnect',
  };

  const FILE_TYPE_ICONS = (window.ShipsConstants && window.ShipsConstants.FILE_TYPE_ICONS) || {};
  const FILE_NAME_ICONS = (window.ShipsConstants && window.ShipsConstants.FILE_NAME_ICONS) || {};
  const DEFAULT_FILE_ICON = (window.ShipsConstants && window.ShipsConstants.DEFAULT_FILE_ICON) || 'file';
  const QUICK_PATHS = (window.ShipsConstants && window.ShipsConstants.SSH_QUICK_PATHS) || [];

  /* Directory → folder; file → icon for its extension (or its name when it has none). */
  function iconNameFor(entry) {
    if (entry.type === 'dir') return 'folder';
    const lower = String(entry.name || '').toLowerCase();
    if (FILE_NAME_ICONS[lower]) return FILE_NAME_ICONS[lower];
    const dot = lower.lastIndexOf('.');
    if (dot > 0 && dot < lower.length - 1) {
      const icon = FILE_TYPE_ICONS[lower.slice(dot + 1)];
      if (icon) return icon;
    }
    return DEFAULT_FILE_ICON;
  }

  function mount(container) {
    const state = {
      hosts: [],
      detected: {},
      disposers: [],
      statusTimer: null,
      view: 'list',
      alias: '',
      path: '',
      parent: '',
      lastDir: '',
      entries: [],
      truncated: false,
      loading: false,
      error: '',
      pathEdited: false,
    };

    const status = el('div', { class: 'mb-2.5 hidden text-[11px]' }, '');
    const list = el('div', { class: 'flex flex-col gap-2.5' }, '');
    const browse = el('div', { class: 'flex min-h-0 flex-1 flex-col gap-2.5 hidden' }, '');
    // The host list keeps the normal page scroll; the browser pins its own top bar
    // and scrolls only the entry list (#content.tool-fixed, see tailwind.css).
    const content = document.getElementById('content');

    const backHostsBtn = el('button', {
      class: 'icon-btn h-7 w-7 shrink-0',
      type: 'button',
      'data-tip': i18n.t('ssh.backHosts'),
    });
    backHostsBtn.innerHTML = Icons.arrowLeft(15);
    const parentBtn = el('button', {
      class: 'icon-btn h-7 w-7 shrink-0',
      type: 'button',
      'data-tip': i18n.t('ssh.parentDir'),
    });
    parentBtn.innerHTML = Icons.arrowUp(15);
    // Editable path bar: Enter navigates, Escape restores the current directory.
    const pathBox = el('input', {
      class:
        'min-w-0 flex-1 truncate rounded-card border border-border bg-surface-2 px-2.5 py-1.5 font-mono text-[11px] text-fg-muted',
      type: 'text',
      spellcheck: 'false',
      autocomplete: 'off',
      placeholder: i18n.t('ssh.pathPlaceholder'),
    });
    const browseHeader = el('div', { class: 'flex shrink-0 items-center gap-1.5' });
    browseHeader.append(backHostsBtn, parentBtn);
    for (const item of QUICK_PATHS) {
      const quick = typeof item === 'string' ? { path: item, icon: 'folder' } : item;
      if (!quick || !quick.path) continue;
      const quickBtn = el('button', {
        class: 'icon-btn h-7 w-7 shrink-0',
        type: 'button',
        'data-tip': i18n.t('ssh.quickPath', { path: quick.path }),
      });
      const icon = Icons[quick.icon] || Icons.folder;
      quickBtn.innerHTML = icon(15);
      quickBtn.addEventListener('click', () => goTo(quick.path));
      browseHeader.appendChild(quickBtn);
    }
    browseHeader.appendChild(pathBox);
    const entryList = el('div', { class: 'flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto' }, '');
    const browseHint = el('div', { class: 'shrink-0 text-[11px] text-fg-muted' }, '');
    // Notice line sits right under the path bar so loading / empty / error text is
    // visible immediately; the entry list takes the remaining height and scrolls.
    browse.append(browseHeader, browseHint, entryList);

    container.append(status, list, browse);

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
      const browseBtn = el('button', {
        class: 'icon-btn h-7 w-7',
        type: 'button',
        'data-tip': i18n.t('ssh.browse'),
      });
      browseBtn.innerHTML = Icons.folder(15);
      browseBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        openBrowse(host);
      });
      const connectBtn = el('button', { class: 'icon-btn h-7 w-7', type: 'button', 'data-tip': i18n.t('ssh.connect') });
      connectBtn.innerHTML = Icons.plug(15);
      connectBtn.addEventListener('click', () => connect(host));
      actions.append(browseBtn, connectBtn);

      row.append(icon, info, actions);
      return row;
    }

    function render() {
      syncViews();
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
      if (!result || !result.ok) {
        showStatus(i18n.t('ssh.connectFailed', { error: (result && result.error) || 'error' }), true);
      }
    }

    /* ------------------------- directory browser ------------------------- */

    function syncViews() {
      const browsing = state.view === 'browse';
      list.classList.toggle('hidden', browsing);
      browse.classList.toggle('hidden', !browsing);
      if (content) content.classList.toggle('tool-fixed', browsing);
    }

    function dirErrorText(result, target) {
      const code = result && result.code;
      const key = DIR_ERROR_KEYS[code];
      const text = key ? i18n.t(key) : '';
      const detail = result && result.error ? String(result.error).trim() : '';
      const withDetail = text && detail && (code === 'connect' || code === 'timeout');
      const suffix = target && target !== '~' ? ` · ${target}` : '';
      const message = withDetail ? `${text} · ${detail}` : text || detail || 'error';
      return i18n.t('ssh.dirFailed', { error: message + suffix });
    }

    /* Failed navigation feedback: no text, no reflow — the path bar blinks red. */
    function flashPathError() {
      pathBox.classList.remove('blink-error');
      void pathBox.offsetWidth;
      pathBox.classList.add('blink-error');
    }

    function entryRow(entry) {
      const isDir = entry.type === 'dir';
      const row = el('div', {
        class: `row-card row-compact${isDir ? ' row-dir group cursor-pointer' : ''}`,
      });

      // Folders get a right-pointing caret button (single click enters the folder);
      // files keep that slot empty so the name column stays aligned.
      const caret = isDir
        ? el('button', {
            class: 'icon-btn h-6 w-4 shrink-0 justify-start',
            type: 'button',
            'data-tip': i18n.t('ssh.enterDir'),
          })
        : el('span', { class: 'h-6 w-4 shrink-0' });
      if (isDir) {
        if (Icons.caretRight) caret.innerHTML = Icons.caretRight(12);
        caret.addEventListener('click', (event) => {
          event.stopPropagation();
          enterDir(entry.name);
        });
      }

      const icon = el('span', {
        class: 'flex h-6 w-6 shrink-0 items-center justify-center rounded-control bg-surface-2',
      });
      const iconName = iconNameFor(entry);
      icon.innerHTML = (Icons[iconName] || Icons.file)(14);
      if (!isDir) icon.style.color = 'var(--color-fg-muted)';

      // Remote names are plain text — never markup (a name may contain `<` / `&`).
      const name = el('div', { class: 'min-w-0 flex-1 truncate text-[13px] text-fg' });
      name.textContent = entry.name;
      row.append(caret, icon, name);

      // The directory opened in the previous session is highlighted inside its parent.
      const highlighted =
        Boolean(state.lastDir) &&
        parentOf(state.lastDir) === state.path &&
        baseName(state.lastDir) === entry.name;
      if (highlighted) {
        row.classList.add('row-last');
        name.classList.add('font-medium');
        row.appendChild(el('span', { class: 'chip shrink-0' }, i18n.t('ssh.lastDir')));
      }

      if (!isDir) {
        const meta = entry.type === 'link' && entry.target ? `→ ${entry.target}` : formatSize(entry.size);
        const size = el('div', { class: 'shrink-0 truncate font-mono text-[11px] text-fg-muted' });
        size.textContent = meta;
        row.appendChild(size);
      }

      // Folders: hover shows the terminal icon (opens a session inside it — built-in
      // terminal window or iTerm, per 设置 → 终端 → SSH 使用内置终端连接), double-click
      // drills in. Files are display-only, same as before.
      if (isDir) {
        const openBtn = el('button', {
          class: 'icon-btn invisible h-6 w-6 shrink-0 group-hover:visible',
          type: 'button',
          'data-tip': i18n.t('ssh.openHere'),
        });
        openBtn.innerHTML = Icons.terminal(13);
        openBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          openInTerminal(joinPath(state.path, entry.name));
        });
        row.appendChild(openBtn);
        row.addEventListener('dblclick', () => enterDir(entry.name));
      }
      return row;
    }

    function renderBrowse() {
      syncViews();
      if (state.view !== 'browse') return;

      // Don't overwrite what the user is typing; a submitted path is canonicalized
      // once the listing succeeds (loadDir clears pathEdited).
      if (!state.pathEdited) pathBox.value = state.path;

      const atRoot = Boolean(state.path) && state.parent === state.path;
      parentBtn.disabled = state.loading || !state.path || atRoot;
      parentBtn.style.opacity = parentBtn.disabled ? '0.4' : '';

      entryList.innerHTML = '';
      // A failed navigation only adds the error line — the previous listing stays.
      for (const entry of state.entries) entryList.appendChild(entryRow(entry));

      let text = '';
      if (state.loading) text = i18n.t('ssh.loadingDir');
      else if (state.error) text = state.error;
      else if (!state.entries.length) text = i18n.t('ssh.emptyDir');
      else if (state.truncated) text = i18n.t('ssh.truncatedDir');
      browseHint.textContent = text;
      browseHint.style.color = state.error ? 'var(--color-danger)' : '';
    }

    async function loadDir(dir, remember) {
      state.loading = true;
      state.error = '';
      renderBrowse();
      let result = null;
      try {
        result = await window.ships.ssh.listDir({
          alias: state.alias,
          path: dir || '',
          remember: Boolean(remember),
        });
      } catch (err) {
        result = { ok: false, code: 'connect', error: err.message };
      }
      if (state.view !== 'browse') return;
      state.loading = false;
      if (!result || !result.ok) {
        // Navigation failures keep the current listing and only blink the path bar;
        // the error text is reserved for a first load that could not list anything.
        if (state.path) {
          state.error = '';
          flashPathError();
        } else {
          state.error = dirErrorText(result, dir || '');
        }
        renderBrowse();
        return;
      }
      state.pathEdited = false;
      state.path = result.path;
      state.parent = result.parent || result.path;
      state.entries = result.entries || [];
      state.truncated = Boolean(result.truncated);
      state.lastDir = result.lastDir || '';
      renderBrowse();
    }

    function enterDir(name) {
      if (state.loading) return;
      loadDir(joinPath(state.path, name), true);
    }

    /* Path bar / shortcut input: `/abs`, `~`, `~/x` stay as typed; anything else is
       resolved against the directory currently on screen. */
    function resolvePath(raw) {
      const value = String(raw || '').trim();
      if (!value) return '';
      if (value === '~' || value.startsWith('/') || value.startsWith('~/')) return value;
      return joinPath(state.path || '/', value);
    }

    function goTo(raw) {
      if (state.loading) return;
      const target = resolvePath(raw);
      if (target) loadDir(target, true);
    }

    function openBrowse(host) {
      state.view = 'browse';
      state.alias = host.alias;
      state.path = '';
      state.parent = '';
      state.entries = [];
      state.lastDir = '';
      state.error = '';
      state.pathEdited = false;
      // No path: the main process seeds the view from the last opened directory.
      loadDir('', false);
    }

    /* 打开方式由主进程决定（设置 → 终端 → SSH 使用内置终端连接），这里只关心成败。 */
    async function openInTerminal(dir) {
      const result = await window.ships.ssh.openDir({ alias: state.alias, path: dir });
      if (!result || !result.ok) {
        showStatus(i18n.t('ssh.openFailed', { error: (result && result.error) || 'error' }), true);
        return;
      }
      state.lastDir = dir;
      renderBrowse();
    }

    backHostsBtn.addEventListener('click', () => {
      state.view = 'list';
      render();
    });
    parentBtn.addEventListener('click', () => {
      if (state.loading || !state.path) return;
      loadDir(state.parent || parentOf(state.path), false);
    });
    pathBox.addEventListener('input', () => {
      state.pathEdited = true;
    });
    pathBox.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        goTo(pathBox.value);
        return;
      }
      if (event.key === 'Escape') {
        event.stopPropagation();
        state.pathEdited = false;
        pathBox.value = state.path;
        pathBox.blur();
      }
    });
    pathBox.addEventListener('blur', () => {
      if (!state.pathEdited) return;
      state.pathEdited = false;
      pathBox.value = state.path;
    });
    pathBox.addEventListener('animationend', (event) => {
      if (event.animationName === 'ships-blink-error') pathBox.classList.remove('blink-error');
    });

    // Refresh the list whenever the popover is opened (shown / focused).
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
      if (content) content.classList.remove('tool-fixed');
    };
  }

  window.ShipsToolRegistry.register({ id: 'ssh', icon: 'terminal', mount });
})();
