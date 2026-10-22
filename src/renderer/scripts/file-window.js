'use strict';

/* Detached file-manager window: always-on-top panel with an SSH picker to switch the
   connection (independent of the terminal window), plus the shared file manager. */

(function bootstrapFileWindow() {
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      fileWin: {
        sshPlaceholder: '连接到服务器',
        listFailed: '读取主机失败',
        ungrouped: '未分组',
      },
    },
    en: {
      fileWin: {
        sshPlaceholder: 'Connect to server',
        listFailed: 'Cannot read hosts',
        ungrouped: 'Ungrouped',
      },
    },
  });

  // 独立文件窗口使用**原生标题栏 / 红绿灯**（见 window-manager），字号固定 15px，
  // 不再跟随终端设置，也不支持 Cmd +/- 缩放（字号变量见 styles/tailwind.css 的 body.file-window）。
  const actions = document.getElementById('file-actions');
  const rootEl = document.getElementById('file-root');

  let manager = null;
  let picker = null;
  let currentTarget = '';

  async function refreshPicker() {
    if (!picker) return;
    if (typeof picker.setPlaceholder === 'function') {
      picker.setPlaceholder(i18n.t('fileWin.sshPlaceholder'));
    }
    let hosts = [];
    try {
      const result = await window.ships.ssh.list();
      hosts = (result && result.hosts) || [];
    } catch (err) {
      hosts = [];
    }
    // 占位「SSH」不再作为可选项出现（仅未选择时显示在触发器上）。
    // 顺序：有分组的主机（按分组出现顺序）在前，未分组的主机排最后。
    const grouped = [];
    const byGroup = new Map();
    const ungrouped = [];
    for (const host of hosts) {
      const group = host.group || '';
      if (!group) {
        ungrouped.push(host);
        continue;
      }
      const key = group.toLowerCase();
      if (!byGroup.has(key)) {
        const section = { name: group, hosts: [] };
        byGroup.set(key, section);
        grouped.push(section);
      }
      byGroup.get(key).hosts.push(host);
    }
    const sections = grouped.length + (ungrouped.length ? 1 : 0);
    const showHeaders = sections > 1;
    const options = [];
    const pushHost = (host) => {
      const address = host.user ? `${host.user}@${host.hostName}` : String(host.hostName || host.alias || '');
      options.push({ value: host.alias, label: address });
    };
    for (const section of grouped) {
      if (showHeaders) options.push({ header: true, label: section.name });
      for (const host of section.hosts) pushHost(host);
    }
    if (ungrouped.length) {
      if (showHeaders) options.push({ header: true, label: i18n.t('fileWin.ungrouped') });
      for (const host of ungrouped) pushHost(host);
    }
    // 也允许当前目标不在 config 里（手动 ssh）时仍显示为一项。
    if (currentTarget && !options.some((option) => option.value === currentTarget)) {
      options.push({ value: currentTarget, label: currentTarget });
    }
    picker.setOptions(options);
    picker.setValue(currentTarget);
  }

  function setTarget(target) {
    currentTarget = String(target || '');
    if (manager) manager.setTarget(currentTarget);
    if (picker) picker.setValue(currentTarget);
  }

  function setupPicker() {
    if (!actions) return;
    picker = window.ShipsUI.createSelect({
      options: [],
      value: '',
      placeholder: i18n.t('fileWin.sshPlaceholder'),
      align: 'right',
      className: 'select-compact shrink-0',
      matchTrigger: true,
      onChange: (alias) => setTarget(alias),
    });
    actions.insertBefore(picker.el, actions.firstChild);
  }

  async function boot() {
    const [settings, info] = await Promise.all([window.ships.getSettings(), window.ships.fileWindow.info()]);
    i18n.setLocale((settings && settings.locale) || 'zh');
    window.ShipsTheme.set(settings || {});
    setupPicker();
    currentTarget = (info && info.target) || '';
    const startPath = (info && info.path) || '';
    await refreshPicker();

    const layout = await window.ships.filesLayout.get('window');
    manager = window.ShipsFileManager.create({
      root: rootEl,
      layout: layout || {},
      active: true,
      getTarget: () => currentTarget,
      onLayout: (patch) => window.ships.filesLayout.set('window', patch),
    });
    if (currentTarget) manager.setTarget(currentTarget);
    // 分离过来时带上当前目录：连上后进入该目录。
    if (startPath) manager.openPath(startPath);

    window.ships.fileWindow.onTarget((payload) => {
      const next = payload && typeof payload === 'object' ? payload : { target: payload };
      setTarget(next.target || '');
      if (next.path) manager.openPath(next.path);
    });
    window.ships.onSettingsChanged((next) => {
      i18n.setLocale((next && next.locale) || 'zh');
      window.ShipsTheme.set(next || {});
      refreshPicker();
    });
    // 设置页增删改 SSH 主机 / 分组后实时刷新下拉。
    window.ships.ssh.onConfigChanged(() => refreshPicker());
  }

  /* 拖拽窗口后把「文件列表区域」高度收到文件行的整数倍（行高随字号），
     松手（resize 停顿 200ms）时执行，避免底部露出半行。 */
  let snapTimer = null;
  function snapListHeight() {
    const listEl = document.querySelector('#file-root .fm-list');
    if (!listEl) return;
    const row = listEl.querySelector('.fm-row');
    let rowHeight = row ? row.getBoundingClientRect().height : 0;
    if (!rowHeight) {
      const root = document.getElementById('file-root');
      rowHeight = 32;
    }
    if (!rowHeight) return;
    const cs = getComputedStyle(listEl);
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const usable = listEl.clientHeight - padY;
    const leftover = usable - Math.floor(usable / rowHeight) * rowHeight;
    if (leftover <= 1 || leftover >= rowHeight - 1) return;
    const desired = Math.round(window.innerHeight - leftover);
    if (window.ships.fileWindow && typeof window.ships.fileWindow.snapSize === 'function') {
      window.ships.fileWindow.snapSize(desired);
    }
  }
  window.addEventListener('resize', () => {
    clearTimeout(snapTimer);
    snapTimer = setTimeout(snapListHeight, 200);
  });
  boot().catch((err) => console.error(err));
})();
