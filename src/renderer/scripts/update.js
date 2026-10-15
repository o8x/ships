'use strict';

/* 自动更新下载窗口：小型、不可关闭的前台窗口，只显示实时进度条、取消、「重启更新」按钮。
   下载完成后「重启更新」可用，并显示 60 秒倒计时自动重启；取消 = 退出本次更新。 */

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
        readyHint: '下载完成，可立即重启更新（或等待自动重启）',
        cancel: '取消',
        install: '重启更新',
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
        readyHint: 'Download complete. Restart now or wait for the auto restart',
        cancel: 'Cancel',
        install: 'Restart & update',
      },
    },
  });

  const dom = {
    title: document.getElementById('update-title'),
    bar: document.getElementById('update-bar'),
    status: document.getElementById('update-status'),
    cancel: document.getElementById('update-cancel'),
    install: document.getElementById('update-install'),
    lightMinimize: document.getElementById('light-minimize'),
  };

  // 自绘红绿灯：仅「最小化」生效（关闭 / 缩放已禁用）；窗口失焦时整体变灰。
  if (dom.lightMinimize) {
    dom.lightMinimize.addEventListener('click', () => window.ships.windowControl('minimize'));
  }
  function syncWindowFocus() {
    document.documentElement.dataset.windowFocus = document.hasFocus() ? 'on' : 'off';
  }
  window.addEventListener('focus', syncWindowFocus);
  window.addEventListener('blur', syncWindowFocus);
  syncWindowFocus();

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
      return i18n.t('updateWin.countdown', { s: Math.max(0, Number(state.countdown) || 0) });
    }
    const done = formatBytes(state.transferred);
    const total = state.total ? formatBytes(state.total) : '—';
    const base = i18n.t('updateWin.progress', { done, total });
    if (state.bytesPerSecond) return `${base} · ${i18n.t('updateWin.speed', { speed: formatBytes(state.bytesPerSecond) })}`;
    return state.percent ? base : i18n.t('updateWin.connecting');
  }

  function render(state) {
    if (!state) return;
    const version = state.version ? ` v${state.version}` : '';
    // 重启进行中（点了「重启更新」或倒计时到 0）：取消按钮一并禁用。
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
    phase: 'idle',
    version: '',
    percent: 0,
    transferred: 0,
    total: 0,
    bytesPerSecond: 0,
    countdown: 0,
    restarting: false,
  };

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
    if (state) {
      current = merge(state);
      render(current);
    }
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
