'use strict';

/* Always-on-top terminal window: one real PTY session (default login shell) rendered
   by xterm.js, with iTerm handoff and buffer export in the header. */

(function bootstrapTerminalWindow() {
  const { Icons, el } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      terminalWin: {
        title: '终端',
        iterm: '在 iTerm 中打开并关闭此窗口',
        export: '导出终端文本到本地文件',
        pinTop: '取消置顶（不再浮在其他窗口上面）',
        unpinTop: '置顶显示',
        exported: '已导出到 {path}',
        exportFailed: '导出失败：{error}',
        ended: '会话已结束（关闭窗口即可）',
        failed: '无法启动终端会话：{error}',
        noTerminal: 'xterm 未能加载，无法显示终端',
      },
    },
    en: {
      terminalWin: {
        title: 'Terminal',
        iterm: 'Open in iTerm and close this window',
        export: 'Export terminal text to a file',
        pinTop: 'Always on top: on (click to turn off)',
        unpinTop: 'Always on top: off (click to turn on)',
        exported: 'Exported to {path}',
        exportFailed: 'Export failed: {error}',
        ended: 'Session ended (close the window)',
        failed: 'Cannot start the terminal session: {error}',
        noTerminal: 'xterm failed to load',
      },
    },
  });

  const ANSI = { meta: '\u001b[90m', error: '\u001b[31m', reset: '\u001b[0m' };

  const FONT_DEFAULT = 12;
  const FONT_MIN = 8;
  const FONT_MAX = 24;

  const host = document.getElementById('term-host');
  const titleEl = document.getElementById('term-title');
  const topBtn = document.getElementById('btn-top');
  const itermBtn = document.getElementById('btn-iterm');
  const exportBtn = document.getElementById('btn-export');

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
  let alwaysOnTop = true;
  let shellPath = '';

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
    if (!fit || !term || !host) return;
    const rect = host.getBoundingClientRect();
    const key = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
    if (!force && key === lastHostKey) return;
    lastHostKey = key;
    fit.fit();
    syncPtySize();
  }

  function applyFontSize(value) {
    if (!term) return;
    term.options.fontSize = value;
    fitIfNeeded(true);
    syncPtySize();
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

  /* Cmd +/+/- zoom the terminal font only (menu.js / zoom-changed route here) — the
     page zoom stays at 1 so the title bar and icons keep their size. */
  function zoomFont(direction) {
    if (!term) return;
    if (direction === 'reset') fontSize = FONT_DEFAULT;
    else fontSize = Math.max(FONT_MIN, Math.min(FONT_MAX, fontSize + (direction === 'in' ? 1 : -1)));
    applyFontSize(fontSize);
  }

  function scheduleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fitIfNeeded, 150);
  }

  async function startSession() {
    if (!term || sessionId) return;
    const result = await window.ships.terminal.start(term.cols, term.rows, shellPath);
    if (!result || !result.ok) {
      write(`\r\n${ANSI.error}${i18n.t('terminalWin.failed', { error: (result && result.error) || 'error' })}${ANSI.reset}\r\n`);
      return;
    }
    sessionId = result.id;
    // the PTY was created with the current size: remember it so we do not resize again
    lastCols = term.cols;
    lastRows = term.rows;
  }

  function bufferText() {
    if (!term) return '';
    const buffer = term.buffer.active;
    const lines = [];
    for (let i = 0; i < buffer.length; i += 1) {
      const line = buffer.getLine(i);
      lines.push(line ? line.translateToString(true) : '');
    }
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    return `${lines.join('\n')}\n`;
  }

  function renderHeader() {
    titleEl.textContent = i18n.t('terminalWin.title');
    topBtn.innerHTML = alwaysOnTop ? Icons.pin(15) : Icons.pinOff(15);
    topBtn.setAttribute('data-tip', i18n.t(alwaysOnTop ? 'terminalWin.pinTop' : 'terminalWin.unpinTop'));
    topBtn.style.color = alwaysOnTop ? 'var(--color-accent)' : '';
    itermBtn.innerHTML = Icons.terminal(15);
    itermBtn.setAttribute('data-tip', i18n.t('terminalWin.iterm'));
    exportBtn.innerHTML = Icons.download(15);
    exportBtn.setAttribute('data-tip', i18n.t('terminalWin.export'));
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
    observer = new ResizeObserver(() => scheduleResize());
    observer.observe(host);
    term.onData((data) => {
      if (sessionId) window.ships.terminal.input(sessionId, data);
      else startSession();
    });
    startSession();
  }

  const offData = window.ships.terminal.onData((message) => {
    if (!message || message.id !== sessionId || message.type !== 'data') return;
    write(message.data);
  });
  const offExit = window.ships.terminal.onExit((message) => {
    if (!message || message.id !== sessionId) return;
    sessionId = '';
    if (message.type === 'error') {
      write(`\r\n${ANSI.error}${i18n.t('terminalWin.failed', { error: message.message })}${ANSI.reset}\r\n`);
    } else {
      write(`\r\n${ANSI.meta}${i18n.t('terminalWin.ended')}${ANSI.reset}\r\n`);
    }
  });

  const offZoom = window.ships.terminal.onZoom((direction) => zoomFont(direction));

  itermBtn.addEventListener('click', () => window.ships.terminal.openIterm());
  topBtn.addEventListener('click', async () => {
    const result = await window.ships.terminal.setAlwaysOnTop(!alwaysOnTop);
    alwaysOnTop = Boolean(result && result.ok ? result.alwaysOnTop : !alwaysOnTop);
    renderHeader();
  });
  exportBtn.addEventListener('click', async () => {
    const result = await window.ships.terminal.export({ text: bufferText() });
    if (result && result.ok) {
      write(`\r\n${ANSI.meta}${i18n.t('terminalWin.exported', { path: result.path })}${ANSI.reset}\r\n`);
    } else if (result && !result.canceled) {
      write(`\r\n${ANSI.error}${i18n.t('terminalWin.exportFailed', { error: result.error || 'error' })}${ANSI.reset}\r\n`);
    }
  });

  window.addEventListener('beforeunload', () => {
    offZoom();
    if (sessionId) window.ships.terminal.kill(sessionId);
  });

  async function boot() {
    if (!window.ships) return;
    const [settings, info] = await Promise.all([window.ships.getSettings(), window.ships.getInfo()]);
    i18n.setLocale((settings && settings.locale) || 'zh');
    window.ShipsTheme.set(settings || {});
    alwaysOnTop = !settings || settings.terminalAlwaysOnTop !== false;
    renderHeader();
    settingsFontSize = Math.max(FONT_MIN, Math.min(FONT_MAX, (settings && settings.terminalFontSize) || FONT_DEFAULT));
    fontSize = settingsFontSize;
    shellPath = (settings && settings.terminalShell) || '';
    initTerminal({
      scrollback: (settings && settings.terminalScrollback) || (info && info.terminalScrollback) || 10000,
      fontSize: fontSize,
    });
    window.ships.onSettingsChanged((next) => {
      i18n.setLocale((next && next.locale) || 'zh');
      window.ShipsTheme.set(next || {});
      alwaysOnTop = !next || next.terminalAlwaysOnTop !== false;
      renderHeader();
      if (term) term.options.theme = themeColors();
      shellPath = (next && next.terminalShell) || ''; // applies to the next session
      if (term && next && next.terminalScrollback) term.options.scrollback = next.terminalScrollback;
      syncFontSizeSetting(next);
    });
  }

  boot().catch((err) => console.error(err));
})();
