'use strict';

/* 自动更新窗口：小型、不可关闭的前台窗口。
   提示模式显示标题 + 消息 + 自定义按钮（由主进程经 update:prompt 下发，替代系统弹窗）；
   下载模式显示实时进度条、取消、「重启更新」按钮，完成后倒计时自动重启。 */

(function bootstrapUpdateWindow() {
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      updateWin: {
        downloading: '正在下载更新',
        downloaded: '下载完成',
        idle: '准备下载更新',
        connecting: '正在连接…',
        progress: '{done} / {total}',
        speed: '{speed}/s',
        countdown: '{s} 秒后自动重启更新',
        countdownPkg: '{s} 秒后自动退出并打开安装器',
        readyHint: '下载完成，可立即重启更新（或等待自动重启）',
        cancel: '取消',
        install: '重启更新',
        installPkg: '退出并安装',
      },
    },
    en: {
      updateWin: {
        downloading: 'Downloading update',
        downloaded: 'Download complete',
        idle: 'Preparing update',
        connecting: 'Connecting…',
        progress: '{done} / {total}',
        speed: '{speed}/s',
        countdown: 'Restarting to update in {s}s',
        countdownPkg: 'Opening the installer in {s}s',
        readyHint: 'Download complete. Restart now or wait for the auto restart',
        cancel: 'Cancel',
        install: 'Restart & update',
        installPkg: 'Quit & install',
      },
    },
  });

  const dom = {
    title: document.getElementById('update-title'),
    message: document.getElementById('update-message'),
    progressWrap: document.getElementById('update-progress-wrap'),
    bar: document.getElementById('update-bar'),
    status: document.getElementById('update-status'),
    actions: document.getElementById('update-actions'),
    promptActions: document.getElementById('update-prompt-actions'),
    cancel: document.getElementById('update-cancel'),
    install: document.getElementById('update-install'),
  };

  let activePrompt = null;

  function setShown(node, shown) {
    if (node) node.style.display = shown ? '' : 'none';
  }

  /* 提示框模式：隐藏下载进度 / 取消 / 安装，显示消息与按主进程配置的按钮。
     按钮顺序 / 文案由主进程给出（沿用当前语言），首项 / defaultId 用强调色。 */
  function renderPrompt(prompt) {
    activePrompt = prompt || null;
    if (!prompt) {
      setShown(dom.message, false);
      setShown(dom.promptActions, false);
      setShown(dom.progressWrap, true);
      setShown(dom.status, true);
      setShown(dom.actions, true);
      render(current);
      return;
    }
    setShown(dom.progressWrap, false);
    setShown(dom.status, false);
    setShown(dom.actions, false);
    setShown(dom.message, true);
    setShown(dom.promptActions, true);
    dom.title.textContent = prompt.title || '';
    dom.message.textContent = prompt.message || '';
    dom.promptActions.replaceChildren();
    const defaultId = Number.isInteger(prompt.defaultId) ? prompt.defaultId : 0;
    (prompt.buttons || []).forEach((label, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = index === defaultId ? 'btn btn-accent' : 'btn';
      button.textContent = label;
      button.addEventListener('click', () => {
        if (!activePrompt || activePrompt.id !== prompt.id) return;
        dom.promptActions.querySelectorAll('button').forEach((node) => {
          node.disabled = true;
        });
        window.ships.update.choose({ id: prompt.id, index });
      });
      dom.promptActions.appendChild(button);
    });
  }

  dom.cancel.textContent = i18n.t('updateWin.cancel');
  dom.install.textContent = i18n.t('updateWin.install');
  dom.title.textContent = i18n.t('updateWin.idle');
  dom.status.textContent = i18n.t('updateWin.connecting');

  dom.cancel.addEventListener('click', () => {
    dom.cancel.disabled = true;
    window.ships.update.cancel();
  });
  dom.install.addEventListener('click', () => {
    // 重启开始：立即禁用「重启更新」与「取消」。
    current = merge({ restarting: true });
    render(current);
    window.ships.update.install();
  });

  function formatBytes(value) {
    const n = Number(value) || 0;
    if (n <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let v = n;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i += 1;
    }
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function statusText(state) {
    if (state.phase === 'downloaded') {
      const key = state.mode === 'pkg' ? 'updateWin.countdownPkg' : 'updateWin.countdown';
      return i18n.t(key, { s: Math.max(0, Number(state.countdown) || 0) });
    }
    const done = formatBytes(state.transferred);
    const total = state.total ? formatBytes(state.total) : '—';
    const base = i18n.t('updateWin.progress', { done, total });
    if (state.bytesPerSecond) return `${base} · ${i18n.t('updateWin.speed', { speed: formatBytes(state.bytesPerSecond) })}`;
    return state.percent ? base : i18n.t('updateWin.connecting');
  }

  function render(state) {
    if (!state || activePrompt) return;
    const version = state.version ? ` v${state.version}` : '';
    // macOS（pkg）= 退出并打开系统安装器；Windows（auto）= 重启并安装。
    dom.install.textContent = i18n.t(state.mode === 'pkg' ? 'updateWin.installPkg' : 'updateWin.install');
    // 重启进行中（点了安装按钮或倒计时到 0）：取消按钮一并禁用。
    const restarting = state.restarting === true;
    dom.cancel.disabled = restarting;
    if (state.phase === 'downloaded') {
      dom.title.textContent = `${i18n.t('updateWin.downloaded')}${version}`;
      dom.bar.style.width = '100%';
      dom.install.disabled = restarting;
    } else if (state.phase === 'downloading') {
      dom.title.textContent = `${i18n.t('updateWin.downloading')}${version}`;
      dom.bar.style.width = `${Math.max(0, Math.min(100, state.percent || 0))}%`;
      dom.install.disabled = true;
    } else {
      dom.title.textContent = i18n.t('updateWin.idle');
      dom.bar.style.width = '0%';
      dom.install.disabled = true;
    }
    dom.status.textContent = statusText(state);
  }

  // 下载完成事件携带完整快照；进度 / 倒计时事件只更新局部。
  function merge(patch) {
    return Object.assign({}, current, patch || {});
  }

  let current = {
    mode: 'auto',
    phase: 'idle',
    version: '',
    percent: 0,
    transferred: 0,
    total: 0,
    bytesPerSecond: 0,
    countdown: 0,
    restarting: false,
  };

  window.ships.update.onPrompt((prompt) => {
    renderPrompt(prompt);
  });

  // Esc = 取消当前提示（按主进程给的 cancelId）。
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !activePrompt) return;
    const index = Number.isInteger(activePrompt.cancelId) ? activePrompt.cancelId : activePrompt.defaultId || 0;
    window.ships.update.choose({ id: activePrompt.id, index });
  });

  window.ships.update.onProgress((state) => {
    current = merge(state);
    render(current);
  });
  window.ships.update.onDownloaded((state) => {
    current = merge(state);
    render(current);
  });
  window.ships.update.onCountdown((payload) => {
    const countdown = payload && payload.countdown;
    // 倒计时到 0 即自动重启：同样禁用取消。
    current = merge({ countdown, restarting: countdown <= 0 ? true : current.restarting });
    render(current);
  });

  window.ships.update.state().then((state) => {
    if (!state) return;
    current = merge(state);
    // 打开时可能已有待处理的提示（主进程在窗口加载完成前就发出了 update:prompt）。
    if (state.prompt) renderPrompt(state.prompt);
    else render(current);
  });

  Promise.all([window.ships.getSettings()]).then(([settings]) => {
    i18n.setLocale((settings && settings.locale) || 'zh');
    window.ShipsTheme.set(settings || {});
    dom.cancel.textContent = i18n.t('updateWin.cancel');
    dom.install.textContent = i18n.t('updateWin.install');
    render(current);
  });

  window.ships.onThemeChanged(() => window.ShipsTheme.apply());
})();
