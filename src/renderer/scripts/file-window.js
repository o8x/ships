'use strict';

/* Detached file-manager window: always-on-top panel with an SSH picker to switch the
   connection (independent of the terminal window), plus the shared file manager. */

(function bootstrapFileWindow() {
  const { Icons } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      fileWin: {
        sshPlaceholder: 'SSH',
        listFailed: '读取主机失败',
      },
    },
    en: {
      fileWin: {
        sshPlaceholder: 'SSH',
        listFailed: 'Cannot read hosts',
      },
    },
  });

  // 独立文件窗口字号最小值 13px：终端字体更小时不再跟随（需求）。
  const FONT_DEFAULT = 13;
  const FONT_MIN = 13;
  const FONT_MAX = 24;

  const lightClose = document.getElementById('light-close');
  const lightMinimize = document.getElementById('light-minimize');
  const lightZoom = document.getElementById('light-zoom');
  const actions = document.getElementById('file-actions');
  const rootEl = document.getElementById('file-root');

  let fontSize = FONT_DEFAULT;
  let manager = null;
  let picker = null;
  let currentTarget = '';

  function applyFontSize(value) {
    fontSize = Math.max(FONT_MIN, Math.min(FONT_MAX, value));
    document.documentElement.style.setProperty('--file-font-size', `${fontSize}px`);
  }

  function zoomFont(direction) {
    if (direction === 'reset') fontSize = FONT_DEFAULT;
    else fontSize = Math.max(FONT_MIN, Math.min(FONT_MAX, fontSize + (direction === 'in' ? 1 : -1)));
    applyFontSize(fontSize);
  }

  function renderHeader() {
    lightClose.innerHTML = Icons.trafficClose(6);
    lightMinimize.innerHTML = Icons.trafficMinimize(6);
    lightZoom.innerHTML = Icons.trafficZoom(6);
  }

  function syncWindowFocus() {
    document.documentElement.dataset.windowFocus = document.hasFocus() ? 'on' : 'off';
  }

  async function refreshPicker() {
    if (!picker) return;
    let hosts = [];
    try {
      const result = await window.ships.ssh.list();
      hosts = (result && result.hosts) || [];
    } catch (err) {
      hosts = [];
    }
    const options = [{ value: '', label: i18n.t('fileWin.sshPlaceholder') }];
    for (const host of hosts) {
      const address = host.user ? `${host.user}@${host.hostName}` : String(host.hostName || host.alias || '');
      options.push({ value: host.alias, label: address });
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
      options: [{ value: '', label: i18n.t('fileWin.sshPlaceholder') }],
      value: '',
      align: 'right',
      className: 'select-compact shrink-0',
      onChange: (alias) => setTarget(alias),
    });
    actions.insertBefore(picker.el, actions.firstChild);
  }

  async function boot() {
    const [settings, info] = await Promise.all([window.ships.getSettings(), window.ships.fileWindow.info()]);
    i18n.setLocale((settings && settings.locale) || 'zh');
    window.ShipsTheme.set(settings || {});
    renderHeader();
    fontSize = Math.max(FONT_MIN, Math.min(FONT_MAX, (settings && settings.terminalFontSize) || FONT_DEFAULT));
    applyFontSize(fontSize);
    setupPicker();
    currentTarget = (info && info.target) || '';
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

    window.ships.fileWindow.onTarget((target) => {
      setTarget(target);
    });
    window.ships.fileWindow.onZoom((direction) => zoomFont(direction));
    window.ships.onSettingsChanged((next) => {
      i18n.setLocale((next && next.locale) || 'zh');
      window.ShipsTheme.set(next || {});
      renderHeader();
      refreshPicker();
    });
  }

  lightClose.addEventListener('click', () => window.ships.windowControl('close'));
  lightMinimize.addEventListener('click', () => window.ships.windowControl('minimize'));
  lightZoom.addEventListener('click', () => window.ships.windowControl('zoom'));
  window.addEventListener('focus', syncWindowFocus);
  window.addEventListener('blur', syncWindowFocus);

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
      const fs = root ? parseFloat(getComputedStyle(root).fontSize) || 12 : 12;
      rowHeight = 1.95 * fs;
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
  syncWindowFocus();

  boot().catch((err) => console.error(err));
})();
