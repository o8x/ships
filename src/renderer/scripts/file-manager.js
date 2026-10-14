'use strict';

/* Reusable SFTP file manager UI: directory tree (left) + file list (right) + status
   bar, with draggable dividers (tree width + name/size/time columns), a status-bar
   progress bar, and per-instance SFTP sessions. Hosted both by the terminal window's
   embedded bottom panel and by the detached file window (scripts/file-window.js). */

(function registerShipsFileManager() {
  const { Icons, el } = window.ShipsUI;
  const i18n = window.ShipsI18n;
  const constants = window.ShipsConstants || {};
  const FILE_TYPE_ICONS = constants.FILE_TYPE_ICONS || {};
  const FILE_NAME_ICONS = constants.FILE_NAME_ICONS || {};
  const DEFAULT_FILE_ICON = constants.DEFAULT_FILE_ICON || 'file';
  // 完成提示（已下载 / 已上传 / 已定位 / 已复制）在状态栏保留多久后惰性清除。
  const STATUS_TTL_MS = constants.FILE_STATUS_TTL_MS || 30000;
  // 双击打开方式：超过该体积、或属于非文本类型时用系统默认程序，否则用 VS Code。
  const VSCODE_MAX_BYTES = constants.FILE_VSCODE_MAX_BYTES || 10 * 1024 * 1024;
  const NON_TEXT_EXTENSIONS = new Set(constants.NON_TEXT_EXTENSIONS || []);

  const DEFAULT_LAYOUT = {
    treeWidth: 300,
    name: 160,
    size: 60,
    perm: 90,
    time: 130,
  };
  const MIN_TREE = 140;
  const MIN_COL = 60;

  i18n.extend({
    zh: {
      filesUi: {
        button: '文件',
        home: '家目录',
        refresh: '刷新',
        cdHere: '在终端 cd 到此目录',
        popOut: '分离为独立窗口',
        pathPlaceholder: '输入远端路径，回车进入',
        name: '文件名',
        size: '体积',
        time: '时间',
        perm: '权限',
        upload: '上传',
        download: '下载',
        open: '打开',
        openVSCode: '用 VS Code 打开',
        copyPath: '复制路径',
        copiedPath: '已复制路径：{path}',
        cdHistory: '最近访问',
        copyTransfer: '复制传输命令',
        copiedCommand: '已复制：{command}',
        copyFailed: '复制传输命令失败',
        empty: '空目录',
        loading: '加载中…',
        connecting: '正在连接 SFTP…',
        connected: '已连接 {target}',
        connectFailed: '连接失败：{error}',
        notConnected: '未连接 SFTP',
        downloading: '正在下载 {name}…',
        downloaded: '已下载到 {path}',
        downloadFailed: '下载失败：{error}',
        opened: '已在文件管理器中定位 {path}',
        openedVSCode: '已用 VS Code 打开 {path}',
        uploading: '正在上传 {name}…',
        uploaded: '已上传 {name}',
        uploadFailed: '上传失败：{error}',
        noTarget: '未检测到 SSH 连接',
        errProxyjump: '该主机的 ProxyJump 暂不支持 SFTP',
        errAuth: '认证失败（检查私钥 / ssh-agent）',
        errTimeout: '连接超时',
        errSftp: '无法启动 SFTP 子系统',
        errConnect: '连接失败',
        errNoDir: '目录不存在或没有权限',
        errList: '无法列出目录内容',
      },
    },
    en: {
      filesUi: {
        button: 'Files',
        home: 'Home',
        refresh: 'Refresh',
        cdHere: 'cd to this directory in the terminal',
        popOut: 'Open in a separate window',
        pathPlaceholder: 'Type a remote path, press Enter',
        name: 'Name',
        size: 'Size',
        time: 'Time',
        perm: 'Perm',
        upload: 'Upload',
        download: 'Download',
        open: 'Open',
        openVSCode: 'Open in VS Code',
        copyPath: 'Copy path',
        copiedPath: 'Copied path: {path}',
        cdHistory: 'Recent',
        copyTransfer: 'Copy transfer command',
        copiedCommand: 'Copied: {command}',
        copyFailed: 'Failed to copy transfer command',
        empty: 'Empty directory',
        loading: 'Loading…',
        connecting: 'Connecting SFTP…',
        connected: 'Connected to {target}',
        connectFailed: 'Connect failed: {error}',
        notConnected: 'SFTP not connected',
        downloading: 'Downloading {name}…',
        downloaded: 'Saved to {path}',
        downloadFailed: 'Download failed: {error}',
        opened: 'Revealed in Finder: {path}',
        openedVSCode: 'Opened in VS Code: {path}',
        uploading: 'Uploading {name}…',
        uploaded: 'Uploaded {name}',
        uploadFailed: 'Upload failed: {error}',
        noTarget: 'No SSH connection detected',
        errProxyjump: 'ProxyJump is not supported for SFTP',
        errAuth: 'Authentication failed (check the key / ssh-agent)',
        errTimeout: 'Connection timed out',
        errSftp: 'Cannot start the SFTP subsystem',
        errConnect: 'Connection failed',
        errNoDir: 'Directory not found or permission denied',
        errList: 'Cannot list the directory',
      },
    },
  });

  const ERROR_KEYS = {
    proxyjump: 'filesUi.errProxyjump',
    auth: 'filesUi.errAuth',
    timeout: 'filesUi.errTimeout',
    sftp: 'filesUi.errSftp',
    connect: 'filesUi.errConnect',
    noDir: 'filesUi.errNoDir',
    listFailed: 'filesUi.errList',
    'no-target': 'filesUi.noTarget',
    'not-connected': 'filesUi.notConnected',
  };

  function joinPath(dir, name) {
    const base = String(dir || '/');
    return base === '/' ? `/${name}` : `${base.replace(/\/$/, '')}/${name}`;
  }

  function formatSize(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value)) return '';
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
    return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  function formatTime(ms) {
    const value = Number(ms);
    if (!value) return '';
    const date = new Date(value);
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  /* st_mode -> `drwxr-xr-x` style string (falls back to '' when unknown). */
  function formatMode(mode, type) {
    const value = Number(mode);
    if (!value) return '';
    const typeChar = type === 'dir' ? 'd' : type === 'link' ? 'l' : '-';
    const bits = value & 0o777;
    const triple = (shift) => {
      const n = (bits >> shift) & 0o7;
      return `${n & 4 ? 'r' : '-'}${n & 2 ? 'w' : '-'}${n & 1 ? 'x' : '-'}`;
    };
    return `${typeChar}${triple(6)}${triple(3)}${triple(0)}`;
  }

  function iconFor(name) {
    const lower = String(name || '').toLowerCase();
    if (FILE_NAME_ICONS[lower]) return FILE_NAME_ICONS[lower];
    const dot = lower.lastIndexOf('.');
    if (dot > 0 && dot < lower.length - 1) {
      const icon = FILE_TYPE_ICONS[lower.slice(dot + 1)];
      if (icon) return icon;
    }
    return DEFAULT_FILE_ICON;
  }

  /* 双击打开方式：体积超过 10M、或属于图片 / PDF / Word 等非文本类型时用系统默认程序
     「打开」，否则用 VS Code 打开。 */
  function prefersNativeOpen(entry) {
    const size = Number(entry && entry.size) || 0;
    if (size > VSCODE_MAX_BYTES) return true;
    const name = String((entry && entry.name) || '').toLowerCase();
    const dot = name.lastIndexOf('.');
    const ext = dot > 0 && dot < name.length - 1 ? name.slice(dot + 1) : '';
    return NON_TEXT_EXTENSIONS.has(ext);
  }

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  /* POSIX path normalisation (the renderer has no node `path`); used to resolve a
     `cd` typed in the terminal against the current directory. */
  function normalizePosix(input) {
    const value = String(input || '');
    const absolute = value.startsWith('/');
    const out = [];
    for (const part of value.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') {
        if (out.length && out[out.length - 1] !== '..') out.pop();
        else if (!absolute) out.push('..');
      } else {
        out.push(part);
      }
    }
    const joined = out.join('/');
    if (absolute) return `/${joined}`.replace(/\/+$/, '') || '/';
    return joined || '.';
  }

  /* Turn a `cd` argument (the part after `cd`) into an absolute remote path using the
     current directory and the remote home for `~`. Returns '' when not resolvable. */
  function resolveCd(raw, cwd, home) {
    let value = String(raw == null ? '' : raw).trim();
    if (value.length >= 2) {
      const first = value[0];
      if ((first === '"' || first === "'") && value[value.length - 1] === first) {
        value = value.slice(1, -1);
      }
    }
    if (!value || value === '~') return home || '/';
    if (value === '-') return '';
    if (value.startsWith('~/')) return normalizePosix(`${home || ''}${value.slice(1)}`);
    if (value.startsWith('/')) return normalizePosix(value);
    // 相对路径：无法可靠得知 shell 的真实当前目录（shellCwd 只是估计值），
    // 因此含 `..` 的相对路径（如 `cd ..` / `cd ../x`）不跟随，避免导航到错误目录。
    if (value.split('/').includes('..')) return '';
    return normalizePosix(`${cwd || home || '/'}/${value}`);
  }

  function create(options) {
    const opts = options || {};
    const root = opts.root;
    if (!root) return null;
    const onLayout = typeof opts.onLayout === 'function' ? opts.onLayout : () => {};
    const onCd = typeof opts.onCd === 'function' ? opts.onCd : null;
    const onPopOut = typeof opts.onPopOut === 'function' ? opts.onPopOut : null;
    const layoutData = Object.assign({}, DEFAULT_LAYOUT, opts.layout || {});

    const state = {
      id: '',
      target: '',
      active: Boolean(opts.active),
      connecting: false,
      connected: false,
      busy: false,
      home: '',
      cwd: '',
      // 终端 shell 的「当前目录」估计值（cd 跟随用；初始 = 家目录，cd 成功后同步）
      shellCwd: '',
      // 连接就绪前收到的 cd 参数，连上后再跟随
      pendingCd: null,
      entries: [],
      selected: '',
      expanded: new Set(),
      children: new Map(),
      progress: null,
    };

    /* ------------------------------- DOM ---------------------------------- */
    const treePane = el('div', { class: 'fm-tree-pane' });
    const pathRow = el('div', { class: 'fm-path-row' });
    const treeEl = el('div', { class: 'fm-tree' });
    treePane.append(pathRow, treeEl);

    const listPane = el('div', { class: 'fm-list-pane' });
    const listHead = el('div', { class: 'fm-list-head' });
    const listEl = el('div', { class: 'fm-list' });
    listPane.append(listHead, listEl);

    const treeDivider = el('div', { class: 'fm-divider-v' });
    const main = el('div', { class: 'fm-main' });
    main.append(treePane, treeDivider, listPane);

    const statusBar = el('div', { class: 'fm-status' });
    const statusPath = el('span', { class: 'fm-status-path' }, '');
    const statusMsg = el('span', { class: 'fm-status-msg' }, '');
    const progress = el('div', { class: 'fm-progress hidden' });
    const progressFill = el('div', { class: 'fm-progress-fill' });
    progress.append(progressFill);
    statusBar.append(statusPath, progress, statusMsg);

    const wrap = el('div', { class: 'fm-wrap' });
    wrap.append(main, statusBar);
    root.appendChild(wrap);

    /* path row: [popout][refresh][home][cd][input]
       分离为独立窗口（仅内嵌面板）放刷新左侧，cd 到目录（仅内嵌面板）放 home 右侧 —— 四个图标排成一排。 */
    const popBtn = onPopOut
      ? el('button', { class: 'icon-btn fm-path-btn', type: 'button', 'data-tip': i18n.t('filesUi.popOut') })
      : null;
    if (popBtn) {
      popBtn.innerHTML = Icons.external(14);
      popBtn.addEventListener('click', () => onPopOut(state.target));
    }
    const refreshBtn = el('button', { class: 'icon-btn fm-path-btn', type: 'button', 'data-tip': i18n.t('filesUi.refresh') });
    refreshBtn.innerHTML = Icons.refresh(14);
    const homeBtn = el('button', { class: 'icon-btn fm-path-btn', type: 'button', 'data-tip': i18n.t('filesUi.home') });
    homeBtn.innerHTML = Icons.home(14);
    const cdBtn = onCd
      ? el('button', { class: 'icon-btn fm-path-btn', type: 'button', 'data-tip': i18n.t('filesUi.cdHere') })
      : null;
    if (cdBtn) {
      cdBtn.innerHTML = Icons.terminal(14);
      cdBtn.addEventListener('click', () => {
        if (state.connected && state.cwd) {
          recordCd(state.cwd);
          onCd(state.cwd);
        }
      });
    }
    const pathInput = el('input', { class: 'fm-path-input', type: 'text', spellcheck: 'false', autocomplete: 'off', placeholder: i18n.t('filesUi.pathPlaceholder') });
    for (const btn of [popBtn, refreshBtn, homeBtn, cdBtn]) {
      if (btn) pathRow.appendChild(btn);
    }
    pathRow.appendChild(pathInput);
    /* list head cells */
    function headCell(label, cls, resizeKey) {
      const cell = el('div', { class: `fm-head-cell ${cls}` }, label || '');
      if (resizeKey) {
        const handle = el('div', { class: 'fm-col-resize' });
        handle.addEventListener('mousedown', (event) => startColResize(event, resizeKey));
        cell.appendChild(handle);
      }
      return cell;
    }

    // 时间列表头 = 只有「时间」标签（上传已在目录树节点右键菜单，分离按钮已移到路径行）。
    const timeCell = el('div', { class: 'fm-head-cell fm-head-time' });
    timeCell.append(el('span', { class: 'fm-head-time-label' }, i18n.t('filesUi.time')));
    const timeResize = el('div', { class: 'fm-col-resize' });
    timeResize.addEventListener('mousedown', (event) => startColResize(event, 'time'));
    timeCell.appendChild(timeResize);

    listHead.append(
      el('div', { class: 'fm-head-cell fm-head-icon' }, ''),
      headCell(i18n.t('filesUi.name'), 'fm-head-name', 'name'),
      headCell(i18n.t('filesUi.size'), 'fm-head-size', 'size'),
      headCell(i18n.t('filesUi.perm'), 'fm-head-perm', 'perm'),
      timeCell
    );

    function applyLayout() {
      treePane.style.width = `${layoutData.treeWidth}px`;
      listPane.style.setProperty('--fm-name', `${layoutData.name}px`);
      listPane.style.setProperty('--fm-size', `${layoutData.size}px`);
      listPane.style.setProperty('--fm-time', `${layoutData.time}px`);
      listPane.style.setProperty('--fm-perm', `${layoutData.perm}px`);
    }
    applyLayout();

    /* ---------------------------- status helpers -------------------------- */
    let statusTimer = null;
    function clearStatusTimer() {
      if (statusTimer) {
        clearTimeout(statusTimer);
        statusTimer = null;
      }
    }
    /* 状态栏日志：同时写渲染层控制台与主进程（控制台 + 当天文件日志）。
       仅在渲染进程无 window.ships.log（如独立测试）时降级为仅 console。 */
    function writeLog(text) {
      try {
        console.log(text);
      } catch (err) {
        /* ignore */
      }
      try {
        if (window.ships && typeof window.ships.log === 'function') window.ships.log(text);
      } catch (err) {
        /* ignore */
      }
    }
    /* 所有状态栏提示：保留 STATUS_TTL_MS 后惰性清除（下一次设置会重置计时），
       并同步写控制台日志与文件日志。 */
    function setStatus(message, isError) {
      clearStatusTimer();
      const text = message || '';
      statusMsg.textContent = text;
      statusMsg.style.color = isError ? 'var(--color-danger)' : '';
      if (text) {
        writeLog(`[file-manager] ${text}`);
        statusTimer = setTimeout(() => {
          statusTimer = null;
          statusMsg.textContent = '';
          statusMsg.style.color = '';
        }, STATUS_TTL_MS);
      }
    }
    function setStatusPath(path) {
      statusPath.textContent = path || '';
    }
    function setProgress(value) {
      if (value == null) {
        state.progress = null;
        progress.classList.add('hidden');
        progressFill.style.width = '0%';
        return;
      }
      state.progress = value;
      progress.classList.remove('hidden');
      const percent = value.total ? clamp((value.transferred / value.total) * 100, 0, 100) : 0;
      progressFill.style.width = `${percent.toFixed(0)}%`;
    }
    function errorText(result) {
      const key = ERROR_KEYS[result && result.code];
      if (key) return i18n.t(key);
      const detail = result && result.error ? String(result.error) : '';
      return i18n.t('filesUi.connectFailed', { error: detail || 'error' });
    }

    /* -------------------------------- tree -------------------------------- */
    function ensureChildren(path) {
      if (state.children.has(path)) return Promise.resolve(state.children.get(path));
      return window.ships.sftp
        .list(state.id, path)
        .then((result) => {
          const dirs = result && result.ok
            ? result.entries
                .filter((entry) => entry.type === 'dir')
                .map((entry) => ({ name: entry.name, path: joinPath(path, entry.name) }))
            : [];
          state.children.set(path, dirs);
          return dirs;
        })
        .catch(() => {
          state.children.set(path, []);
          return [];
        });
    }

    function makeTreeRow(name, path, depth) {
      const expanded = state.expanded.has(path);
      const row = el('div', { class: 'fm-tree-row', style: `padding-left:${6 + depth * 14}px` });
      const caret = el('span', { class: `fm-tree-caret${expanded ? ' open' : ''}` });
      caret.innerHTML = Icons.caretRight(11);
      caret.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleExpand(path);
      });
      const icon = el('span', { class: 'fm-tree-icon' });
      icon.innerHTML = Icons.folder(13);
      const label = el('span', { class: 'fm-tree-label' }, '');
      label.textContent = name;
      row.append(caret, icon, label);
      row.addEventListener('click', () => navigate(path));
      // 目录节点也支持右键「复制传输命令」（目录 → scp -r）。
      row.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        state.selected = path;
        setStatusPath(path);
        renderTree();
        openContextMenu(event.clientX, event.clientY, [
          { label: i18n.t('filesUi.upload'), run: () => chooseAndUpload(path) },
          { label: i18n.t('filesUi.copyPath'), run: () => copyPath(path) },
          { label: i18n.t('filesUi.copyTransfer'), run: () => copyTransferCommand(path, true) },
        ]);
      });
      if (state.cwd === path) row.classList.add('selected');
      return row;
    }

    function renderTree() {
      treeEl.innerHTML = '';
      const render = (name, path, depth) => {
        treeEl.appendChild(makeTreeRow(name, path, depth));
        if (!state.expanded.has(path)) return;
        const kids = state.children.get(path);
        if (!kids) {
          treeEl.appendChild(el('div', { class: 'fm-tree-hint', style: `padding-left:${20 + depth * 14}px` }, i18n.t('filesUi.loading')));
          return;
        }
        for (const child of kids) render(child.name, child.path, depth + 1);
      };
      render('/', '/', 0);
    }

    function scrollTreeToSelected() {
      const node = treeEl.querySelector('.fm-tree-row.selected');
      if (!node) return;
      // 直接把目录树的滚动容器滚到刚好露出选中节点（比 scrollIntoView 更可控）。
      const treeRect = treeEl.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();
      if (nodeRect.top < treeRect.top) {
        treeEl.scrollTop -= treeRect.top - nodeRect.top + 8;
      } else if (nodeRect.bottom > treeRect.bottom) {
        treeEl.scrollTop += nodeRect.bottom - treeRect.bottom + 8;
      }
    }

    function toggleExpand(path) {
      if (state.expanded.has(path)) {
        state.expanded.delete(path);
        renderTree();
        return;
      }
      state.expanded.add(path);
      renderTree();
      if (!state.children.has(path)) {
        ensureChildren(path).then(() => {
          if (state.expanded.has(path)) renderTree();
        });
      }
    }

    function expandTo(path) {
      const parts = String(path || '/').split('/').filter(Boolean);
      state.expanded.add('/');
      let cur = '/';
      const walk = (index) => {
        if (index >= parts.length) return Promise.resolve();
        cur = cur === '/' ? `/${parts[index]}` : `${cur}/${parts[index]}`;
        return ensureChildren(cur).then(() => {
          state.expanded.add(cur);
          return walk(index + 1);
        });
      };
      return ensureChildren('/')
        .then(() => walk(0))
        .then(() => renderTree());
    }

    /* -------------------------------- list -------------------------------- */
    function renderList() {
      listEl.innerHTML = '';
      const files = state.entries;
      if (state.busy && !files.length) {
        listEl.appendChild(el('div', { class: 'fm-list-hint' }, i18n.t('filesUi.loading')));
        return;
      }
      if (!files.length) {
        listEl.appendChild(el('div', { class: 'fm-list-hint' }, i18n.t('filesUi.empty')));
        return;
      }
      for (const entry of files) {
        const path = joinPath(state.cwd, entry.name);
        const row = el('div', { class: 'fm-row' });
        if (state.selected === path) row.classList.add('selected');
        const icon = el('span', { class: 'fm-cell-icon' });
        icon.innerHTML = (Icons[iconFor(entry.name)] || Icons.file)(13);
        const name = el('span', { class: 'fm-cell-name' }, '');
        name.textContent = entry.name;
        const size = el('span', { class: 'fm-cell-size' }, formatSize(entry.size));
        const time = el('span', { class: 'fm-cell-time' }, formatTime(entry.mtime));
        const perm = el('span', { class: 'fm-cell-perm' }, formatMode(entry.mode, entry.type));
        row.append(icon, name, size, perm, time);
        row.addEventListener('click', () => {
          state.selected = path;
          setStatusPath(path);
          renderList();
          // 点文件时把左侧目录树滚动定位到它所在的目录节点。
          scrollTreeToSelected();
        });
        // 双击：小体积文本文件用 VS Code 打开；大文件 / 图片 / PDF / Word 等非文本用系统默认程序打开。
        row.addEventListener('dblclick', () => {
          if (prefersNativeOpen(entry)) openFile(path, entry.name);
          else openWithVSCode(path, entry.name);
        });
        row.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          state.selected = path;
          setStatusPath(path);
          renderList();
          scrollTreeToSelected();
          openContextMenu(event.clientX, event.clientY, [
            { label: i18n.t('filesUi.open'), run: () => openFile(path, entry.name) },
            { label: i18n.t('filesUi.openVSCode'), run: () => openWithVSCode(path, entry.name) },
            { label: i18n.t('filesUi.download'), run: () => downloadFile(path, entry.name) },
            { label: i18n.t('filesUi.copyPath'), run: () => copyPath(path) },
            { label: i18n.t('filesUi.copyTransfer'), run: () => copyTransferCommand(path, false) },
          ]);
        });
        listEl.appendChild(row);
      }
    }

    /* ------------------------------ navigation ---------------------------- */
    async function loadList(path, quiet) {
      if (!state.connected) return false;
      state.busy = true;
      renderList();
      let result = null;
      try {
        result = await window.ships.sftp.list(state.id, path);
      } catch (err) {
        result = { ok: false, code: 'connect', error: err.message };
      }
      state.busy = false;
      if (!result || !result.ok) {
        if (!quiet) setStatus(errorText(result), true);
        renderList();
        return false;
      }
      state.cwd = result.path;
      state.home = result.home || state.home;
      state.entries = result.entries.filter((entry) => entry.type !== 'dir');
      state.selected = '';
      pathInput.value = result.path;
      setStatusPath(result.path);
      renderTree();
      renderList();
      scrollTreeToSelected();
      return true;
    }

    function navigate(path, quiet) {
      if (!state.connected) return Promise.resolve(false);
      state.expanded.add(path);
      if (!state.children.has(path)) {
        ensureChildren(path).then(() => {
          if (state.expanded.has(path)) renderTree();
        });
      }
      return loadList(path, quiet);
    }

    /* 终端里输入 `cd <arg>` 且成功时跟随：把参数解析成远端绝对路径后导航。
       相对路径按「终端 shell 的当前目录」（shellCwd）解析，而不是文件面板自己浏览到的目录 ——
       两者可能因为手动浏览而分叉；shellCwd 初始 = 家目录，每次 cd 成功后同步。
       目标不存在时静默保持当前目录（见 navigate 的 quiet）。 */
    async function followCd(raw) {
      if (!state.connected) {
        state.pendingCd = raw; // 连接还没就绪：先记下，连上后再跟随
        return;
      }
      const base = state.shellCwd || state.home;
      const target = resolveCd(raw, base, state.home);
      if (!target) return;
      const ok = await navigate(target, true);
      if (ok) {
        state.shellCwd = state.cwd;
        recordCd(state.cwd);
        // 展开该路径的所有上级，让目标目录节点出现在树里，再滚动定位过去。
        await expandTo(state.cwd);
        scrollTreeToSelected();
      }
    }

    /* 记录「cd 历史」（按 ssh 目标关联，见 cd-history-service）：仅记录 via cd 到达的目录。 */
    function recordCd(path) {
      if (!state.connected || !path) return;
      window.ships.sftp.cdHistory.add(state.id, path).catch(() => {});
    }

    /* ------------------------------- actions ------------------------------ */
    /* 右键「复制路径」：把远端绝对路径写入系统剪贴板，状态栏回显。 */
    async function copyPath(path) {
      if (!state.connected || !path) return;
      const result = await window.ships.sftp.copyPath(path);
      if (result && result.ok) setStatus(i18n.t('filesUi.copiedPath', { path }));
      else setStatus(i18n.t('filesUi.copyFailed'), true);
    }

    /* 右键「复制传输命令」：按会话连接信息生成 scp 命令并复制到剪贴板，状态栏回显。 */
    async function copyTransferCommand(path, recursive) {
      if (!state.connected || !path) return;
      const result = await window.ships.sftp.transferCommand(state.id, path, Boolean(recursive));
      if (result && result.ok) setStatus(i18n.t('filesUi.copiedCommand', { command: result.command }));
      else setStatus(i18n.t('filesUi.copyFailed'), true);
    }

    async function downloadFile(path, name) {
      setProgress({ name, transferred: 0, total: 0, direction: 'download' });
      setStatus(i18n.t('filesUi.downloading', { name }), false);
      const result = await window.ships.sftp.download(state.id, path);
      setProgress(null);
      if (result && result.ok) setStatus(i18n.t('filesUi.downloaded', { path: result.path }));
      else setStatus(i18n.t('filesUi.downloadFailed', { error: (result && result.error) || 'error' }), true);
    }

    /* 右键「打开」：先下载到下载目录，完成后由主进程在系统文件管理器中定位该文件。 */
    async function openFile(path, name) {
      setProgress({ name, transferred: 0, total: 0, direction: 'download' });
      setStatus(i18n.t('filesUi.downloading', { name }), false);
      const result = await window.ships.sftp.open(state.id, path);
      setProgress(null);
      if (result && result.ok) setStatus(i18n.t('filesUi.opened', { path: result.path }));
      else setStatus(i18n.t('filesUi.downloadFailed', { error: (result && result.error) || 'error' }), true);
    }

    /* 右键「用 VS Code 打开」：先下载，完成后由主进程用 VS Code 打开该文件。 */
    async function openWithVSCode(path, name) {
      setProgress({ name, transferred: 0, total: 0, direction: 'download' });
      setStatus(i18n.t('filesUi.downloading', { name }), false);
      const result = await window.ships.sftp.openVSCode(state.id, path);
      setProgress(null);
      if (result && result.ok) setStatus(i18n.t('filesUi.openedVSCode', { path: result.path }));
      else setStatus(i18n.t('filesUi.downloadFailed', { error: (result && result.error) || 'error' }), true);
    }

    /* 上传一组本地路径（拖拽 / 目录右键「上传」共用）；逐个上传并更新进度。 */
    async function uploadLocalPaths(paths, targetDir) {
      if (!state.connected || !paths || !paths.length) return;
      const dir = targetDir || state.cwd;
      for (const localPath of paths) {
        const name = String(localPath).split('/').pop() || localPath;
        setStatus(i18n.t('filesUi.uploading', { name }), false);
        setProgress({ name, transferred: 0, total: 0, direction: 'upload' });
        const result = await window.ships.sftp.upload(state.id, localPath, dir);
        setProgress(null);
        if (result && result.ok) setStatus(i18n.t('filesUi.uploaded', { name: result.name }));
        else setStatus(i18n.t('filesUi.uploadFailed', { error: (result && result.error) || 'error' }), true);
      }
      loadList(state.cwd);
    }

    async function uploadFiles(fileList) {
      const paths = [];
      for (const file of fileList) {
        const localPath = window.ships.getPathForFile(file);
        if (localPath) paths.push(localPath);
      }
      uploadLocalPaths(paths);
    }

    /* 目录树节点右键「上传」：打开系统文件选择窗口，选中后上传到该目录。 */
    async function chooseAndUpload(targetDir) {
      if (!state.connected) return;
      const result = await window.ships.openFiles();
      if (result && result.paths && result.paths.length) uploadLocalPaths(result.paths, targetDir);
    }

    async function connect() {
      if (!state.target || state.connected || state.connecting) return;
      state.connecting = true;
      setStatus(i18n.t('filesUi.connecting'), false);
      let result = null;
      try {
        result = await window.ships.sftp.connect(state.target);
      } catch (err) {
        result = { ok: false, code: 'connect', error: err.message };
      }
      state.connecting = false;
      if (!result || !result.ok) {
        setStatus(errorText(result), true);
        return;
      }
      state.id = result.id;
      state.connected = true;
      state.home = result.home || '/';
      state.shellCwd = state.home;
      state.children = new Map();
      state.expanded = new Set();
      state.entries = [];
      state.cwd = state.home;
      state.selected = '';
      setStatus(i18n.t('filesUi.connected', { target: state.target }), false);
      setStatusPath(state.home);
      pathInput.value = state.home;
      await expandTo(state.home);
      await loadList(state.home);
      if (state.pendingCd != null) {
        const raw = state.pendingCd;
        state.pendingCd = null;
        followCd(raw);
      }
    }

    function resetConnection() {
      closeHistoryMenu();
      if (state.id) window.ships.sftp.close(state.id);
      state.id = '';
      state.connecting = false;
      state.connected = false;
      state.home = '';
      state.cwd = '';
      state.shellCwd = '';
      state.pendingCd = null;
      state.entries = [];
      state.selected = '';
      state.expanded = new Set();
      state.children = new Map();
      treeEl.innerHTML = '';
      listEl.innerHTML = '';
      setProgress(null);
      setStatusPath('');
      setStatus('');
    }

    /* ---------------------------- resizing -------------------------------- */
    function startColResize(event, key) {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = layoutData[key];
      const onMove = (moveEvent) => {
        layoutData[key] = clamp(startWidth + (moveEvent.clientX - startX), MIN_COL, 900);
        applyLayout();
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        onLayout({ [key]: layoutData[key] });
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }

    treeDivider.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = layoutData.treeWidth;
      const onMove = (moveEvent) => {
        layoutData.treeWidth = clamp(startWidth + (moveEvent.clientX - startX), MIN_TREE, 1200);
        applyLayout();
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        onLayout({ treeWidth: layoutData.treeWidth });
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });

    /* ------------------------------ listeners ----------------------------- */
    homeBtn.addEventListener('click', () => {
      if (state.home) navigate(state.home);
    });
    refreshBtn.addEventListener('click', () => {
      // 刷新即清掉「已上传 / 已下载」等状态信息（需求：出现刷新就隐藏）。
      setStatus('');
      if (!state.connected) return;
      state.children.delete(state.cwd);
      ensureChildren(state.cwd).then(() => renderTree());
      loadList(state.cwd);
    });
    pathInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        const value = pathInput.value.trim();
        if (value) navigate(value);
      } else if (event.key === 'Escape') {
        event.stopPropagation();
        pathInput.value = state.cwd;
        pathInput.blur();
      }
    });

    listEl.addEventListener('dragover', (event) => {
      if (!state.connected) return;
      event.preventDefault();
      listEl.classList.add('drag-over');
    });
    listEl.addEventListener('dragleave', () => listEl.classList.remove('drag-over'));
    listEl.addEventListener('drop', (event) => {
      event.preventDefault();
      listEl.classList.remove('drag-over');
      if (!state.connected) return;
      const files = Array.from(event.dataTransfer.files || []);
      if (files.length) uploadFiles(files);
    });

    /* 右键菜单：文件行右键 → 下载（不再有行内下载按钮）。 */
    let contextMenu = null;
    function closeContextMenu() {
      if (!contextMenu) return;
      contextMenu.remove();
      contextMenu = null;
    }
    function openContextMenu(x, y, items) {
      closeContextMenu();
      const menu = el('div', { class: 'fm-menu' });
      for (const item of items) {
        const btn = el('button', { class: 'fm-menu-item', type: 'button' }, item.label);
        btn.addEventListener('click', () => {
          closeContextMenu();
          item.run();
        });
        menu.appendChild(btn);
      }
      document.body.appendChild(menu);
      const rect = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - rect.width - 4))}px`;
      menu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - rect.height - 4))}px`;
      contextMenu = menu;
    }
    const onDocDown = (event) => {
      if (contextMenu && !contextMenu.contains(event.target)) closeContextMenu();
      if (historyMenu && !historyMenu.contains(event.target)) closeHistoryMenu();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeContextMenu();
    };
    document.addEventListener('mousedown', onDocDown, true);
    window.addEventListener('keydown', onKeyDown, true);

    /* cd 历史下拉：点路径输入框时列出该 ssh 目标最近 cd 到的目录（用户名@主机 关联）。
       点条目 → 文件浏览器与终端（ssh）同时前往该目录。 */
    let historyMenu = null;
    function closeHistoryMenu() {
      if (historyMenu) {
        historyMenu.remove();
        historyMenu = null;
      }
    }
    function goToHistory(dir) {
      navigate(dir).then((ok) => {
        if (!ok) return;
        state.shellCwd = state.cwd;
        recordCd(dir);
        if (onCd) onCd(dir);
      });
    }
    function openHistoryMenu() {
      if (!state.connected) return;
      window.ships.sftp.cdHistory.list(state.id).then((result) => {
        if (!result || !result.ok || !Array.isArray(result.entries) || !result.entries.length) return;
        if (document.activeElement !== pathInput) return;
        closeHistoryMenu();
        const menu = el('div', { class: 'fm-menu fm-history-menu' });
        menu.appendChild(el('div', { class: 'fm-menu-title' }, i18n.t('filesUi.cdHistory')));
        for (const dir of result.entries) {
          const item = el('button', { class: 'fm-menu-item', type: 'button' });
          item.textContent = dir;
          // 保持输入框焦点，避免 blur 抢在 click 之前关掉菜单。
          item.addEventListener('mousedown', (event) => event.preventDefault());
          item.addEventListener('click', () => {
            closeHistoryMenu();
            goToHistory(dir);
          });
          menu.appendChild(item);
        }
        document.body.appendChild(menu);
        const rect = pathInput.getBoundingClientRect();
        menu.style.minWidth = `${Math.max(180, rect.width)}px`;
        menu.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 4))}px`;
        const below = rect.bottom + 4;
        menu.style.top =
          below + menu.offsetHeight > window.innerHeight - 4
            ? `${Math.max(4, rect.top - menu.offsetHeight - 4)}px`
            : `${below}px`;
        historyMenu = menu;
      });
    }
    pathInput.addEventListener('focus', openHistoryMenu);
    pathInput.addEventListener('input', closeHistoryMenu);

    const offProgress = window.ships.sftp.onProgress((payload) => {
      if (!payload || payload.id !== state.id) return;
      setProgress(payload);
    });

    /* ------------------------------- public ------------------------------- */
    function setTarget(target) {
      const next = String(target || '');
      if (next === state.target) return;
      state.target = next;
      resetConnection();
      if (state.active && state.target) connect();
    }

    function activate() {
      state.active = true;
      if (state.target && !state.connected && !state.connecting) connect();
    }

    function destroy() {
      if (offProgress) offProgress();
      closeContextMenu();
      closeHistoryMenu();
      clearStatusTimer();
      document.removeEventListener('mousedown', onDocDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
      resetConnection();
      root.innerHTML = '';
    }

    if (state.active && state.target) connect();

    function setLayout(patch) {
      Object.assign(layoutData, patch || {});
      applyLayout();
    }

    return { element: wrap, setTarget, activate, setLayout, followCd, destroy, isConnected: () => state.connected };
  }

  window.ShipsFileManager = { create, DEFAULT_LAYOUT, _joinPath: joinPath };
})();
