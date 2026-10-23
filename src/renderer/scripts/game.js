'use strict';

(function bootstrapGame() {
  const { Icons } = window.ShipsUI;
  const i18n = window.ShipsI18n;
  const games = window.ships.games;
  const constants = games.constants;

  i18n.extend({
    zh: {
      gameWindow: {
        loading: '正在加载游戏…',
        loadingHint: '首次加载核心会稍慢',
        loadFailed: '游戏加载失败',
        loadTimeout: '加载超时，请重试或检查工作目录',
        retry: '重试',
        openFolder: '打开工作目录',
        confirm: '确认',
        select: '选择',
        pause: '暂停',
        resume: '继续',
        save: '保存',
        load: '读取',
        restart: '重新开始',
        screenshot: '截图',
        restarted: '已重新开始',
        screenshotSaved: '截图已保存',
        screenshotFailed: '截图失败',
        fastForward: '快进',
        mute: '静音',
        unmute: '取消静音',
        volume: '音量',
        fullscreen: '全屏',
        fitWindow: '适配画面',
        fitFailed: '无法适配画面',
        hideControls: '隐藏控制区',
        showControls: '显示控制区',
        saved: '已保存',
        loaded: '已读取',
        noState: '暂无即时存档',
        saveFailed: '保存失败',
        loadFailedShort: '读取失败',
        autoPaused: '已暂停（窗口失焦）',
        paused: '已暂停',
        closing: '正在保存并关闭…',
        keyConflict: '按键映射冲突',
      },
    },
    en: {
      gameWindow: {
        loading: 'Loading game…',
        loadingHint: 'The first core load may take a moment',
        loadFailed: 'Failed to load game',
        loadTimeout: 'Timed out. Retry or check the game folder.',
        retry: 'Retry',
        openFolder: 'Open folder',
        confirm: 'Confirm',
        select: 'Select',
        pause: 'Pause',
        resume: 'Resume',
        save: 'Save',
        load: 'Load',
        restart: 'Restart',
        screenshot: 'Screenshot',
        restarted: 'Restarted',
        screenshotSaved: 'Screenshot saved',
        screenshotFailed: 'Screenshot failed',
        fastForward: 'Fast forward',
        mute: 'Mute',
        unmute: 'Unmute',
        volume: 'Volume',
        fullscreen: 'Fullscreen',
        fitWindow: 'Fit window',
        fitFailed: 'Cannot fit window',
        hideControls: 'Hide controls',
        showControls: 'Show controls',
        saved: 'Saved',
        loaded: 'Loaded',
        noState: 'No save state',
        saveFailed: 'Save failed',
        loadFailedShort: 'Load failed',
        autoPaused: 'Paused (window lost focus)',
        paused: 'Paused',
        closing: 'Saving and closing…',
        keyConflict: 'Key mapping conflict',
      },
    },
  });

  const dom = {
    shell: document.getElementById('game-shell'),
    close: document.getElementById('game-close'),
    min: document.getElementById('game-min'),
    full: document.getElementById('game-full'),
    title: document.getElementById('game-title'),
    engine: document.getElementById('game-engine'),
    status: document.getElementById('game-status'),
    stage: document.getElementById('game-stage'),
    root: document.getElementById('game-root'),
    loading: document.getElementById('game-loading'),
    loadingTitle: document.getElementById('game-loading-title'),
    loadingHint: document.getElementById('game-loading-hint'),
    error: document.getElementById('game-error'),
    errorTitle: document.getElementById('game-error-title'),
    errorMessage: document.getElementById('game-error-message'),
    retry: document.getElementById('game-retry'),
    openFolder: document.getElementById('game-open-folder'),
    controls: document.getElementById('game-controls'),
    start: document.getElementById('ctl-start'),
    select: document.getElementById('ctl-select'),
    pause: document.getElementById('ctl-pause'),
    save: document.getElementById('ctl-save'),
    load: document.getElementById('ctl-load'),
    restart: document.getElementById('ctl-restart'),
    shot: document.getElementById('ctl-shot'),
    ff: document.getElementById('ctl-ff'),
    mute: document.getElementById('ctl-mute'),
    volume: document.getElementById('ctl-volume'),
    fit: document.getElementById('ctl-fit'),
    fullscreen: document.getElementById('ctl-full'),
    hide: document.getElementById('ctl-hide'),
    restore: document.getElementById('game-restore'),
  };

  const state = {
    game: null,
    started: false,
    loading: true,
    paused: false,
    autoPaused: false,
    closing: false,
    muted: false,
    volume: 0.7,
    controlsHidden: false,
    controlsBeforeFullscreen: null,
    fullscreen: false,
    commonKeys: {},
    keymaps: {},
    hotkeys: {},
    inputMap: {},
    hotkeyMap: {},
    pressedKeys: new Set(),
    pressedMouse: new Set(),
    lastSramHash: 0,
    sramBusy: false,
    playStartedAt: 0,
    playedSeconds: 0,
    saveTimer: null,
    loadTimer: null,
    statusTimer: null,
    blurTimer: null,
    cleaning: false,
  };

  function locale() {
    return i18n.getLocale();
  }

  function toUint8(value) {
    if (!value) return null;
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (Array.isArray(value)) return new Uint8Array(value);
    if (value.type === 'Buffer' && Array.isArray(value.data)) return new Uint8Array(value.data);
    return null;
  }

  function numericGameId(id) {
    let hash = 2166136261;
    const text = String(id || 'game');
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) || 1;
  }

  function hashBytes(bytes) {
    let hash = 2166136261;
    for (let i = 0; i < bytes.length; i += 1) {
      hash ^= bytes[i];
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) || 1;
  }

  function manager() {
    const emulator = window.EJS_emulator;
    if (!emulator || !emulator.gameManager) return null;
    return emulator.gameManager;
  }

  function setStatus(text, danger, timeout) {
    if (state.statusTimer) clearTimeout(state.statusTimer);
    dom.status.textContent = text || '';
    dom.status.classList.toggle('is-danger', Boolean(danger));
    if (text) {
      state.statusTimer = setTimeout(() => {
        state.statusTimer = null;
        dom.status.textContent = '';
        dom.status.classList.remove('is-danger');
      }, timeout || 1600);
    }
  }

  function applyLabels() {
    dom.start.textContent = i18n.t('gameWindow.confirm');
    dom.select.textContent = i18n.t('gameWindow.select');
    dom.pause.setAttribute('data-tip', i18n.t('gameWindow.pause'));
    dom.save.setAttribute('data-tip', i18n.t('gameWindow.save'));
    dom.load.setAttribute('data-tip', i18n.t('gameWindow.load'));
    dom.restart.setAttribute('data-tip', i18n.t('gameWindow.restart'));
    dom.shot.setAttribute('data-tip', i18n.t('gameWindow.screenshot'));
    dom.ff.setAttribute('data-tip', i18n.t('gameWindow.fastForward'));
    dom.mute.setAttribute('data-tip', i18n.t('gameWindow.mute'));
    dom.volume.setAttribute('data-tip', i18n.t('gameWindow.volume'));
    dom.fit.setAttribute('data-tip', i18n.t('gameWindow.fitWindow'));
    dom.fullscreen.setAttribute('data-tip', i18n.t('gameWindow.fullscreen'));
    dom.hide.setAttribute('data-tip', i18n.t('gameWindow.hideControls'));
    dom.restore.setAttribute('data-tip', i18n.t('gameWindow.showControls'));
    dom.retry.textContent = i18n.t('gameWindow.retry');
    dom.openFolder.textContent = i18n.t('gameWindow.openFolder');
    dom.loadingTitle.textContent = state.game ? state.game.name : i18n.t('gameWindow.loading');
    dom.loadingHint.textContent = i18n.t('gameWindow.loadingHint');
    dom.errorTitle.textContent = i18n.t('gameWindow.loadFailed');
    renderPauseButton();
    renderMuteButton();
  }

  function applyIcons() {
    dom.close.innerHTML = Icons.trafficClose(6);
    dom.min.innerHTML = Icons.trafficMinimize(6);
    dom.full.innerHTML = Icons.trafficZoom(6);
    dom.pause.innerHTML = Icons.pause(14);
    dom.save.innerHTML = Icons.save(14);
    dom.load.innerHTML = Icons.load(14);
    dom.restart.innerHTML = Icons.refresh(14);
    dom.shot.innerHTML = Icons.image(14);
    dom.ff.innerHTML = Icons.fastForward(14);
    dom.mute.innerHTML = Icons.volume(14);
    dom.fit.innerHTML = Icons.fit(14);
    dom.fullscreen.innerHTML = Icons.fullscreen(14);
    dom.hide.innerHTML = Icons.chevronDown(14);
    dom.restore.innerHTML = Icons.chevronUp(14);
  }

  function renderPauseButton() {
    dom.pause.innerHTML = state.paused ? Icons.play(14) : Icons.pause(14);
    dom.pause.setAttribute('data-tip', i18n.t(state.paused ? 'gameWindow.resume' : 'gameWindow.pause'));
  }

  function renderMuteButton() {
    dom.mute.innerHTML = state.muted || state.volume === 0 ? Icons.volumeOff(14) : Icons.volume(14);
    dom.mute.setAttribute('data-tip', i18n.t(state.muted ? 'gameWindow.unmute' : 'gameWindow.mute'));
  }

  function setTitle(game) {
    dom.title.textContent = game ? game.name : '';
    dom.engine.textContent = game ? game.label || game.engine : '';
  }

  function showLoading(game) {
    state.loading = true;
    dom.loading.classList.remove('hidden');
    dom.error.classList.add('hidden');
    dom.loadingTitle.textContent = game ? game.name : i18n.t('gameWindow.loading');
    dom.loadingHint.textContent = i18n.t('gameWindow.loadingHint');
  }

  function showError(message) {
    state.loading = false;
    dom.loading.classList.add('hidden');
    dom.error.classList.remove('hidden');
    dom.errorTitle.textContent = i18n.t('gameWindow.loadFailed');
    dom.errorMessage.textContent = message || i18n.t('gameWindow.loadFailed');
    if (state.loadTimer) {
      clearTimeout(state.loadTimer);
      state.loadTimer = null;
    }
  }

  function stopSaveTimer() {
    if (state.saveTimer) {
      clearInterval(state.saveTimer);
      state.saveTimer = null;
    }
  }

  function startSaveTimer() {
    stopSaveTimer();
    state.saveTimer = setInterval(() => {
      flushSram(false);
    }, constants.saveIntervalMs);
  }

  function startClock() {
    if (!state.started || state.playStartedAt) return;
    state.playStartedAt = Date.now();
  }

  function pauseClock() {
    if (!state.playStartedAt) return;
    state.playedSeconds += (Date.now() - state.playStartedAt) / 1000;
    state.playStartedAt = 0;
  }

  function currentPlaySeconds() {
    const running = state.playStartedAt ? (Date.now() - state.playStartedAt) / 1000 : 0;
    return Math.max(0, Math.round(state.playedSeconds + running));
  }

  async function persistPlayTime() {
    if (!state.game) return;
    try {
      await games.touch(state.game.id, currentPlaySeconds());
    } catch (err) {
      /* ignore */
    }
  }

  async function flushSram(force) {
    if (!state.started || state.sramBusy) return true;
    const gm = manager();
    if (!gm) return true;
    let data = null;
    try {
      data = gm.getSaveFile();
    } catch (err) {
      return false;
    }
    if (!data || !data.length) return true;
    const hash = hashBytes(data);
    if (!force && hash === state.lastSramHash) return true;
    state.sramBusy = true;
    try {
      const result = await games.saveSram(state.game.id, toUint8(data));
      if (result && result.ok) {
        state.lastSramHash = hash;
        if (force) await persistPlayTime();
        return true;
      }
      return false;
    } catch (err) {
      return false;
    } finally {
      state.sramBusy = false;
    }
  }

  function ensureFsDir(gm, file) {
    const parts = String(file || '').split('/').filter(Boolean);
    let current = '';
    for (const part of parts.slice(0, -1)) {
      current += `/${part}`;
      try {
        if (!gm.FS.analyzePath(current).exists) gm.FS.mkdir(current);
      } catch (err) {
        /* directory may already exist */
      }
    }
  }

  async function loadSramIntoEmulator() {
    const gm = manager();
    if (!gm || !state.game) return;
    try {
      const result = await games.loadSram(state.game.id);
      if (!result || !result.ok || !result.exists) return;
      const data = toUint8(result.data);
      if (!data || !data.length) return;
      const target = gm.getSaveFilePath();
      if (!target) return;
      ensureFsDir(gm, target);
      try {
        if (gm.FS.analyzePath(target).exists) gm.FS.unlink(target);
      } catch (err) {
        /* ignore */
      }
      gm.FS.writeFile(target, data);
      gm.loadSaveFiles();
    } catch (err) {
      setStatus(i18n.t('gameWindow.loadFailedShort'), true);
    }
  }

  function setVolume(value, persist) {
    const next = Math.max(0, Math.min(1, Number(value)));
    state.volume = Number.isFinite(next) ? next : 0.7;
    state.muted = state.volume === 0;
    dom.volume.value = String(state.volume);
    if (window.EJS_emulator && typeof window.EJS_emulator.setVolume === 'function') {
      try {
        window.EJS_emulator.setVolume(state.muted ? 0 : state.volume);
      } catch (err) {
        /* ignore */
      }
    }
    renderMuteButton();
    if (persist) games.setVolume(state.volume);
  }

  function toggleMute() {
    state.muted = !state.muted;
    if (!state.muted && state.volume === 0) state.volume = 0.7;
    if (window.EJS_emulator && typeof window.EJS_emulator.setVolume === 'function') {
      try {
        window.EJS_emulator.setVolume(state.muted ? 0 : state.volume);
      } catch (err) {
        /* ignore */
      }
    }
    renderMuteButton();
  }

  function setPaused(next, auto) {
    if (!state.started) return;
    state.paused = Boolean(next);
    if (state.paused) {
      state.autoPaused = Boolean(auto);
      pauseClock();
      if (window.EJS_emulator && typeof window.EJS_emulator.pause === 'function') {
        try {
          window.EJS_emulator.pause();
        } catch (err) {
          /* ignore */
        }
      }
      flushSram(true);
      setStatus(auto ? i18n.t('gameWindow.autoPaused') : i18n.t('gameWindow.paused'));
    } else {
      state.autoPaused = false;
      startClock();
      if (window.EJS_emulator && typeof window.EJS_emulator.play === 'function') {
        try {
          window.EJS_emulator.play();
        } catch (err) {
          /* ignore */
        }
      }
      setStatus('');
    }
    renderPauseButton();
  }

  function togglePause() {
    if (!state.started) return;
    if (state.paused) setPaused(false, false);
    else setPaused(true, false);
  }

  function setFastForward(on) {
    const gm = manager();
    if (!gm || !state.started) return;
    try {
      gm.toggleFastForward(on ? 1 : 0);
    } catch (err) {
      /* ignore */
    }
    dom.ff.classList.toggle('active', Boolean(on));
  }

  async function saveState() {
    const gm = manager();
    if (!gm || !state.started) return;
    let data;
    try {
      data = gm.getState();
    } catch (err) {
      setStatus(i18n.t('gameWindow.saveFailed'), true);
      return;
    }
    let screenshot = null;
    try {
      screenshot = await Promise.race([
        gm.screenshot(),
        new Promise((resolve) => setTimeout(() => resolve(null), 2500)),
      ]);
    } catch (err) {
      screenshot = null;
    }
    const result = await games.saveState(state.game.id, toUint8(data), screenshot ? toUint8(screenshot) : null);
    if (result && result.ok) setStatus(i18n.t('gameWindow.saved'));
    else setStatus(i18n.t('gameWindow.saveFailed'), true);
  }

  function bytesToDataUrl(bytes) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([bytes], { type: 'image/png' });
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('read-failed'));
      reader.readAsDataURL(blob);
    });
  }

  async function restartGame() {
    const gm = manager();
    if (!gm || !state.started) return;
    try {
      await flushSram(true);
      gm.restart();
      setStatus(i18n.t('gameWindow.restarted'));
    } catch (err) {
      setStatus(i18n.t('gameWindow.loadFailedShort'), true);
    }
  }

  async function takeScreenshot() {
    const gm = manager();
    if (!gm || !state.started || !state.game) return;
    try {
      const bytes = await gm.screenshot();
      const data = toUint8(bytes);
      if (!data) throw new Error('empty');
      const dataUrl = await bytesToDataUrl(data);
      const result = await window.ships.saveImage({ dataUrl, name: `${state.game.name}.png` });
      if (result && result.ok) setStatus(i18n.t('gameWindow.screenshotSaved'));
      else if (result && !result.canceled) setStatus(i18n.t('gameWindow.screenshotFailed'), true);
    } catch (err) {
      setStatus(i18n.t('gameWindow.screenshotFailed'), true);
    }
  }

  async function loadState() {
    const gm = manager();
    if (!gm || !state.started) return;
    const result = await games.loadState(state.game.id);
    if (!result || !result.ok) {
      setStatus(i18n.t('gameWindow.loadFailedShort'), true);
      return;
    }
    if (!result.exists) {
      setStatus(i18n.t('gameWindow.noState'), true);
      return;
    }
    const data = toUint8(result.state);
    if (!data) return;
    try {
      gm.loadState(data);
      setStatus(i18n.t('gameWindow.loaded'));
    } catch (err) {
      setStatus(i18n.t('gameWindow.loadFailedShort'), true);
    }
  }

  function actionMeta(action) {
    const def = constants.actionDefs[action];
    if (!def) return null;
    if (state.game && state.game.engine === 'n64' && def.n64Index != null) {
      return { index: def.n64Index, axis: Boolean(def.n64Axis) };
    }
    return { index: def.index, axis: Boolean(def.axis) };
  }

  function sendAction(action, down) {
    const gm = manager();
    if (!gm || !state.started) return;
    const meta = actionMeta(action);
    if (!meta) return;
    const value = meta.axis ? (down ? 32767 : 0) : down ? 1 : 0;
    try {
      gm.simulateInput(0, meta.index, value);
    } catch (err) {
      /* ignore */
    }
  }

  function buildInputMaps() {
    const engineId = state.game ? state.game.engine : '';
    const engine = constants.engines.find((item) => item.id === engineId) || {};
    const common = {};
    for (const action of engine.commonActions || []) {
      if (state.commonKeys[action]) common[action] = state.commonKeys[action];
    }
    const map = Object.assign({}, common, state.keymaps[engineId] || {});
    const reverse = {};
    for (const [action, binding] of Object.entries(map)) {
      if (!binding) continue;
      if (!reverse[binding]) reverse[binding] = [];
      reverse[binding].push(action);
    }
    state.inputMap = reverse;
    const hotReverse = {};
    for (const [action, binding] of Object.entries(state.hotkeys || {})) {
      if (binding) hotReverse[binding] = action;
    }
    state.hotkeyMap = hotReverse;
  }

  function releaseAllInputs() {
    for (const code of state.pressedKeys) {
      for (const action of state.inputMap[code] || []) sendAction(action, false);
    }
    for (const button of state.pressedMouse) {
      for (const action of state.inputMap[`Mouse${button}`] || []) sendAction(action, false);
    }
    state.pressedKeys.clear();
    state.pressedMouse.clear();
    sendAction('start', false);
    sendAction('select', false);
    setFastForward(false);
  }

  function handleHotkey(action, down) {
    if (action === 'start' || action === 'select') {
      if (down && (!state.started || state.paused)) return;
      sendAction(action, down);
      return;
    }
    if (!down) {
      if (action === 'fastForward') setFastForward(false);
      return;
    }
    if (action === 'pause') {
      if (state.fullscreen) toggleFullscreen();
      else togglePause();
      return;
    }
    if (action === 'quickSave') {
      saveState();
      return;
    }
    if (action === 'quickLoad') {
      loadState();
      return;
    }
    if (action === 'fastForward') {
      setFastForward(true);
      return;
    }
    if (action === 'fullscreen') {
      toggleFullscreen();
      return;
    }
    if (action === 'mute') {
      toggleMute();
      return;
    }
    if (action === 'toggleControls') {
      if (state.fullscreen) return;
      applyControlsHidden(!state.controlsHidden, true);
    }
  }

  function onKeyDown(event) {
    const target = event.target;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    const modifierOnly = /^(Shift|Control|Alt|Meta)(Left|Right)$/.test(event.code || '');
    if ((event.metaKey || event.ctrlKey || event.altKey) && !modifierOnly) return;
    const hotkey = state.hotkeyMap[event.code];
    if (hotkey) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) handleHotkey(hotkey, true);
      return;
    }
    if (!state.started || state.paused) return;
    const actions = state.inputMap[event.code];
    if (!actions || !actions.length) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    state.pressedKeys.add(event.code);
    for (const action of actions) sendAction(action, true);
  }

  function onKeyUp(event) {
    if (state.hotkeyMap[event.code]) {
      handleHotkey(state.hotkeyMap[event.code], false);
    }
    const actions = state.inputMap[event.code];
    if (actions && actions.length) {
      event.preventDefault();
      event.stopPropagation();
      state.pressedKeys.delete(event.code);
      for (const action of actions) sendAction(action, false);
    }
  }

  function onMouseDown(event) {
    if (event.target.closest && event.target.closest('.game-controls, .game-header, .game-restore, .game-overlay')) return;
    if (!state.started || state.paused) return;
    const actions = state.inputMap[`Mouse${event.button}`];
    if (!actions || !actions.length) return;
    event.preventDefault();
    state.pressedMouse.add(event.button);
    for (const action of actions) sendAction(action, true);
  }

  function onMouseUp(event) {
    const actions = state.inputMap[`Mouse${event.button}`];
    if (!actions || !actions.length) return;
    state.pressedMouse.delete(event.button);
    for (const action of actions) sendAction(action, false);
  }

  function applyControlsHidden(hidden, persist) {
    state.controlsHidden = Boolean(hidden);
    dom.shell.classList.toggle('controls-hidden', state.controlsHidden);
    dom.restore.classList.toggle('hidden', !state.controlsHidden);
    refreshStageSize();
    if (persist) games.setControlsHidden(state.controlsHidden);
  }

  function applyFullscreenState(fullscreen) {
    const next = Boolean(fullscreen);
    if (next === state.fullscreen) {
      dom.shell.classList.toggle('game-fullscreen', next);
      return;
    }
    if (next) {
      state.controlsBeforeFullscreen = state.controlsHidden;
      state.fullscreen = true;
      dom.shell.classList.add('game-fullscreen');
      applyControlsHidden(true, false);
    } else {
      state.fullscreen = false;
      dom.shell.classList.remove('game-fullscreen');
      const previous = state.controlsBeforeFullscreen;
      state.controlsBeforeFullscreen = null;
      if (previous !== null) applyControlsHidden(previous, false);
    }
    refreshStageSize();
  }

  async function toggleFullscreen() {
    await window.ships.windowControl('fullscreen');
  }

  function gameAspect() {
    const gm = manager();
    try {
      const aspect = Number(gm && gm.getVideoDimensions && gm.getVideoDimensions('aspect'));
      if (Number.isFinite(aspect) && aspect > 0) return aspect;
    } catch (err) {
      /* fall back to canvas */
    }
    const canvas = document.querySelector('#game-root canvas');
    if (canvas && canvas.width && canvas.height) return canvas.width / canvas.height;
    return 0;
  }

  async function fitWindowToGame() {
    if (state.fullscreen) return;
    const aspect = gameAspect();
    if (!aspect) {
      setStatus(i18n.t('gameWindow.fitFailed'), true);
      return;
    }
    const result = await games.fitWindow(aspect);
    if (result && result.ok) {
      setTimeout(refreshStageSize, 80);
    } else {
      setStatus(i18n.t('gameWindow.fitFailed'), true);
    }
  }

  function refreshStageSize() {
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
      const emulator = window.EJS_emulator;
      if (emulator && typeof emulator.handleResize === 'function') {
        try {
          emulator.handleResize();
        } catch (err) {
          /* ignore */
        }
      }
    });
  }

  function clearDefaultControls() {
    const emulator = window.EJS_emulator;
    if (!emulator || !emulator.controls) return;
    try {
      for (const player of Object.values(emulator.controls)) {
        if (!player || typeof player !== 'object') continue;
        for (const control of Object.values(player)) {
          if (control && typeof control === 'object') control.value = -1;
        }
      }
    } catch (err) {
      /* ignore */
    }
  }

  function onBlur() {
    releaseAllInputs();
    if (state.blurTimer) clearTimeout(state.blurTimer);
    state.blurTimer = setTimeout(() => {
      state.blurTimer = null;
      if (document.hasFocus() || !state.started || state.paused || state.closing) return;
      setPaused(true, true);
    }, constants.blurPauseDelayMs);
  }

  function onFocus() {
    if (state.blurTimer) {
      clearTimeout(state.blurTimer);
      state.blurTimer = null;
    }
    if (state.autoPaused && state.paused && !state.closing) setPaused(false, false);
  }

  async function prepareClose() {
    if (state.closing) return;
    state.closing = true;
    releaseAllInputs();
    pauseClock();
    stopSaveTimer();
    setStatus(i18n.t('gameWindow.closing'));
    try {
      await flushSram(true);
      await persistPlayTime();
    } finally {
      try {
        await games.closeNow();
      } catch (err) {
        /* window is already gone */
      }
    }
  }

  async function switchGame(next) {
    if (!next) return;
    pauseClock();
    releaseAllInputs();
    const ok = await flushSram(true);
    if (!ok) {
      startClock();
      setStatus(i18n.t('gameWindow.saveFailed'), true);
      return;
    }
    await persistPlayTime();
    const ready = await games.loadReady(next.id);
    if (!ready || !ready.ok) {
      startClock();
      setStatus(i18n.t('gameWindow.loadFailed'), true);
      return;
    }
    window.location.reload();
  }

  function bindUi() {
    dom.close.addEventListener('click', () => window.ships.windowControl('close'));
    dom.min.addEventListener('click', () => window.ships.windowControl('minimize'));
    dom.full.addEventListener('click', toggleFullscreen);
    dom.retry.addEventListener('click', () => window.location.reload());
    dom.openFolder.addEventListener('click', () => games.openWorkdir());
    dom.pause.addEventListener('click', togglePause);
    dom.save.addEventListener('click', saveState);
    dom.load.addEventListener('click', loadState);
    dom.restart.addEventListener('click', restartGame);
    dom.shot.addEventListener('click', takeScreenshot);
    dom.ff.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      setFastForward(true);
    });
    dom.ff.addEventListener('pointerup', () => setFastForward(false));
    dom.ff.addEventListener('pointerleave', () => setFastForward(false));
    dom.mute.addEventListener('click', toggleMute);
    dom.volume.addEventListener('input', () => setVolume(Number(dom.volume.value), false));
    dom.volume.addEventListener('change', () => setVolume(Number(dom.volume.value), true));
    dom.fit.addEventListener('click', fitWindowToGame);
    dom.fullscreen.addEventListener('click', toggleFullscreen);
    dom.hide.addEventListener('click', () => applyControlsHidden(true, true));
    dom.restore.addEventListener('click', () => applyControlsHidden(false, true));

    const hold = (button, action) => {
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        button.classList.add('active');
        sendAction(action, true);
      });
      const release = () => {
        button.classList.remove('active');
        sendAction(action, false);
      };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointerleave', release);
      button.addEventListener('pointercancel', release);
    };
    hold(dom.start, 'start');
    hold(dom.select, 'select');

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    dom.stage.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    dom.stage.addEventListener('contextmenu', (event) => event.preventDefault());
    window.addEventListener('dragover', (event) => event.preventDefault());
    window.addEventListener('drop', (event) => event.preventDefault());
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && state.started && !state.paused) setPaused(true, true);
    });

    games.onFullscreen((payload) => applyFullscreenState(Boolean(payload && payload.fullscreen)));
    games.onPrepareClose(() => {
      prepareClose().catch(() => {});
    });
    games.onLoad((payload) => {
      switchGame(payload && payload.game).catch(() => {});
    });

    window.ships.onSettingsChanged((next) => {
      if (!next) return;
      state.commonKeys = next.gameCommonKeys || state.commonKeys;
      state.keymaps = next.gameKeymaps || state.keymaps;
      state.hotkeys = next.gameHotkeys || state.hotkeys;
      buildInputMaps();
      if (typeof next.gameVolume === 'number' && !state.muted) {
        state.volume = next.gameVolume;
        dom.volume.value = String(state.volume);
        if (window.EJS_emulator) setVolume(state.volume, false);
      }
      if (next.locale && next.locale !== i18n.getLocale()) {
        i18n.setLocale(next.locale);
        applyLabels();
      }
      window.ShipsTheme.set(next);
    });
  }

  function onGameStart() {
    if (state.loadTimer) {
      clearTimeout(state.loadTimer);
      state.loadTimer = null;
    }
    state.started = true;
    state.loading = false;
    clearDefaultControls();
    state.paused = false;
    state.autoPaused = false;
    dom.loading.classList.add('hidden');
    dom.error.classList.add('hidden');
    startClock();
    startSaveTimer();
    renderPauseButton();
    setVolume(state.volume, false);
    loadSramIntoEmulator();
  }

  function initEmulator(game) {
    state.game = game;
    buildInputMaps();
    setTitle(game);
    showLoading(game);

    window.EJS_pathtodata = `game://app/${constants.emulatorDir}/`;
    window.EJS_player = '#game-root';
    window.EJS_core = game.core;
    window.EJS_gameUrl = game.romUrl;
    window.EJS_gameName = game.name;
    window.EJS_gameID = numericGameId(game.id);
    window.EJS_startOnLoaded = true;
    window.EJS_volume = state.volume;
    window.EJS_disableLocalStorage = true;
    window.EJS_language = 'en-US';
    window.EJS_disableAutoLang = false;
    window.EJS_cacheConfig = { enabled: false };
    window.EJS_backgroundColor = '#000';
    window.EJS_Buttons = {
      playPause: false,
      restart: false,
      mute: false,
      settings: false,
      fullscreen: false,
      saveState: false,
      loadState: false,
      screenRecord: false,
      gamepad: false,
      cheat: false,
      volume: false,
      saveSavFiles: false,
      loadSavFiles: false,
      quickSave: false,
      quickLoad: false,
      screenshot: false,
      cacheManager: false,
      exitEmulation: false,
    };
    window.EJS_onGameStart = onGameStart;
    window.EJS_onExit = () => {
      if (!state.closing) setStatus(i18n.t('gameWindow.paused'));
    };

    state.loadTimer = setTimeout(() => {
      if (!state.started) showError(i18n.t('gameWindow.loadTimeout'));
    }, 45000);

    const script = document.createElement('script');
    script.src = `../../assets/emulatorjs/${constants.emulatorVersion}/loader.js`;
    script.onerror = () => showError(i18n.t('gameWindow.loadFailed'));
    document.body.appendChild(script);
  }

  async function boot() {
    applyIcons();
    applyLabels();
    bindUi();
    const info = await games.windowInfo();
    if (!info || !info.ok) {
      showError((info && info.error) || i18n.t('gameWindow.loadFailed'));
      return;
    }
    i18n.setLocale(info.settings.locale || 'zh');
    window.ShipsTheme.set(info.settings);
    state.commonKeys = info.settings.gameCommonKeys || games.constants.defaultCommonKeys;
    state.keymaps = info.settings.gameKeymaps || games.constants.defaultKeymaps;
    state.hotkeys = info.settings.gameHotkeys || games.constants.defaultHotkeys;
    state.volume = Number.isFinite(info.settings.gameVolume) ? info.settings.gameVolume : 0.7;
    state.controlsHidden = Boolean(info.settings.gameControlsHidden);
    buildInputMaps();
    applyLabels();
    applyControlsHidden(state.controlsHidden, false);
    dom.volume.value = String(state.volume);
    renderMuteButton();
    initEmulator(info.game);
  }

  boot().catch((err) => showError(err && err.message ? err.message : String(err)));
})();
