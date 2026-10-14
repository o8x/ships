'use strict';

/* Always-on-top terminal window: one real PTY session (default login shell) rendered
   by xterm.js, with iTerm handoff and buffer export in the header. */

(function bootstrapTerminalWindow() {
  const { Icons, el } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      terminalWin: {
        sshPlaceholder: 'SSH',
        sshFailed: '连接失败：{error}',
        linesOn: '隐藏行号',
        linesOff: '显示行号',
        newWindow: '新建窗口',
        failed: '无法启动终端会话：{error}',
        noTerminal: 'xterm 未能加载，无法显示终端',
      },
    },
    en: {
      terminalWin: {
        sshPlaceholder: 'SSH',
        sshFailed: 'Connect failed: {error}',
        linesOn: 'Hide line numbers',
        linesOff: 'Show line numbers',
        newWindow: 'New window',
        failed: 'Cannot start the terminal session: {error}',
        noTerminal: 'xterm failed to load',
      },
    },
  });

  const ANSI = { meta: '\u001b[90m', error: '\u001b[31m', reset: '\u001b[0m' };

  const FONT_DEFAULT = 12;
  const FONT_MIN = 8;
  const FONT_MAX = 24;

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

  function themeColors() {
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

  /* 在终端会话里执行 `cd <path>`（文件面板路径行的「在终端 cd 到此目录」）。 */
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
    if (sizeEl && !sizeEl.classList.contains('hidden')) {
      sizeEl.textContent = `${term.cols}×${term.rows}`;
    }
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

  /* iTerm 式：拖动 / 缩放期间在头栏中间显示「列 × 行」，停手 700ms 后隐藏。 */
  function showSizeBadge() {
    if (!sizeEl || !term) return;
    sizeEl.textContent = `${term.cols}×${term.rows}`;
    sizeEl.classList.remove('hidden');
    clearTimeout(sizeBadgeTimer);
    sizeBadgeTimer = setTimeout(() => sizeEl.classList.add('hidden'), 700);
  }

  function applyFontSize(value) {
    if (!term) return;
    term.options.fontSize = value;
    applyHeaderFontSize(value);
    fitIfNeeded(true);
    syncPtySize();
  }

  /* 头栏（SSH 下拉等）字号 = 终端字号 + 1（永远比终端设置大 1px）；
     文件面板文字字号 = 终端字号。Cmd +/-、设置里的字体大小都会作用到它们。 */
  function applyHeaderFontSize(value) {
    document.documentElement.style.setProperty('--term-header-font-size', `${value + 1}px`);
    document.documentElement.style.setProperty('--file-font-size', `${value}px`);
  }

  /* 字号来源有两处：设置 → 终端（写回设置，这里跟随）与 Cmd + / Cmd -（临时）。
     只有设置里的值真的变化时才覆盖当前字号，免得别的设置变更把临时缩放顶掉。 */
  function syncFontSizeSetting(next) {
    const wanted = Math.max(FONT_MIN, Math.min(FONT_MAX, (next && next.terminalFontSize) || FONT_DEFAULT));
    if (wanted === settingsFontSize) return;
    settingsFontSize = wanted;
    fontSize = wanted;
    applyFontSize(fontSize);
  }

  /* Cmd +/+/-（menu.js / zoom-changed 路由到这里）：直接修改**设置里的字号**（写回 settings，
     持久化，重开终端也生效），不改页面缩放因子 —— 页面缩放固定为 1，头栏与图标尺寸不变。 */
  function zoomFont(direction) {
    let value;
    if (direction === 'reset') value = FONT_DEFAULT;
    else value = fontSize + (direction === 'in' ? 1 : -1);
    value = Math.max(FONT_MIN, Math.min(FONT_MAX, value));
    if (value === fontSize) return;
    window.ships.setSettings({ terminalFontSize: value });
  }

  function scheduleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fitIfNeeded, 150);
  }

  /* 窗口尺寸变化时把「字体大小 / 行高 / 窗口大小」写到控制台与 ships.log（节流 250ms）。 */
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
    sshTarget = '';
    if (filesApi) filesApi.setSshTarget('');
    // the PTY was created with the current size: remember it so we do not resize again
    lastCols = term.cols;
    lastRows = term.rows;
  }

  function renderHeader() {
    linesBtn.innerHTML = (showLines ? Icons.eyeOff : Icons.eye)(15);
    linesBtn.style.color = showLines ? 'var(--color-accent)' : '';
    linesBtn.setAttribute('data-tip', i18n.t(showLines ? 'terminalWin.linesOn' : 'terminalWin.linesOff'));
    filesBtn.innerHTML = Icons.folder(15);
    itermBtn.innerHTML = Icons.terminal(15);
    splitBtn.innerHTML = Icons.split(15);
    splitBtn.setAttribute('data-tip', i18n.t('terminalWin.newWindow'));
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
      options: [{ value: '', label: i18n.t('terminalWin.sshPlaceholder') }],
      value: '',
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
    const result = await window.ships.ssh.connect({ alias, inTerminal: true });
    if (!result || !result.ok) {
      write(`\r\n${ANSI.error}${i18n.t('terminalWin.sshFailed', { error: (result && result.error) || 'error' })}${ANSI.reset}\r\n`);
    }
    if (term) term.focus();
  }

  async function refreshSshPicker() {
    if (!sshPicker) return;
    let hosts = [];
    try {
      const result = await window.ships.ssh.list();
      hosts = (result && result.hosts) || [];
    } catch (err) {
      hosts = [];
    }
    const options = [{ value: '', label: i18n.t('terminalWin.sshPlaceholder') }];
    for (const host of hosts) {
      const address = host.user ? `${host.user}@${host.hostName}` : String(host.hostName || host.alias || '');
      options.push({ value: host.alias, label: address });
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
      fontFamily: mono || 'monospace',
      theme: themeColors(),
    });
    term.open(host);
    if (window.FitAddon && window.FitAddon.FitAddon) {
      fit = new window.FitAddon.FitAddon();
      term.loadAddon(fit);
      fitIfNeeded();
    }
    observer = new ResizeObserver(() => {
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
  }

  const offData = window.ships.terminal.onData((message) => {
    if (!message || message.id !== sessionId || message.type !== 'data') return;
    write(message.data);
  });
  const offSession = window.ships.terminal.onSession((message) => {
    if (!message || message.id !== sessionId) return;
    sshTarget = message.target || '';
    if (filesApi) filesApi.setSshTarget(sshTarget);
  });
  const offExit = window.ships.terminal.onExit((message) => {
    if (!message || message.id !== sessionId) return;
    sessionId = '';
    sshTarget = '';
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
  lightMinimize.addEventListener('click', () => window.ships.windowControl('minimize'));
  lightZoom.addEventListener('click', () => window.ships.windowControl('zoom'));
  window.addEventListener('focus', syncWindowFocus);
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

  /* 悬浮球：失去焦点时主进程把窗口缩成圆形（<html data-ball="on">），点球放大回来。
     拖动由指针事件 → 主进程按光标移动窗口；「按下到松开没怎么移动」= 点击 → 放大。 */
  if (ballIconEl) ballIconEl.innerHTML = Icons.ships ? Icons.ships(46) : '';
  if (ballEl) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let moved = false;
    ballEl.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      dragging = true;
      moved = false;
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
      if (Math.abs(event.screenX - startX) > 3 || Math.abs(event.screenY - startY) > 3) moved = true;
    });
    const endDrag = (event) => {
      if (!dragging) return;
      dragging = false;
      try {
        ballEl.releasePointerCapture(event.pointerId);
      } catch (err) {
        /* ignore */
      }
      window.ships.terminal.ballDrag({ phase: 'end' });
      if (!moved) window.ships.terminal.restoreBall();
    };
    ballEl.addEventListener('pointerup', endDrag);
    ballEl.addEventListener('pointercancel', endDrag);
  }

  window.ships.terminal.onBall((payload) => {
    if (payload && payload.size) {
      document.documentElement.style.setProperty('--term-ball-size', `${payload.size}px`);
    }
    ballMode = Boolean(payload && payload.active);
    document.documentElement.dataset.ball = ballMode ? 'on' : 'off';
    if (!ballMode) {
      // 放大回来（主进程在缩放动画结束后才通知）：重新 fit / 对齐。
      setTimeout(() => fitIfNeeded(true), 40);
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
    renderHeader();
    sshPicker = setupSshPicker();
    refreshSshPicker();
    settingsFontSize = Math.max(FONT_MIN, Math.min(FONT_MAX, (settings && settings.terminalFontSize) || FONT_DEFAULT));
    fontSize = settingsFontSize;
    applyHeaderFontSize(fontSize);
    shellPath = (settings && settings.terminalShell) || '';
    initTerminal({
      scrollback: (settings && settings.terminalScrollback) || (info && info.terminalScrollback) || 10000,
      fontSize: fontSize,
    });
    window.ships.onSettingsChanged((next) => {
      i18n.setLocale((next && next.locale) || 'zh');
      window.ShipsTheme.set(next || {});
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
