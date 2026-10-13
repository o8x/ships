'use strict';

/* Host for the file manager inside the terminal window: shows / hides the bottom
   panel, wires the terminal's current ssh target, and manages the draggable divider
   between the terminal and the panel (panel height persisted with the shared layout).
   The file UI itself lives in scripts/file-manager.js. The manager is created lazily
   the first time the panel is shown and destroyed when it is popped out. */

(function registerTerminalFiles() {
  const DEFAULT_PANEL_HEIGHT = 260;
  const MIN_PANEL_HEIGHT = 120;
  const MIN_TERM_HEIGHT = 80;
  // 首次打开（无本地布局记录）时的最小布局：终端 ≥300、文件管理 ≥200；目录树 220、文件列表 ≥400。
  const FIRST_TERM_HEIGHT = 300;
  const FIRST_PANEL_HEIGHT = 200;
  const FIRST_TREE_WIDTH = 220;
  const FIRST_LIST_WIDTH = 400;
  const CHROME_HEIGHT = 50; // 头栏 + 分隔线 + 状态栏的近似高度
  const DIVIDER_WIDTH = 6;

  function mount(options) {
    const opts = options || {};
    const onStateChange = typeof opts.onStateChange === 'function' ? opts.onStateChange : () => {};
    const onCd = typeof opts.onCd === 'function' ? opts.onCd : null;

    const panel = document.getElementById('file-panel');
    const divider = document.getElementById('term-divider');
    const rootEl = document.getElementById('file-panel-root');
    if (!panel || !divider || !rootEl || !window.ShipsFileManager) return null;

    let layout = { panelHeight: DEFAULT_PANEL_HEIGHT };
    let open = false;
    let enabled = false;
    let target = '';
    let manager = null;
    // null = 未知（布局还没读回来）；true/false = 本地是否已有调整记录。
    let hasRecord = null;

    function applyPanelHeight() {
      const value = Math.max(MIN_PANEL_HEIGHT, Number(layout.panelHeight) || DEFAULT_PANEL_HEIGHT);
      panel.style.height = `${value}px`;
    }

    /* 无本地记录时按最小布局（终端 ≥300 / 文件管理 ≥200、目录树 220 / 文件列表 ≥400）
       把本窗口「只放大不缩小」到够用：树宽 220 + 列表 400 + 分隔线 ≈ 626 宽，
       头栏 + 300 + 分隔线 + 200 + 状态栏 ≈ 550 高。 */
    function applyFirstRunLayout() {
      layout.treeWidth = FIRST_TREE_WIDTH;
      layout.panelHeight = FIRST_PANEL_HEIGHT;
      applyPanelHeight();
      if (manager) manager.setLayout({ treeWidth: FIRST_TREE_WIDTH, panelHeight: FIRST_PANEL_HEIGHT });
      const ensure = window.ships.terminal && window.ships.terminal.ensureSize;
      if (typeof ensure === 'function') {
        ensure({
          width: FIRST_TREE_WIDTH + FIRST_LIST_WIDTH + DIVIDER_WIDTH,
          height: CHROME_HEIGHT + FIRST_TERM_HEIGHT + FIRST_PANEL_HEIGHT,
        });
      }
    }

    window.ships.filesLayout.get('panel').then((data) => {
      hasRecord = Boolean(data && Object.keys(data).length);
      layout = Object.assign({ panelHeight: DEFAULT_PANEL_HEIGHT }, data || {});
      applyPanelHeight();
      if (manager) manager.setLayout(layout);
      if (!hasRecord && open) applyFirstRunLayout();
    });

    function ensureManager() {
      if (manager) return manager;
      manager = window.ShipsFileManager.create({
        root: rootEl,
        layout,
        // 主动连接：检测到 ssh 目标即建立 SFTP（面板可保持隐藏），这样终端里的 cd 能随时被跟随。
        active: true,
        onCd,
        onPopOut: (t) => {
          // 分离为独立窗口：关闭并销毁当前内嵌容器（含其 SFTP 连接），再开独立窗口。
          hide({ destroy: true });
          window.ships.fileWindow.open(t);
        },
        onLayout: (patch) => {
          Object.assign(layout, patch);
          window.ships.filesLayout.set('panel', patch);
          hasRecord = true; // 用户调整过 —— 之后不再套用首次的最小布局
          if (Object.prototype.hasOwnProperty.call(patch, 'panelHeight')) applyPanelHeight();
        },
      });
      if (target) manager.setTarget(target);
      return manager;
    }

    function destroyManager() {
      if (!manager) return;
      manager.destroy();
      manager = null;
    }

    function emitState() {
      onStateChange({ enabled, open, connecting: false });
    }

    function show() {
      open = true;
      panel.classList.remove('hidden');
      divider.classList.remove('hidden');
      ensureManager().activate();
      // 首次打开且没有本地调整记录：套用最小布局并把窗口放大到够用。
      if (hasRecord === false) applyFirstRunLayout();
      emitState();
    }

    function hide(opts2) {
      open = false;
      panel.classList.add('hidden');
      divider.classList.add('hidden');
      if (opts2 && opts2.destroy) destroyManager();
      emitState();
    }

    function toggle() {
      if (!enabled) return;
      if (open) hide();
      else show();
    }

    function setSshTarget(next) {
      const value = String(next || '');
      if (value === target) return;
      target = value;
      enabled = Boolean(value);
      if (!value) {
        hide({ destroy: true });
        return;
      }
      // 检测到 ssh 目标即创建并连接（面板保持隐藏），终端里的 cd 跟随因此始终有效。
      ensureManager().setTarget(value);
      emitState();
    }

    function followCd(raw) {
      // 面板哪怕暂时隐藏也保持连接，cd 跟随照常生效（下次展开即定位到该目录）。
      if (manager) manager.followCd(raw);
    }

    function closeConnection() {
      destroyManager();
    }

    /* divider drag: dragging up shrinks the terminal (panel grows) */
    divider.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const startY = event.clientY;
      const startHeight = Number(layout.panelHeight) || DEFAULT_PANEL_HEIGHT;
      const onMove = (moveEvent) => {
        const maxHeight = Math.max(MIN_PANEL_HEIGHT, window.innerHeight - MIN_TERM_HEIGHT);
        const next = Math.max(MIN_PANEL_HEIGHT, Math.min(maxHeight, startHeight - (moveEvent.clientY - startY)));
        layout.panelHeight = next;
        applyPanelHeight();
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.ships.filesLayout.set('panel', { panelHeight: layout.panelHeight });
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });

    applyPanelHeight();

    return {
      setSshTarget,
      toggle,
      followCd,
      closeConnection,
      isOpen: () => open,
    };
  }

  window.ShipsTerminalFiles = { mount };
})();
