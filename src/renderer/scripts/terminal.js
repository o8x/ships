'use strict';

/* Always-on-top terminal window: one real PTY session (default login shell) rendered
   by xterm.js, with iTerm handoff and buffer export in the header. */

(function bootstrapTerminalWindow() {
  const { Icons, el } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      terminalWin: {
        sshPlaceholder: '连接到服务器',
        sshFailed: '连接失败：{error}',
        ungrouped: '未分组',
        linesOn: '隐藏行号',
        linesOff: '显示行号',
        newWindow: '新建窗口',
        pinBallOn: '取消固定（失焦会缩成悬浮球）',
        pinBallOff: '固定：本窗口失焦不缩成悬浮球',
        failed: '无法启动终端会话：{error}',
        restarting: '正在重建终端会话…',
        noTerminal: 'xterm 未能加载，无法显示终端',
      },
    },
    en: {
      terminalWin: {
        sshPlaceholder: 'Connect to server',
        sshFailed: 'Connect failed: {error}',
        ungrouped: 'Ungrouped',
        linesOn: 'Hide line numbers',
        linesOff: 'Show line numbers',
        newWindow: 'New window',
        pinBallOn: 'Unpin (shrink to a ball when unfocused)',
        pinBallOff: 'Pin: keep this window open when it loses focus',
        failed: 'Cannot start the terminal session: {error}',
        restarting: 'Restarting terminal session…',
        noTerminal: 'xterm failed to load',
      },
    },
  });

  const ANSI = { meta: '\u001b[90m', error: '\u001b[31m', reset: '\u001b[0m' };

  const C = window.ShipsConstants || {};
  const FONT_DEFAULT = C.TERMINAL_FONT_DEFAULT || 14;
  const FONT_MIN = C.TERMINAL_FONT_MIN || 8;
  const FONT_MAX = C.TERMINAL_FONT_MAX || 64;
  const HEADER_FONT_MIN = C.TERMINAL_HEADER_FONT_MIN || 10;
  const HEADER_FONT_MAX = C.TERMINAL_HEADER_FONT_MAX || 20;
  const HEADER_HEIGHT_MIN = C.TERMINAL_HEADER_HEIGHT_MIN || 16;
  const HEADER_HEIGHT_MAX = C.TERMINAL_HEADER_HEIGHT_MAX || 32;

  /* xterm 挂在 #term-fit（无内边距）里，留白由外层 #term-host（上下 5px、左右 0）提供：FitAddon 用
     「父元素的 border box 高度」算行数，父元素带内边距会把可用高度多算一份内边距，
     于是一行被挤出可视区 —— 最后一行只露大半行，页面还会多出几像素可滚动高度
     （滚轮时标题跟着上下动）。父元素无内边距时测量值即真实可用区。 */
  const host = document.getElementById('term-fit');
  const hostBox = document.getElementById('term-host');
  const gutterEl = document.getElementById('term-gutter');
  const linesBtn = document.getElementById('btn-lines');
  const filesBtn = document.getElementById('btn-files');
  const itermBtn = document.getElementById('btn-iterm');
  const splitBtn = document.getElementById('btn-split');
  const lightClose = document.getElementById('light-close');
  const lightMinimize = document.getElementById('light-minimize');
  const lightZoom = document.getElementById('light-zoom');
  const sizeEl = document.getElementById('term-size');
  const shellEl = document.getElementById('term-shell');
  const ballEl = document.getElementById('term-ball');
  const ballIconEl = document.getElementById('term-ball-icon');
  const ballTrashEl = document.getElementById('term-ball-trash');
  const ballTimerHmEl = document.getElementById('term-ball-timer-hm');
  const ballTimerSEl = document.getElementById('term-ball-timer-s');
  const pinBtn = document.getElementById('term-pin');

  let term = null;
  let fit = null;
  let observer = null;
  let sessionId = '';
  let resizeTimer = null;
  let lastHostKey = '';
  let lastCols = 0;
  let lastRows = 0;
  let fontSize = FONT_DEFAULT;
  let settingsFontSize = FONT_DEFAULT;
  let settingsFontFamily = '';
  let fontBadge = null;
  let showLines = false; // 左侧行号（默认关闭）
  let shellPath = '';
  let sshPicker = null;
  let sizeBadgeTimer = null;
  let metricsTimer = null;
  let lastMetricsKey = '';
  // 主进程标记「正在拖动窗口」：期间一律不发对齐请求（中途改尺寸会打乱 macOS 拖拽跟踪）
  let dragSuspected = false;
  // 当前会话检测到的 SSH 原始目标（主进程每秒扫进程树得出）；空串 = 未连接 SSH。
  // 只用于启用文件按钮与连接文件面板，不在头栏显示（需求：隐藏头栏 ssh 信息）。
  let sshTarget = '';
  // 底部文件面板（SFTP）控制器
  let filesApi = null;
  // 悬浮球模式（失去焦点缩成圆形小窗；期间不 fit、不把尺寸同步给 PTY）
  let ballMode = false;
  let commandBusy = false;
  // 「固定」：开启后本窗口失焦不缩成悬浮球（仅当前窗口，默认关，不持久）
  let ballPinned = false;

  function themeColors() {
    // macOS-like overlay scrollbar (only a safety net: the scrollbar is hidden below)
    // 终端暗色模式开启时该窗口整体强制暗色（constants.css 覆盖主题变量），故这里也要算作 dark。
    const root = document.documentElement;
    const dark = root.dataset.terminalDark === 'on' || root.dataset.theme === 'dark';

    const css = getComputedStyle(document.documentElement);
    const read = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    return {
      background: read('--term-bg', dark ? '#0e1116' : '#ffffff'),
      foreground: read('--color-fg', '#1d1d1f'),
      cursor: read('--color-accent', '#2e6bfc'),
      selectionBackground: read('--color-fg-muted', '#8a8a8f'),
      scrollbarSliderBackground: dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.2)',
      scrollbarSliderHoverBackground: dark ? 'rgba(255,255,255,0.34)' : 'rgba(0,0,0,0.32)',
      scrollbarSliderActiveBackground: dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.42)',
    };
  }

  /* 按住 Command 时才识别终端里的 http(s) URL 与文件路径：显示下划线 / 手形；
     Cmd + 点击（非 macOS 为 Ctrl）URL 用默认浏览器打开，路径在 Finder 中定位。
     松开 Command 后不再提供链接（不显示下划线、不显示手形）。 */
  let metaHeld = false;
  let linkProvider = null;
  let linkProviderDisposable = null;
  let linkKeysBound = false;

  function refreshLinkProvider() {
    if (!term || typeof term.registerLinkProvider !== 'function' || !linkProvider) return;
    try {
      if (linkProviderDisposable) linkProviderDisposable.dispose();
    } catch (err) {
      /* ignore */
    }
    linkProviderDisposable = term.registerLinkProvider(linkProvider);
    try {
      term.refresh(0, term.rows - 1);
    } catch (err) {
      /* ignore */
    }
  }

  function bindLinkModifierKeys() {
    if (linkKeysBound) return;
    linkKeysBound = true;
    window.addEventListener('keydown', (event) => {
      if (event.key !== 'Meta' || metaHeld) return;
      metaHeld = true;
      refreshLinkProvider();
    });
    window.addEventListener('keyup', (event) => {
      if (event.key !== 'Meta' || !metaHeld) return;
      metaHeld = false;
      refreshLinkProvider();
    });
    window.addEventListener('blur', () => {
      if (!metaHeld) return;
      metaHeld = false;
      refreshLinkProvider();
    });
  }

  function registerUrlLinks() {
    if (!term || typeof term.registerLinkProvider !== 'function' || linkProvider) return;
    linkProvider = {
      provideLinks(bufferLineNumber, callback) {
        if (!metaHeld) {
          callback(undefined);
          return;
        }
        const line = term.buffer.active.getLine(bufferLineNumber - 1);
        if (!line) {
          callback(undefined);
          return;
        }
        const text = line.translateToString(true);
        const links = [];
        const urlRanges = [];

        const addLink = (startIndex, raw, kind) => {
          const value = raw.replace(/[.,;:!?)\]}'"]+$/, '');
          if (!value) return;
          const start = startIndex + 1;
          links.push({
            range: {
              start: { x: start, y: bufferLineNumber },
              end: { x: start + value.length - 1, y: bufferLineNumber },
            },
            text: value,
            decorations: { pointerCursor: true, underline: true },
            activate(event) {
              if (!(event.metaKey || event.ctrlKey)) return;
              if (kind === 'url') window.ships.openExternal(value);
              else window.ships.openPath(value);
            },
          });
        };

        const urlRe = /https?:\/\/[^\s"'<>]+/gi;
        let match;
        while ((match = urlRe.exec(text))) {
          const raw = match[0].replace(/[.,;:!?)\]}'"]+$/, '');
          if (!raw) continue;
          urlRanges.push([match.index, match.index + raw.length - 1]);
          addLink(match.index, raw, 'url');
        }

        // 绝对路径 / ~ 路径；排除 URL 内部、以及 "and/or" 这类非路径片段。
        const pathRe = /(?:~\/|\/(?!\/))[^\s"'<>|:]+/g;
        while ((match = pathRe.exec(text))) {
          const startIndex = match.index;
          if (urlRanges.some(([s, e]) => startIndex >= s && startIndex <= e)) continue;
          const prev = startIndex > 0 ? text[startIndex - 1] : '';
          if (prev && !/[\s("'`\[{:=<]/.test(prev)) continue;
          const raw = match[0].replace(/[.,;:!?)\]}'"]+$/, '');
          if (!raw || raw === '/' || raw === '~/') continue;
          addLink(startIndex, raw, 'path');
        }

        callback(links.length ? links : undefined);
      },
    };
    bindLinkModifierKeys();
    refreshLinkProvider();
  }

  function write(text) {
    if (term) term.write(text);
    scheduleGutter();
  }

  /* 左侧行号（默认关闭）：给可见的每一行编号（两位，不足补 0），随滚动 / 重绘更新。 */
  let gutterRaf = null;
  function renderGutter() {
    if (!gutterEl || !term) return;
    if (!showLines) {
      gutterEl.textContent = '';
      gutterEl.classList.add('hidden');
      return;
    }
    gutterEl.classList.remove('hidden');
    // 按「当前窗口」编号：第一行永远是 1（不随滚动变化）。
    gutterEl.textContent = '';
    for (let i = 0; i < term.rows; i += 1) {
      const number = String(i + 1).padStart(2, '0');
      gutterEl.appendChild(el('div', { class: 'term-gutter-line' }, number));
    }
  }

  function scheduleGutter() {
    if (gutterRaf) return;
    gutterRaf = requestAnimationFrame(() => {
      gutterRaf = null;
      renderGutter();
    });
  }

  /* 文件夹按钮随文件面板的状态变化：无 ssh 目标时禁用、连接中变暗、展开时高亮。 */
  function applyFilesState(state) {
    if (!filesBtn) return;
    filesBtn.disabled = !state.enabled;
    filesBtn.style.opacity = state.enabled ? '' : '0.4';
    filesBtn.style.color = state.open ? 'var(--color-accent)' : '';
    filesBtn.classList.toggle('loading', Boolean(state.connecting));
  }

  /* 在终端会话里执行 `cd <path>`（文件面板目录树右键「进入该目录」/ cd 历史共用）。 */
  function shellQuote(value) {
    const text = String(value || '');
    if (/^[A-Za-z0-9_@%+=:,./~-]+$/.test(text)) return text;
    return `'${text.replace(/'/g, `'\\''`)}'`;
  }

  function cdInTerminal(path) {
    if (!sessionId || !path) return;
    window.ships.terminal.input(sessionId, `cd ${shellQuote(path)}\r`);
    if (term) term.focus();
  }

  /* 跟踪用户在终端里输入的命令行：提交的命令若是纯 `cd …`，且文件面板已展开，
     就让它跟随到该目录（路径不存在时静默不变）。 */
  let typedLine = '';
  /* 读取 xterm 当前行「光标之前」的文本：既包含 shell 回显 / Tab 补全后的真实命令，
     又排除光标之后的自动建议（zsh autosuggestion 之类的灰色提示）。 */
  function currentLineText() {
    if (!term) return '';
    const buffer = term.buffer.active;
    const line = buffer.getLine(buffer.baseY + buffer.cursorY);
    if (!line) return '';
    return line.translateToString(false, 0, buffer.cursorX);
  }

  /* 去掉提示符，取出提示符之后的命令部分（最后一个 # / $ / % / > 之后）。 */
  function commandFromRendered(rendered) {
    const text = String(rendered || '');
    let index = -1;
    for (const marker of ['# ', '$ ', '% ', '> ']) {
      const at = text.lastIndexOf(marker);
      if (at > index) index = at;
    }
    return (index >= 0 ? text.slice(index + 2) : text).trim();
  }

  function submitLine(line) {
    // 以终端当前行（回显后的真实内容，含 Tab 补全）为准；解析不出再退回键入跟踪。
    const rendered = commandFromRendered(currentLineText());
    const candidate = /^\s*cd(?:\s|$)/.test(rendered) ? rendered : line;
    const match = /^\s*cd(?:\s+(.*))?\s*$/.exec(candidate || '');
    if (!match || !filesApi) return;
    filesApi.followCd(match[1] == null ? '' : match[1]);
  }
  function trackLine(data) {
    // 跳过 ANSI 转义序列（箭头 / 括号粘贴 \x1b[200~ 等），否则会污染命令行。
    for (let i = 0; i < data.length; i += 1) {
      const ch = data[i];
      if (ch === '\u001b') {
        i += 1;
        while (i < data.length && !/[A-Za-z~]/.test(data[i])) i += 1;
        continue;
      }
      if (ch === '\r' || ch === '\n') {
        submitLine(typedLine);
        typedLine = '';
      } else if (ch === '\u007f' || ch === '\b') {
        typedLine = typedLine.slice(0, -1);
      } else if (ch === '\u0003' || ch === '\u0015') {
        typedLine = '';
      } else if (ch >= ' ') {
        typedLine += ch;
      }
    }
  }

  /* Only tell the PTY about a real size change: a redundant resize makes the shell
     redraw and looks like the view jumping while scrolling. */
  function syncPtySize() {
    if (!term || !sessionId) return;
    if (term.cols === lastCols && term.rows === lastRows) return;
    lastCols = term.cols;
    lastRows = term.rows;
    window.ships.terminal.resize(sessionId, term.cols, term.rows);
  }

  function fitIfNeeded(force) {
    if (!fit || !term || !host || ballMode) return;
    const rect = host.getBoundingClientRect();
    const key = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
    if (!force && key === lastHostKey) return;
    lastHostKey = key;
    fit.fit();
    fitColumns();
    syncPtySize();
    snapExactSize();
    updateRowHeightVar();
    scheduleGutter();
    if (sizeEl && !sizeEl.classList.contains('hidden')) showSizeBadge();
  }

  /* 行号栏每行的高度 = 终端实测单元格高度（写 CSS 变量 --term-row-h）。 */
  function updateRowHeightVar() {
    const { height } = readCellSize();
    if (height) document.documentElement.style.setProperty('--term-row-h', `${height}px`);
  }

  /* 按实测余量对齐窗口高度：终端网格取整后底部会剩 leftover（0 ~ 行高-1）。
     拖动过程中不干预（下边框严格跟手），停手 150ms 后由这里把差额补掉，
     让最后一行紧贴窗口下边缘。余量 < 1px 时不动。 */
  /* 单元格尺寸：优先用 xterm 的渲染尺寸（css.cell，稳定、不随列数变化）；
     退化时才用「屏幕宽 / 列数」——后者会随列数取整而抖动，导致窗口反复微调。
     返回 CSS px 的 { width, height }。 */
  function readCellSize() {
    if (!term || !host) return { width: 0, height: 0 };
    const dims = term._core && term._core._renderService && term._core._renderService.dimensions;
    let width = dims && dims.css && dims.css.cell ? dims.css.cell.width : 0;
    let height = dims && dims.css && dims.css.cell ? dims.css.cell.height : 0;
    const rowsEl = host.querySelector('.xterm-rows');
    const firstRow = rowsEl && rowsEl.firstElementChild;
    if (!height && firstRow) height = firstRow.getBoundingClientRect().height;
    if (!width) {
      const screenEl = host.querySelector('.xterm-screen');
      width = screenEl && term.cols ? screenEl.getBoundingClientRect().width / term.cols : 0;
    }
    return { width, height };
  }

  /* FitAddon 只要 scrollback > 0 就固定预留 14px（给 overview ruler），会把终端挤得比
     窗口窄、右侧空出一条白边（我们本来就隐藏滚动条）。这里按真实可用宽度自己算列数。 */
  function fitColumns() {
    if (!term || !term.cols || !host) return;
    const { width: cellWidth } = readCellSize();
    if (!cellWidth) return;
    const cols = Math.max(2, Math.floor(host.clientWidth / cellWidth));
    if (cols !== term.cols) term.resize(cols, term.rows);
  }

  /* 把窗口内容尺寸对齐到「终端区 = 列宽×列数 / 行高×行数 + chrome」：
     - 余量为正（底部 / 右侧剩一条带）→ 收窗口；
     - 余量为负（最后一行 / 列被裁掉一点）→ 放窗口。
     chrome = 窗口内容尺寸 − 终端区尺寸（头栏 / 分隔线 / 文件面板 / 状态栏等固定部分）。 */
  function snapExactSize() {
    if (!term || !term.rows || !term.cols || !host) return;
    if (dragSuspected) return; // 拖动中：等松手（主进程会发 recalibrate）后再对齐
    const { width: cellWidth, height: cellHeight } = readCellSize();
    if (!cellHeight || !cellWidth) return;
    const chromeHeight = window.innerHeight - host.clientHeight;
    const chromeWidth = window.innerWidth - host.clientWidth;
    // 四舍五入到最近的整行 / 整列：余量超过半格就补一行 / 一列，否则收掉余量。
    const rowsTarget = Math.max(1, Math.round(host.clientHeight / cellHeight));
    const colsTarget = Math.max(1, Math.round(host.clientWidth / cellWidth));
    const targetHeight = Math.round(chromeHeight + rowsTarget * cellHeight);
    const targetWidth = Math.round(chromeWidth + colsTarget * cellWidth);
    const payload = {};
    // 变化需 ≥2px 才动，避免 1px 的取整抖动（cell 尺寸稳定后本不该抖，加个死区更保险）。
    if (Math.abs(targetHeight - window.innerHeight) >= 2) payload.height = targetHeight;
    if (Math.abs(targetWidth - window.innerWidth) >= 2) payload.width = targetWidth;
    if (!Object.keys(payload).length) return;
    const snap = window.ships && window.ships.terminal && window.ships.terminal.snapSize;
    if (typeof snap === 'function') snap(payload);
  }

  /* iTerm 式：拖动 / 缩放期间在头栏中间显示「列 × 行」，停手 700ms 后隐藏。
     刚调过字号时同时带上字号（Cmd +/- 的反馈）。 */
  function showBadge(text) {
    if (!sizeEl || !term) return;
    sizeEl.textContent = text;
    sizeEl.classList.remove('hidden');
    clearTimeout(sizeBadgeTimer);
    sizeBadgeTimer = setTimeout(() => sizeEl.classList.add('hidden'), 700);
  }

  function showSizeBadge() {
    if (!sizeEl || !term) return;
    const suffix = fontBadge && Date.now() < fontBadge.until ? ` · ${fontBadge.text}` : '';
    showBadge(`${term.cols}×${term.rows}${suffix}`);
  }

  function showFontBadge(value) {
    fontBadge = { text: `${value}px`, until: Date.now() + 900 };
    showBadge(fontBadge.text);
  }

  function applyFontSize(value) {
    if (!term) return;
    term.options.fontSize = value;
    applyHeaderFontSize(value);
    fitIfNeeded(true);
    syncPtySize();
  }

  /* 头栏字号跟随终端字号，但夹在 10–20px；高度按字号线性映射并夹在 20–32px
     （10px 字号 → 20px，20px 字号 → 32px）。文件面板文字 = 终端字号。 */
  function applyHeaderFontSize(value) {
    const headerFont = Math.max(HEADER_FONT_MIN, Math.min(HEADER_FONT_MAX, value));
    const headerHeight = Math.max(HEADER_HEIGHT_MIN, Math.min(HEADER_HEIGHT_MAX, Math.round(headerFont * 1.6)));
    document.documentElement.style.setProperty('--term-header-font-size', `${headerFont}px`);
    document.documentElement.style.setProperty('--term-header-height', `${headerHeight}px`);
    document.documentElement.style.setProperty('--file-font-size', `${value}px`);
  }

  function fontFamilyValue(family) {
    const mono = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() || 'monospace';
    const name = String(family || '').trim();
    return name ? `"${name.replace(/"/g, '\\"')}", ${mono}` : mono;
  }

  function applyFontFamily(family) {
    if (!term) return;
    const value = fontFamilyValue(family);
    term.options.fontFamily = value;
    document.documentElement.style.setProperty('--term-font-family', value);
    fitIfNeeded(true);
    syncPtySize();
  }

  /* 字号 / 字体来源是设置 → 终端（Cmd +/- 也写回设置，这里跟随）。
     只有设置里的值真的变化时才覆盖当前值，免得别的设置变更把临时缩放顶掉。 */
  function syncFontSizeSetting(next) {
    const wanted = Math.max(FONT_MIN, Math.min(FONT_MAX, (next && next.terminalFontSize) || FONT_DEFAULT));
    if (wanted !== settingsFontSize) {
      settingsFontSize = wanted;
      fontSize = wanted;
      applyFontSize(fontSize);
    }
    const wantedFamily = String((next && next.terminalFontFamily) || '');
    if (wantedFamily !== settingsFontFamily) {
      settingsFontFamily = wantedFamily;
      applyFontFamily(settingsFontFamily);
    }
  }

  /* Cmd +/+/-（menu.js / zoom-changed 路由到这里）：直接修改**设置里的字号**（写回 settings，
     持久化，重开终端也生效），不改页面缩放因子 —— 页面缩放固定为 1；头栏/图标随字号缩放。
     同时在头栏中间显示新字号。 */
  function zoomFont(direction) {
    let value;
    if (direction === 'reset') value = FONT_DEFAULT;
    else value = fontSize + (direction === 'in' ? 1 : -1);
    value = Math.max(FONT_MIN, Math.min(FONT_MAX, value));
    if (value === fontSize) return;
    showFontBadge(value);
    window.ships.setSettings({ terminalFontSize: value });
  }

  function scheduleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fitIfNeeded, 150);
  }

  /* 窗口尺寸变化时把「字体大小 / 行高 / 窗口大小」写到控制台与 vessel.log（节流 250ms）。 */
  function logWindowMetrics() {
    if (!term || !host) return;
    const { width: cellWidth, height: cellHeight } = readCellSize();
    const lineHeight = Math.round(cellHeight * 100) / 100;
    const colWidth = Math.round(cellWidth * 100) / 100;
    const message =
      `[term-metrics] font=${term.options.fontSize}px lineHeight=${lineHeight}px colWidth=${colWidth}px ` +
      `window=${window.outerWidth}x${window.outerHeight} content=${window.innerWidth}x${window.innerHeight} ` +
      `cols=${term.cols} rows=${term.rows}`;
    if (window.ships && typeof window.ships.log === 'function') window.ships.log(message);
  }

  /* 窗口尺寸变化：立刻标记「正在调整」抑制对齐，等停顿 300ms（= 松手）后重新 fit 并按
     「终端区 = 行高×行数 / 列宽×列数 + chrome」对齐，同时打印度量日志。
     不再依赖 will-resize / recalibrate（不同平台/版本不一定触发）。 */
  function onWindowResize() {
    if (ballMode) return;
    dragSuspected = true;
    clearTimeout(metricsTimer);
    metricsTimer = setTimeout(() => {
      dragSuspected = false;
      fitIfNeeded(true);
      logWindowMetrics();
    }, 120);
  }

  async function startSession() {
    if (!term || sessionId) return;
    const result = await window.ships.terminal.start(term.cols, term.rows, shellPath);
    if (!result || !result.ok) {
      write(`\r\n${ANSI.error}${i18n.t('terminalWin.failed', { error: (result && result.error) || 'error' })}${ANSI.reset}\r\n`);
      return;
    }
    sessionId = result.id;
    ballElapsedAccum = 0;
    syncBallClock();
    sshTarget = '';
    if (filesApi) filesApi.setSshTarget('');
    // the PTY was created with the current size: remember it so we do not resize again
    lastCols = term.cols;
    lastRows = term.rows;
  }

  /* 切换 SSH 前重建 shell：仅当当前已经处在 SSH 会话里（sshTarget 非空）时销毁当前
     PTY / shell 并重新创建一个登录 shell；仍停留在系统 shell 时保留原会话直接注入命令。 */
  async function restartSessionForSsh() {
    if (!term) return false;
    const oldId = sessionId;
    sessionId = '';
    sshTarget = '';
    if (filesApi) filesApi.setSshTarget('');
    if (oldId) {
      try {
        await window.ships.terminal.kill(oldId);
      } catch (err) {
        /* ignore */
      }
    }
    // 不清屏：保留原有输出，只提示一行灰色的重建信息。
    write(`\r\n${ANSI.meta}${i18n.t('terminalWin.restarting')}${ANSI.reset}\r\n`);
    await startSession();
    return Boolean(sessionId);
  }

  function renderHeader() {
    linesBtn.innerHTML = (showLines ? Icons.eyeOff : Icons.eye)(15);
    linesBtn.style.color = showLines ? 'var(--color-accent)' : '';
    linesBtn.setAttribute('data-tip', i18n.t(showLines ? 'terminalWin.linesOn' : 'terminalWin.linesOff'));
    filesBtn.innerHTML = Icons.folder(15);
    itermBtn.innerHTML = Icons.terminal(15);
    splitBtn.innerHTML = Icons.split(15);
    splitBtn.setAttribute('data-tip', i18n.t('terminalWin.newWindow'));
    if (pinBtn) {
      pinBtn.innerHTML = (ballPinned ? Icons.pin : Icons.pinOff)(15);
      pinBtn.style.color = ballPinned ? 'var(--color-accent)' : '';
      pinBtn.setAttribute('data-tip', i18n.t(ballPinned ? 'terminalWin.pinBallOn' : 'terminalWin.pinBallOff'));
    }
    // 自绘小红绿灯的符号（尺寸交给 CSS，见 #term-lights svg）
    lightClose.innerHTML = Icons.trafficClose(6);
    lightMinimize.innerHTML = Icons.trafficMinimize(6);
    lightZoom.innerHTML = Icons.trafficZoom(6);
  }

  /* 窗口失焦时红绿灯变灰（与系统观感一致） */
  function syncWindowFocus() {
    document.documentElement.dataset.windowFocus = document.hasFocus() ? 'on' : 'off';
  }

  /* ---------------------------- 头部 SSH 下拉 ----------------------------
     右侧图标区最左边：列出 ~/.ssh/config 的主机（用户名@主机地址），选中就在**当前终端**
     里执行 `ssh …`（注入到正在运行的 shell，不会重建终端 / 不新开窗口）。可以重复选同一台
     主机来重连 —— 每次选择都会重新执行。 */
  function setupSshPicker() {
    const actions = document.getElementById('term-actions');
    if (!actions) return null;

    const picker = window.ShipsUI.createSelect({
      options: [],
      value: '',
      placeholder: i18n.t('terminalWin.sshPlaceholder'),
      align: 'right',
      className: 'select-compact shrink-0',
      matchTrigger: true,
      onChange: (alias) => {
        void connectSshHost(alias);
      },
    });
    actions.insertBefore(picker.el, actions.firstChild);
    return picker;
  }

  async function connectSshHost(alias) {
    if (!alias) return;
    // 已在 SSH 会话中切换主机：先销毁当前 shell 并重建（旧 ssh 会话不残留、不会嵌套），
    // 新 shell 就绪后再执行 ssh。仍在系统 shell 时直接注入，不重建。
    if (sshTarget) {
      // startSession() 失败时已在终端里显示具体原因；此时不再执行 ssh。
      const ready = await restartSessionForSsh();
      if (!ready) return;
    }
    if (term) term.focus();
    const result = await window.ships.ssh.connect({ alias, inTerminal: true });
    if (!result || !result.ok) {
      write(`\r\n${ANSI.error}${i18n.t('terminalWin.sshFailed', { error: (result && result.error) || 'error' })}${ANSI.reset}\r\n`);
    }
    if (term) term.focus();
  }

  async function refreshSshPicker() {
    if (!sshPicker) return;
    if (typeof sshPicker.setPlaceholder === 'function') {
      sshPicker.setPlaceholder(i18n.t('terminalWin.sshPlaceholder'));
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
      if (showHeaders) options.push({ header: true, label: i18n.t('terminalWin.ungrouped') });
      for (const host of ungrouped) pushHost(host);
    }
    sshPicker.setOptions(options);
    if (!hosts.some((host) => host.alias === sshPicker.getValue())) sshPicker.setValue('');
    sshPicker.el.disabled = hosts.length === 0;
    sshPicker.el.style.opacity = hosts.length === 0 ? '0.5' : '';
  }

  function initTerminal(options) {
    const opts = options || {};
    if (!window.Terminal) {
      host.appendChild(el('div', { class: 'p-3 text-[12px] text-fg-muted' }, i18n.t('terminalWin.noTerminal')));
      return;
    }
    const mono = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim();
    term = new window.Terminal({
      convertEol: true,
      cursorBlink: true,
      scrollback: opts.scrollback || 10000,
      fontSize: opts.fontSize || FONT_DEFAULT,
      fontFamily: opts.fontFamily || mono || 'monospace',
      theme: themeColors(),
    });
    term.open(host);
    registerUrlLinks();
    requestAnimationFrame(() => {
      if (term) term.focus();
    });
    if (window.FitAddon && window.FitAddon.FitAddon) {
      fit = new window.FitAddon.FitAddon();
      term.loadAddon(fit);
      fitIfNeeded();
    }
    observer = new ResizeObserver(() => {
      if (ballMode) return; // 悬浮球缩放动画期间不重绘 / 不显示尺寸徽标
      showSizeBadge();
      scheduleResize();
    });
    observer.observe(hostBox || host);
    term.onData((data) => {
      trackLine(data);
      if (sessionId) window.ships.terminal.input(sessionId, data);
      else startSession();
    });
    // 行号随滚动 / 重绘更新。
    term.onScroll(() => scheduleGutter());
    if (typeof term.onRender === 'function') term.onRender(() => scheduleGutter());
    startSession();
    setTimeout(() => {
      if (term) term.focus();
    }, 0);
  }

  const offData = window.ships.terminal.onData((message) => {
    if (!message || message.id !== sessionId || message.type !== 'data') return;
    write(message.data);
    pulseBall();
  });
  const offSession = window.ships.terminal.onSession((message) => {
    if (!message || message.id !== sessionId) return;
    sshTarget = message.target || '';
    if (filesApi) filesApi.setSshTarget(sshTarget);
    applyCommandBusy(message.busy);
  });
  const offExit = window.ships.terminal.onExit((message) => {
    if (!message || message.id !== sessionId) return;
    sessionId = '';
    sshTarget = '';
    ballElapsedAccum = 0;
    syncBallClock();
    if (filesApi) filesApi.setSshTarget('');
    if (message.type === 'error') {
      // 启动失败：留在窗口里显示原因（否则用户看不到是为什么）。
      write(`\r\n${ANSI.error}${i18n.t('terminalWin.failed', { error: message.message })}${ANSI.reset}\r\n`);
      return;
    }
    // shell 结束（输入 exit / Ctrl-D 等）：直接销毁窗口（即使设置了「关闭按钮=隐藏」，
    // 已结束的会话也不该留在后台），不留「会话已结束」这类提示。
    const destroy = window.ships && window.ships.terminal && window.ships.terminal.destroy;
    if (typeof destroy === 'function') destroy();
    else window.close();
  });

  const offZoom = window.ships.terminal.onZoom((direction) => zoomFont(direction));
  const offFocusInput = window.ships.terminal.onFocusInput(() => {
    if (term && !ballMode) term.focus();
  });
  // 拖动结束后主进程请我们重新测量一次（拖动期间不允许改窗口尺寸）→ 重新 fit 并按实测余量对齐
  // 拖动结束（主进程在拖拽空闲后发）：清除「拖动中」标记再重新测量 + 按整格对齐，
  // 这样即便鼠标不再移动、行数也没变化，松手后也会收回到 lineHeight×rows（宽度同理）。
  const offRecalibrate = window.ships.terminal.onRecalibrate(() => {
    dragSuspected = false;
    fitIfNeeded(true);
  });
  const offDragActive =
    typeof window.ships.terminal.onDragActive === 'function'
      ? window.ships.terminal.onDragActive(() => {
          dragSuspected = true;
        })
      : null;
  // 拖动中渲染层收不到鼠标事件；一旦鼠标又出现在内容区，说明已经松手 → 这时再重新 fit + 对齐
  window.addEventListener(
    'mousemove',
    () => {
      if (!dragSuspected) return;
      dragSuspected = false;
      fitIfNeeded(true);
    },
    true
  );

  /* Windows cmd style quick-edit: a single right-click copies the current selection
     when there is one (then clears it), otherwise pastes the system clipboard. There is
     no context menu. xterm keeps its selection on right-click, so this reads it first. */
  function pasteFromClipboard() {
    window.ships.terminal.pasteText().then((result) => {
      if (result && result.ok && result.text && term) {
        term.paste(result.text);
        term.focus();
      }
    });
  }

  host.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    if (!term) return;
    const selection = term.getSelection();
    if (selection) {
      window.ships.terminal.copyText(selection).then(() => {
        if (term) term.clearSelection();
      });
    } else {
      pasteFromClipboard();
    }
  });

  /* 文件面板：头部文件夹按钮显隐底部面板；SFTP 连接跟随当前 ssh 目标。 */
  if (filesBtn) {
    filesBtn.disabled = true;
    filesBtn.style.opacity = '0.4';
    filesBtn.setAttribute('data-tip', i18n.t('terminalFiles.button'));
    filesBtn.addEventListener('click', () => {
      if (filesApi) filesApi.toggle();
    });
  }
  filesApi =
    window.ShipsTerminalFiles && filesBtn
      ? window.ShipsTerminalFiles.mount({ onStateChange: applyFilesState, onCd: cdInTerminal })
      : null;

  itermBtn.addEventListener('click', () => window.ships.terminal.openIterm());
  lightClose.addEventListener('click', () => window.ships.windowControl('close'));
  // 终端窗口禁用「最小化」（关闭按钮在「隐藏」配置下已改为缩成悬浮球）。
  lightMinimize.classList.add('traffic-disabled');
  lightMinimize.setAttribute('aria-disabled', 'true');
  lightZoom.addEventListener('click', () => window.ships.windowControl('zoom'));
  window.addEventListener('focus', () => {
    syncWindowFocus();
    if (term && !ballMode) term.focus();
  });
  window.addEventListener('blur', syncWindowFocus);
  window.addEventListener('resize', onWindowResize);
  syncWindowFocus();
  if (linesBtn) {
    linesBtn.addEventListener('click', () => {
      showLines = !showLines;
      document.body.classList.toggle('show-lines', showLines);
      renderHeader();
      // 左侧让出行号栏宽度 → 重新 fit + 对齐。
      fitIfNeeded(true);
    });
  }
  if (splitBtn) {
    // 新开一扇终端窗口（与主面板底部栏的终端按钮行为一致）。
    splitBtn.addEventListener('click', () => window.ships.openTerminal());
  }
  if (pinBtn) {
    // 固定：开启后本窗口失焦不缩成悬浮球（仅当前窗口）。
    pinBtn.addEventListener('click', () => {
      ballPinned = !ballPinned;
      renderHeader();
      window.ships.terminal.setBallPin(ballPinned);
    });
  }

  /* 悬浮球：失去焦点后主进程把窗口缩成圆形（用 CSS transform 把终端缩到右上角球大小），
     点球放大回来。拖动由指针事件 → 主进程按光标移动窗口；「按下到松开没怎么移动」= 点击。 */
  function applyBallShellScale(scaleX, scaleY, durationMs) {
    if (!shellEl) return;
    shellEl.style.transformOrigin = 'top right';
    if (durationMs) {
      shellEl.style.transition = `transform ${durationMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    } else {
      shellEl.style.transition = 'none';
    }
    shellEl.style.transform = `scale(${scaleX}, ${scaleY})`;
  }
  function resetBallShellScale() {
    if (!shellEl) return;
    shellEl.style.transition = 'none';
    shellEl.style.transform = 'none';
  }

  /* 悬浮球图标：来自设置 settings.terminalBallIcon（assets/icons/ball/ 下的文件名），可实时切换。 */
  let ballIconName = 'ball-11.svg';
  function applyBallIcon(name) {
    ballIconName = name || 'ball-11.svg';
    if (!ballIconEl) return;
    const data = window.shipsBallIcons || { icons: {} };
    const svg = data.icons[ballIconName] || data.icons['ball-11.svg'] || (Icons.ships ? Icons.ships(46) : '');
    ballIconEl.innerHTML = svg;
  }
  applyBallIcon(ballIconName);
  // 终端暗色模式：开启 = 终端窗口（含 xterm 与悬浮球）始终暗色；关闭 = 跟随全局主题。
  // 置 data-terminal-dark：constants.css 覆盖该窗口的主题变量、tailwind.css 决定悬浮球底色。
  function applyTerminalDark(forceDark) {
    document.documentElement.dataset.terminalDark = forceDark ? 'on' : 'auto';
  }
  // 悬浮球透明背景：开启后无底色 / 边框，拖动时由 CSS 显示淡背景。
  function applyBallTransparent(enabled) {
    document.documentElement.dataset.ballTransparent = enabled ? 'on' : 'off';
  }
  // 终端持续有输出时，悬浮球图标做流畅的上下弹跳；2s 内无输出则停止。
  const BALL_IDLE_STOP_MS = 2000;
  // 弹跳一个完整循环的时长（读 styles/ball-animations.css 的 --ball-bounce-duration，带兜底）。
  function ballBounceDurationMs() {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--ball-bounce-duration')
      .trim();
    const value = parseFloat(raw);
    if (!Number.isFinite(value) || value <= 0) return 1200;
    return /ms$/.test(raw) ? value : value * 1000;
  }
  let ballBounceOn = false; // 是否正在播放弹跳
  let ballBounceStartedAt = 0; // 本轮播放起始时间（算相位与当前段时长）
  let ballElapsedAccum = 0; // 之前各段弹跳累计的毫秒数（跨球/窗口切换保留，会话重启清零）
  let ballIdleTimer = null; // 无输出满 2s 的计时
  let ballSettleTimer = null; // 「走到循环边界再停」的计时
  let ballHovered = false; // 鼠标是否悬停在球上（由 pointerenter/leave 维护，不依赖 :hover 轮询）
  let ballClockRaf = null; // 悬停显示时的刷新帧（只在可见时运行）
  // 自本次会话开始的累计活动时长；暂停弹跳 / 打开终端不会清零。
  function ballElapsedMs() {
    return ballElapsedAccum + (ballBounceOn ? Math.max(0, performance.now() - ballBounceStartedAt) : 0);
  }
  // 拆成上行 h/m（非 0 才显示，均不补前导 0）与下行 s（同样不补前导 0：5s 而非 05s）。
  function formatBallClock(ms) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const hm = `${h > 0 ? `${h}h` : ''}${m > 0 ? `${m}m` : ''}`;
    return { hm, s: `${s}s` };
  }
  function setBallTimerVisible(on) {
    const next = on ? 'on' : 'off';
    if (document.documentElement.dataset.ballTimer !== next) {
      document.documentElement.dataset.ballTimer = next;
    }
  }
  // 悬停在球上 → 显示累计活动时长（即使当前没有跳动也保留累计值）；垃圾桶状态下不显示。
  function tickBallClock() {
    ballClockRaf = null;
    const show = ballHovered && document.documentElement.dataset.ballTrash !== 'on';
    setBallTimerVisible(show);
    if (!show) return;
    const clock = formatBallClock(ballElapsedMs());
    if (ballTimerHmEl) ballTimerHmEl.textContent = clock.hm;
    if (ballTimerSEl) ballTimerSEl.textContent = clock.s;
    // 只有跳动时时间才在增长；停止跳动后只显示静态累计值，不再逐帧刷新。
    if (ballBounceOn) ballClockRaf = requestAnimationFrame(tickBallClock);
  }
  function syncBallClock() {
    if (ballClockRaf == null) tickBallClock();
  }
  function startBallBounce() {
    if (ballBounceOn || !ballEl) return;
    ballBounceOn = true;
    ballBounceStartedAt = performance.now();
    ballEl.classList.add('term-ball-bounce');
    syncBallClock();
  }
  function pauseBallBounce() {
    if (ballBounceOn) {
      ballElapsedAccum += Math.max(0, performance.now() - ballBounceStartedAt);
    }
    if (ballEl) ballEl.classList.remove('term-ball-bounce');
    ballBounceOn = false;
    if (ballClockRaf != null) {
      cancelAnimationFrame(ballClockRaf);
      ballClockRaf = null;
    }
    // 保留累计值；悬停时继续显示静态时间。
    syncBallClock();
  }
  function pulseBall() {
    if (!ballMode || !ballEl) return;
    startBallBounce();
    // 有输出：取消「准备停止」，并重开 1s 空闲计时。
    if (ballSettleTimer) {
      clearTimeout(ballSettleTimer);
      ballSettleTimer = null;
    }
    clearTimeout(ballIdleTimer);
    ballIdleTimer = setTimeout(onBallIdle, BALL_IDLE_STOP_MS);
  }
  function onBallIdle() {
    ballIdleTimer = null;
    if (!ballBounceOn) return;
    // 前台命令仍在运行（即使没有输出）→ 继续跳动。
    if (commandBusy) return;
    // 等当前循环走完（回到 translateY(0)）再停，避免停在半空 / 顶部 / 底部显得「卡」。
    const duration = ballBounceDurationMs();
    const phase = (performance.now() - ballBounceStartedAt) % duration;
    const wait = phase === 0 ? 0 : duration - phase;
    ballSettleTimer = setTimeout(() => {
      ballSettleTimer = null;
      if (ballIdleTimer) return; // 期间又有输出 → 继续跳
      pauseBallBounce();
    }, wait);
  }
  function applyCommandBusy(busy) {
    const next = Boolean(busy);
    if (next === commandBusy) return;
    commandBusy = next;
    if (commandBusy) {
      if (ballSettleTimer) {
        clearTimeout(ballSettleTimer);
        ballSettleTimer = null;
      }
      clearTimeout(ballIdleTimer);
      ballIdleTimer = null;
      if (ballMode) startBallBounce();
      return;
    }
    // 命令结束：等 2s 无输出再停（若还有输出，pulseBall 会重置计时）。
    if (ballMode && ballBounceOn) {
      clearTimeout(ballIdleTimer);
      ballIdleTimer = setTimeout(onBallIdle, BALL_IDLE_STOP_MS);
    }
  }

  function stopBallPulse() {
    if (ballIdleTimer) {
      clearTimeout(ballIdleTimer);
      ballIdleTimer = null;
    }
    if (ballSettleTimer) {
      clearTimeout(ballSettleTimer);
      ballSettleTimer = null;
    }
    pauseBallBounce();
  }
  if (ballTrashEl) ballTrashEl.innerHTML = Icons.trash(24);
  if (ballEl) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let moved = false;
    let trashArmed = false;
    const setTrash = (on) => {
      trashArmed = on;
      document.documentElement.dataset.ballTrash = on ? 'on' : 'off';
      syncBallClock();
    };
    // 悬停：显示本轮累计跳动时长（停止跳动时不显示）。
    ballEl.addEventListener('pointerenter', () => {
      ballHovered = true;
      syncBallClock();
    });
    ballEl.addEventListener('pointerleave', () => {
      ballHovered = false;
      syncBallClock();
    });
    // 球上右键 → 悬浮垃圾桶图标；再点一下球 → 销毁终端。
    ballEl.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      setTrash(!trashArmed);
    });
    ballEl.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      dragging = true;
      moved = false;
      document.documentElement.dataset.ballDrag = 'on';
      startX = event.screenX;
      startY = event.screenY;
      try {
        ballEl.setPointerCapture(event.pointerId);
      } catch (err) {
        /* ignore */
      }
      window.ships.terminal.ballDrag({ phase: 'start', x: event.screenX, y: event.screenY });
    });
    ballEl.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      if (Math.abs(event.screenX - startX) > 3 || Math.abs(event.screenY - startY) > 3) {
        moved = true;
        if (trashArmed) setTrash(false);
      }
    });
    const endDrag = (event) => {
      if (!dragging) return;
      dragging = false;
      document.documentElement.dataset.ballDrag = 'off';
      try {
        ballEl.releasePointerCapture(event.pointerId);
      } catch (err) {
        /* ignore */
      }
      window.ships.terminal.ballDrag({ phase: 'end' });
      if (moved) return;
      if (trashArmed) {
        setTrash(false);
        window.ships.terminal.destroy();
      } else {
        window.ships.terminal.restoreBall();
      }
    };
    ballEl.addEventListener('pointerup', endDrag);
    ballEl.addEventListener('pointercancel', endDrag);
  }

  window.ships.terminal.onBall((payload) => {
    const active = Boolean(payload && payload.active);
    const phase = (payload && payload.phase) || 'settle';
    // 仅球真正显示时启用主进程的前台命令检测。
    window.ships.terminal.setBallActive(active && phase !== 'enter');
    const size = payload && payload.size;
    const duration = (payload && payload.duration) || 0;
    const scaleX = (payload && payload.scaleX) || 1;
    const scaleY = (payload && payload.scaleY) || 1;
    if (size) document.documentElement.style.setProperty('--term-ball-size', `${size}px`);
    if (active && phase === 'enter') {
      // 收缩：终端保持可见，用 CSS transform 缩到右上角球大小（窗口尺寸不动 → 不跳）。
      ballMode = true;
      document.documentElement.dataset.ball = 'off';
      applyBallShellScale(scaleX, scaleY, duration);
    } else if (active) {
      // settle：窗口已变成球大小 → 隐藏终端、显示球。
      ballMode = true;
      resetBallShellScale();
      document.documentElement.dataset.ball = 'on';
      if (commandBusy) startBallBounce();
    } else if (phase === 'grow') {
      // 放大：窗口已还原，终端先按球大小显示，再 CSS 放大到 1。
      ballMode = true;
      document.documentElement.dataset.ball = 'off';
      applyBallShellScale(scaleX, scaleY, 0);
      // 下一帧再开过渡，确保从缩放态起动画。
      requestAnimationFrame(() => applyBallShellScale(1, 1, duration));
    } else {
      // settle：动画结束，恢复正常、重新 fit / 对齐，并把焦点交回终端输入。
      ballMode = false;
      stopBallPulse();
      resetBallShellScale();
      document.documentElement.dataset.ball = 'off';
      setTimeout(() => {
        fitIfNeeded(true);
        if (term) term.focus();
      }, 40);
    }
  });

  window.addEventListener('beforeunload', () => {
    offZoom();
    if (offSession) offSession();
    if (filesApi) filesApi.closeConnection();
    if (offRecalibrate) offRecalibrate();
    if (offDragActive) offDragActive();
    if (sessionId) window.ships.terminal.kill(sessionId);
  });

  async function boot() {
    if (!window.ships) return;
    const [settings, info] = await Promise.all([window.ships.getSettings(), window.ships.getInfo()]);
    i18n.setLocale((settings && settings.locale) || 'zh');
    window.ShipsTheme.set(settings || {});
    applyBallIcon(settings && settings.terminalBallIcon);
    applyTerminalDark((settings && settings.terminalBallDark) !== false);
    applyBallTransparent((settings && settings.terminalBallTransparent) !== false);
    renderHeader();
    sshPicker = setupSshPicker();
    refreshSshPicker();
    // 设置页增删改 SSH 主机 / 分组后实时刷新下拉。
    window.ships.ssh.onConfigChanged(() => refreshSshPicker());
    settingsFontSize = Math.max(FONT_MIN, Math.min(FONT_MAX, (settings && settings.terminalFontSize) || FONT_DEFAULT));
    settingsFontFamily = String((settings && settings.terminalFontFamily) || '');
    fontSize = settingsFontSize;
    applyHeaderFontSize(fontSize);
    const initialFontFamily = fontFamilyValue(settingsFontFamily);
    document.documentElement.style.setProperty('--term-font-family', initialFontFamily);
    shellPath = (settings && settings.terminalShell) || '';
    initTerminal({
      scrollback: (settings && settings.terminalScrollback) || (info && info.terminalScrollback) || 10000,
      fontSize: fontSize,
      fontFamily: initialFontFamily,
    });
    window.ships.onSettingsChanged((next) => {
      i18n.setLocale((next && next.locale) || 'zh');
      window.ShipsTheme.set(next || {});
      applyBallIcon(next && next.terminalBallIcon);
      applyTerminalDark((next && next.terminalBallDark) !== false);
      applyBallTransparent((next && next.terminalBallTransparent) !== false);
      renderHeader();
      refreshSshPicker();
      if (term) term.options.theme = themeColors();
      shellPath = (next && next.terminalShell) || ''; // applies to the next session
      if (term && next && next.terminalScrollback) term.options.scrollback = next.terminalScrollback;
      syncFontSizeSetting(next);
    });
  }

  boot().catch((err) => console.error(err));
})();
