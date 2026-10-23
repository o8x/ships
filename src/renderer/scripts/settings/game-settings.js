'use strict';

(function registerGameSettings() {
  const { Icons, el, section } = window.ShipsUI;
  const i18n = window.ShipsI18n;
  const games = window.ships.games;
  const constants = games.constants;

  i18n.extend({
    zh: {
      gamesSettings: {
        title: '游戏',
        subtitle: '配置游戏工作目录、通用按键与模拟器快捷键',
        workdir: '工作目录',
        workdirHint: 'ROM 放在 roms/<引擎>/，存档自动写入 profiles/',
        workdirDefault: '默认',
        workdirCustom: '自定义',
        choose: '选择目录',
        resetDefault: '重置为默认',
        open: '打开目录',
        workdirFailed: '无法使用该目录：{error}',
        workdirSaved: '工作目录已更新',
        bios: 'FDS BIOS（disksys.rom）',
        biosHint: '运行 .fds 游戏需要该文件；默认未配置',
        biosChoose: '选择文件',
        biosClear: '清除',
        biosUnset: '未配置',
        biosSet: '已配置',
        biosSaved: 'FDS BIOS 已更新',
        biosFailed: '无法使用该文件：{error}',
        keys: '通用按键',
        keysHint: '四个平台共用（X/Y 仅 SFC、L/R 除 FC）；方向键在 N64 映射到摇杆。点击键帽后按新键，Esc 取消，Backspace 清除',
        platformKeys: '平台专有按键',
        pcPreset: '恢复 PC 风格（鼠标）',
        traditionalPreset: '恢复传统风格（不使用鼠标）',
        presetHint: '未自定义时默认使用 PC 风格',
        engineReset: '恢复该引擎默认',
        resetConfirm: '确认恢复默认？',
        conflict: '该按键已被占用',
        invalid: '不支持这个按键',
        saveFailed: '保存失败：{error}',
        hotkeys: '功能快捷键',
        hotkeysHint: '含 Start / Select；对四个引擎共用，仅在游戏窗口聚焦时生效',
        unique: '{engine} 模拟器专用',
        press: '请按键…',
        unbound: '未绑定',
        mouseLeft: '鼠标左键',
        mouseRight: '鼠标右键',
        mouseMiddle: '鼠标中键',
        arrowUp: '↑',
        arrowDown: '↓',
        arrowLeft: '←',
        arrowRight: '→',
      },
    },
    en: {
      gamesSettings: {
        title: 'Games',
        subtitle: 'Configure the game folder, shared keys and emulator hotkeys',
        workdir: 'Working folder',
        workdirHint: 'ROMs go in roms/<engine>/; saves are written to profiles/',
        workdirDefault: 'Default',
        workdirCustom: 'Custom',
        choose: 'Choose folder',
        resetDefault: 'Reset to default',
        open: 'Open folder',
        workdirFailed: 'Cannot use this folder: {error}',
        workdirSaved: 'Working folder updated',
        bios: 'FDS BIOS (disksys.rom)',
        biosHint: 'Required for .fds games; not configured by default',
        biosChoose: 'Choose file',
        biosClear: 'Clear',
        biosUnset: 'Not configured',
        biosSet: 'Configured',
        biosSaved: 'FDS BIOS updated',
        biosFailed: 'Cannot use this file: {error}',
        keys: 'Shared keys',
        keysHint: 'Shared by all platforms (X/Y only on SFC; L/R except FC); directions map to the analog stick on N64. Click a key cap, then press a key. Esc cancels, Backspace clears',
        platformKeys: 'Platform-specific keys',
        pcPreset: 'PC preset (mouse)',
        traditionalPreset: 'Traditional preset (keyboard only)',
        presetHint: 'PC preset is used until you customize',
        engineReset: 'Reset this engine',
        resetConfirm: 'Reset to defaults?',
        conflict: 'That key is already used',
        invalid: 'Unsupported key',
        saveFailed: 'Save failed: {error}',
        hotkeys: 'Hotkeys',
        hotkeysHint: 'Includes Start / Select; shared by all engines and active while the game window is focused',
        unique: '{engine} only',
        press: 'Press a key…',
        unbound: 'Unbound',
        mouseLeft: 'Mouse left',
        mouseRight: 'Mouse right',
        mouseMiddle: 'Mouse middle',
        arrowUp: '↑',
        arrowDown: '↓',
        arrowLeft: '←',
        arrowRight: '→',
      },
    },
  });

  function row(labelText, hintText, control) {
    const wrap = el('div', { class: 'row-card' });
    const text = el('div', { class: 'min-w-0 flex-1' });
    text.append(el('div', { class: 'text-[13px] text-fg' }, labelText));
    if (hintText) text.appendChild(el('div', { class: 'text-[10px] text-fg-muted' }, hintText));
    wrap.append(text, control);
    return wrap;
  }

  function prettyBinding(value) {
    const binding = String(value || '');
    if (!binding) return i18n.t('gamesSettings.unbound');
    if (binding === 'Mouse0') return i18n.t('gamesSettings.mouseLeft');
    if (binding === 'Mouse1') return i18n.t('gamesSettings.mouseRight');
    if (binding === 'Mouse2') return i18n.t('gamesSettings.mouseMiddle');
    if (binding === 'ArrowUp') return i18n.t('gamesSettings.arrowUp');
    if (binding === 'ArrowDown') return i18n.t('gamesSettings.arrowDown');
    if (binding === 'ArrowLeft') return i18n.t('gamesSettings.arrowLeft');
    if (binding === 'ArrowRight') return i18n.t('gamesSettings.arrowRight');
    if (binding === 'Space') return 'Space';
    if (binding === 'Enter') return 'Enter';
    if (binding === 'Tab') return 'Tab';
    if (binding === 'Escape') return 'Esc';
    if (binding === 'Backspace') return 'Backspace';
    if (binding === 'Delete') return 'Delete';
    if (/^Key[A-Z]$/.test(binding)) return binding.slice(3);
    if (/^Digit[0-9]$/.test(binding)) return binding.slice(5);
    if (/^F([1-9]|1[0-9]|2[0-4])$/.test(binding)) return binding;
    if (/^Shift(Left|Right)$/.test(binding)) return 'Shift';
    if (/^Control(Left|Right)$/.test(binding)) return 'Ctrl';
    if (/^Alt(Left|Right)$/.test(binding)) return 'Alt';
    if (/^Meta(Left|Right)$/.test(binding)) return 'Cmd';
    if (binding === 'NumpadEnter') return 'Num Enter';
    return binding;
  }

  function localeLabel(table, key) {
    const item = table && table[key];
    if (!item) return key;
    return item[i18n.getLocale()] || item.zh || key;
  }

  function keyControl(options) {
    const button = el('button', {
      class: 'keycap',
      type: 'button',
      'data-capturing': 'false',
    });
    const note = el('div', { class: 'keycap-note' }, '');
    const root = el('div', { class: 'keycap-wrap' });
    root.append(button, note);
    let value = options.value || '';
    let capturing = false;
    let cleanup = null;
    let suppressNextClick = false;

    function render() {
      button.textContent = capturing ? i18n.t('gamesSettings.press') : prettyBinding(value);
      button.classList.toggle('capturing', capturing);
      button.dataset.capturing = capturing ? 'true' : 'false';
    }

    function stopCapture() {
      capturing = false;
      if (cleanup) {
        cleanup();
        cleanup = null;
      }
      render();
    }

    async function commit(next) {
      note.textContent = '';
      const result = await options.save(next);
      if (!result || !result.ok) {
        note.textContent =
          result && result.error === 'conflict'
            ? i18n.t('gamesSettings.conflict')
            : result && result.error === 'invalid'
              ? i18n.t('gamesSettings.invalid')
              : i18n.t('gamesSettings.saveFailed', { error: (result && result.error) || 'error' });
        stopCapture();
        return;
      }
      value = next;
      stopCapture();
    }

    function beginCapture() {
      if (capturing) return;
      capturing = true;
      note.textContent = '';
      render();
      const onKey = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.key === 'Escape') {
          stopCapture();
          return;
        }
        if (event.code === 'Backspace' || event.code === 'Delete') {
          commit('');
          return;
        }
        if (!event.code) {
          note.textContent = i18n.t('gamesSettings.invalid');
          return;
        }
        commit(event.code);
      };
      const onContext = (event) => event.preventDefault();
      document.addEventListener('keydown', onKey, true);
      document.addEventListener('contextmenu', onContext, true);
      cleanup = () => {
        document.removeEventListener('keydown', onKey, true);
        document.removeEventListener('contextmenu', onContext, true);
      };
    }

    button.addEventListener('click', () => {
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }
      beginCapture();
    });
    button.addEventListener('mousedown', (event) => {
      if (!capturing) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.button > 2) return;
      suppressNextClick = true;
      commit(`Mouse${event.button}`);
    });
    button.addEventListener('blur', () => {
      if (capturing) stopCapture();
    });

    render();
    return {
      root,
      setValue(next) {
        value = next || '';
        if (!capturing) render();
      },
      destroy() {
        if (cleanup) cleanup();
      },
    };
  }

  let activeCleanups = [];

  function mount(pane, ctx) {
    const wrap = section();
    activeCleanups = [];
    wrap.appendChild(el('div', { class: 'text-[12px] text-fg-muted' }, i18n.t('gamesSettings.subtitle')));

    /* ------------------------------ 工作目录 ------------------------------ */
    const workdirCard = el('div', { class: 'game-settings-card' });
    const workdirHead = el('div', { class: 'flex items-center justify-between gap-3' });
    const workdirText = el('div', { class: 'min-w-0 flex-1' });
    workdirText.append(
      el('div', { class: 'text-[13px] font-medium text-fg' }, i18n.t('gamesSettings.workdir')),
      el('div', { class: 'mt-0.5 text-[10px] text-fg-muted' }, i18n.t('gamesSettings.workdirHint'))
    );
    const workdirBadge = el('span', { class: 'game-settings-badge' }, '');
    workdirHead.append(workdirText, workdirBadge);

    const pathRow = el('div', { class: 'game-settings-path-row' });
    const pathLine = el('div', { class: 'game-settings-path font-mono', title: '' });
    const chooseBtn = el('button', { class: 'btn shrink-0 px-2 py-1.5 text-[12px]', type: 'button' }, i18n.t('gamesSettings.choose'));
    const resetBtn = el('button', { class: 'btn shrink-0 px-2 py-1.5 text-[12px]', type: 'button' }, i18n.t('gamesSettings.resetDefault'));
    const openBtn = el('button', { class: 'btn shrink-0 px-2 py-1.5 text-[12px]', type: 'button' }, i18n.t('gamesSettings.open'));
    pathRow.append(pathLine, chooseBtn, resetBtn, openBtn);
    const workdirNote = el('div', { class: 'game-settings-note' }, '');
    workdirCard.append(workdirHead, pathRow, workdirNote);
    wrap.appendChild(workdirCard);

    async function refreshWorkdir() {
      const scan = await games.scan();
      if (!scan || !scan.ok) {
        workdirNote.textContent = i18n.t('gamesSettings.workdirFailed', {
          error: (scan && scan.error) || 'error',
        });
        workdirNote.classList.add('is-danger');
        return;
      }
      workdirNote.classList.remove('is-danger');
      const path = scan.resolvedWorkDir || scan.workDir || '';
      pathLine.textContent = path;
      pathLine.title = path;
      workdirBadge.textContent = scan.isDefault
        ? i18n.t('gamesSettings.workdirDefault')
        : i18n.t('gamesSettings.workdirCustom');
    }

    chooseBtn.addEventListener('click', async () => {
      const choice = await games.selectWorkdir();
      if (!choice || !choice.path) return;
      const result = await games.setWorkdir(choice.path);
      if (!result || !result.ok) {
        workdirNote.textContent = i18n.t('gamesSettings.workdirFailed', {
          error: (result && result.error) || 'error',
        });
        workdirNote.classList.add('is-danger');
        return;
      }
      workdirNote.textContent = i18n.t('gamesSettings.workdirSaved');
      workdirNote.classList.remove('is-danger');
      refreshWorkdir();
    });
    resetBtn.addEventListener('click', async () => {
      const result = await games.setWorkdir('');
      if (!result || !result.ok) {
        workdirNote.textContent = i18n.t('gamesSettings.workdirFailed', {
          error: (result && result.error) || 'error',
        });
        workdirNote.classList.add('is-danger');
        return;
      }
      workdirNote.textContent = i18n.t('gamesSettings.workdirSaved');
      workdirNote.classList.remove('is-danger');
      refreshWorkdir();
    });
    openBtn.addEventListener('click', () => games.openWorkdir());
    refreshWorkdir();

    /* ------------------------------ FDS BIOS ------------------------------ */
    const biosCard = el('div', { class: 'game-settings-card' });
    const biosHead = el('div', { class: 'flex items-center justify-between gap-3' });
    const biosText = el('div', { class: 'min-w-0 flex-1' });
    biosText.append(
      el('div', { class: 'text-[13px] font-medium text-fg' }, i18n.t('gamesSettings.bios')),
      el('div', { class: 'mt-0.5 text-[10px] text-fg-muted' }, i18n.t('gamesSettings.biosHint'))
    );
    const biosBadge = el('span', { class: 'game-settings-badge' }, '');
    biosHead.append(biosText, biosBadge);

    const biosRow = el('div', { class: 'game-settings-path-row' });
    const biosPathLine = el('div', { class: 'game-settings-path font-mono', title: '' });
    const biosChooseBtn = el('button', { class: 'btn shrink-0 px-2 py-1.5 text-[12px]', type: 'button' }, i18n.t('gamesSettings.biosChoose'));
    const biosClearBtn = el('button', { class: 'btn shrink-0 px-2 py-1.5 text-[12px]', type: 'button' }, i18n.t('gamesSettings.biosClear'));
    biosRow.append(biosPathLine, biosChooseBtn, biosClearBtn);
    const biosNote = el('div', { class: 'game-settings-note' }, '');
    biosCard.append(biosHead, biosRow, biosNote);
    wrap.appendChild(biosCard);

    let biosPath = ctx.settings.gameFdsBios || '';

    function renderBios() {
      biosPathLine.textContent = biosPath || i18n.t('gamesSettings.biosUnset');
      biosPathLine.title = biosPath || '';
      biosBadge.textContent = biosPath ? i18n.t('gamesSettings.biosSet') : i18n.t('gamesSettings.biosUnset');
      biosClearBtn.disabled = !biosPath;
      biosClearBtn.classList.toggle('opacity-50', !biosPath);
    }

    function applyBiosResult(result) {
      if (!result || !result.ok) {
        biosNote.textContent = i18n.t('gamesSettings.biosFailed', {
          error: (result && result.error) || 'error',
        });
        biosNote.classList.add('is-danger');
        return;
      }
      biosPath = result.path || '';
      biosNote.textContent = i18n.t('gamesSettings.biosSaved');
      biosNote.classList.remove('is-danger');
      renderBios();
    }

    biosChooseBtn.addEventListener('click', async () => {
      const choice = await games.selectBios();
      if (!choice || !choice.path) return;
      applyBiosResult(await games.setBios(choice.path));
    });
    biosClearBtn.addEventListener('click', async () => {
      applyBiosResult(await games.setBios(''));
    });
    renderBios();

    /* ------------------------------ 通用按键 ------------------------------ */
    const keysTitle = el('div', { class: 'game-settings-section-head' });
    const keysTop = el('div', { class: 'game-settings-section-top' });
    keysTop.append(el('div', { class: 'game-settings-section-title' }, i18n.t('gamesSettings.keys')));
    keysTitle.append(
      keysTop,
      el('div', { class: 'game-settings-section-hint' }, i18n.t('gamesSettings.keysHint'))
    );
    wrap.appendChild(keysTitle);

    const commonKeys = Object.assign({}, constants.defaultCommonKeys, ctx.settings.gameCommonKeys || {});
    const commonCard = el('div', { class: 'game-settings-card' });
    const commonControls = [];
    const commonControlMap = {};

    function saveCommon(maps) {
      return games.setCommonKeys(maps).then((result) => {
        if (result && result.ok) {
          for (const key of Object.keys(commonKeys)) delete commonKeys[key];
          Object.assign(commonKeys, result.maps || {});
        }
        return result;
      });
    }

    for (const action of constants.commonActions) {
      const control = keyControl({
        value: commonKeys[action] || '',
        save(next) {
          const map = Object.assign({}, commonKeys);
          if (next) map[action] = next;
          else delete map[action];
          const values = Object.values(map).filter(Boolean);
          if (new Set(values).size !== values.length) return Promise.resolve({ ok: false, error: 'conflict' });
          return saveCommon(map);
        },
      });
      const r = el('div', { class: 'game-settings-key-row' });
      r.append(el('span', { class: 'text-[13px] text-fg' }, localeLabel(constants.actionLabels, action)), control.root);
      commonCard.appendChild(r);
      commonControls.push(control);
      commonControlMap[action] = control;
    }
    const presetRow = el('div', { class: 'game-settings-preset-row' });
    const pcPresetBtn = el('button', { class: 'btn px-2 py-1 text-[11px]', type: 'button' }, i18n.t('gamesSettings.pcPreset'));
    const traditionalPresetBtn = el('button', { class: 'btn px-2 py-1 text-[11px]', type: 'button' }, i18n.t('gamesSettings.traditionalPreset'));
    presetRow.append(
      el('span', { class: 'game-settings-preset-hint' }, i18n.t('gamesSettings.presetHint')),
      pcPresetBtn,
      traditionalPresetBtn
    );
    commonCard.appendChild(presetRow);
    wrap.appendChild(commonCard);

    pcPresetBtn.addEventListener('click', () => applyPreset('pc'));
    traditionalPresetBtn.addEventListener('click', () => applyPreset('traditional'));

    const keymaps = Object.assign({}, constants.defaultKeymaps, ctx.settings.gameKeymaps || {});
    const engineControls = [];

    function saveEngine(engineId, maps) {
      return games.setKeymap(engineId, maps).then((result) => {
        if (result && result.ok) {
          keymaps[engineId] = (result.maps && result.maps[engineId]) || maps;
        }
        return result;
      });
    }

    const specificEngines = constants.engines.filter((engine) => engine.actions && engine.actions.length);
    if (specificEngines.length) {
      const specificTitle = el('div', { class: 'game-settings-section-head' });
      specificTitle.appendChild(el('div', { class: 'game-settings-section-title' }, i18n.t('gamesSettings.platformKeys')));
      wrap.appendChild(specificTitle);
    }

    for (const engine of specificEngines) {
      const card = el('div', { class: 'game-settings-card' });
      const head = el('div', { class: 'game-settings-engine-head' });
      const title = el('div', { class: 'game-settings-engine-title' }, engine.label);
      const resetEngineBtn = el('button', { class: 'btn px-2 py-1 text-[11px]', type: 'button' }, i18n.t('gamesSettings.engineReset'));
      head.append(title, resetEngineBtn);
      card.appendChild(head);

      const rows = [];
      const controls = [];
      for (const action of engine.actions) {
        const unique = (constants.uniqueActions[engine.id] || []).includes(action);
        const label = localeLabel(constants.actionLabels, action);
        const control = keyControl({
          value: (keymaps[engine.id] || {})[action] || '',
          save(next) {
            const current = Object.assign({}, keymaps[engine.id] || {});
            if (next) current[action] = next;
            else delete current[action];
            const values = Object.values(current).filter(Boolean);
            if (new Set(values).size !== values.length) return Promise.resolve({ ok: false, error: 'conflict' });
            return saveEngine(engine.id, current);
          },
        });
        const labelWrap = el('div', { class: 'flex min-w-0 items-center gap-2' });
        labelWrap.appendChild(el('span', { class: 'text-[13px] text-fg' }, label));
        if (unique) {
          labelWrap.appendChild(
            el('span', { class: 'game-settings-unique' }, i18n.t('gamesSettings.unique', { engine: engine.label }))
          );
        }
        const r = el('div', { class: 'game-settings-key-row' });
        r.append(labelWrap, control.root);
        card.appendChild(r);
        rows.push({ action, control });
        controls.push(control);
      }

      resetEngineBtn.addEventListener('click', async () => {
        if (!window.confirm(i18n.t('gamesSettings.resetConfirm'))) return;
        const defaults = Object.assign({}, constants.defaultKeymaps[engine.id] || {});
        const result = await saveEngine(engine.id, defaults);
        if (!result || !result.ok) return;
        for (const item of rows) item.control.setValue(defaults[item.action] || '');
      });

      wrap.appendChild(card);
      engineControls.push({ engine, controls, rows });
    }

    async function applyPreset(presetKey) {
      const preset = (constants.keyPresets && constants.keyPresets[presetKey]) || constants.keyPresets.pc;
      const result = await games.setAllKeys(preset.common, preset.engines);
      if (!result || !result.ok) return;
      for (const key of Object.keys(commonKeys)) delete commonKeys[key];
      Object.assign(commonKeys, preset.common);
      for (const action of constants.commonActions) {
        const control = commonControlMap[action];
        if (control) control.setValue((preset.common || {})[action] || '');
      }
      for (const engine of constants.engines) {
        keymaps[engine.id] = Object.assign({}, (preset.engines || {})[engine.id] || {});
      }
      for (const item of engineControls) {
        const map = (preset.engines || {})[item.engine.id] || {};
        for (const rowItem of item.rows) rowItem.control.setValue(map[rowItem.action] || '');
      }
    }

    /* --------------------------- 功能快捷键 --------------------------- */
    const hotTitle = el('div', { class: 'game-settings-section-head' });
    hotTitle.append(
      el('div', { class: 'game-settings-section-title' }, i18n.t('gamesSettings.hotkeys')),
      el('div', { class: 'game-settings-section-hint' }, i18n.t('gamesSettings.hotkeysHint'))
    );
    wrap.appendChild(hotTitle);

    const hotCard = el('div', { class: 'game-settings-card' });
    const hotkeys = Object.assign({}, constants.defaultHotkeys, ctx.settings.gameHotkeys || {});
    const hotControls = {};
    for (const action of Object.keys(constants.defaultHotkeys)) {
      const control = keyControl({
        value: hotkeys[action] || '',
        save(next) {
          const map = Object.assign({}, hotkeys);
          if (next) map[action] = next;
          else delete map[action];
          const values = Object.values(map).filter(Boolean);
          if (new Set(values).size !== values.length) return Promise.resolve({ ok: false, error: 'conflict' });
          return games.setHotkeys(map).then((result) => {
            if (result && result.ok) {
              for (const key of Object.keys(hotkeys)) delete hotkeys[key];
              Object.assign(hotkeys, result.maps);
            }
            return result;
          });
        },
      });
      const r = el('div', { class: 'game-settings-key-row' });
      r.append(
        el('span', { class: 'text-[13px] text-fg' }, localeLabel(constants.hotkeyLabels, action)),
        control.root
      );
      hotCard.appendChild(r);
      hotControls[action] = control;
      activeCleanups.push(control);
    }
    wrap.appendChild(hotCard);

    for (const control of commonControls) activeCleanups.push(control);
    for (const engine of engineControls) {
      for (const control of engine.controls) activeCleanups.push(control);
    }

    pane.appendChild(wrap);

    const offSettings = window.ships.onSettingsChanged((next) => {
      const nextCommon = next.gameCommonKeys || {};
      for (const action of constants.commonActions) {
        const control = commonControlMap[action];
        if (control) control.setValue(nextCommon[action] || '');
      }
      for (const key of Object.keys(commonKeys)) delete commonKeys[key];
      Object.assign(commonKeys, nextCommon);
      const nextMaps = next.gameKeymaps || {};
      for (const engine of engineControls) {
        const map = nextMaps[engine.engine.id] || constants.defaultKeymaps[engine.engine.id] || {};
        for (const item of engine.rows) item.control.setValue(map[item.action] || '');
        keymaps[engine.engine.id] = Object.assign({}, map);
      }
      const nextHotkeys = next.gameHotkeys || {};
      for (const action of Object.keys(hotControls)) {
        hotControls[action].setValue(nextHotkeys[action] || '');
      }
      for (const key of Object.keys(hotkeys)) delete hotkeys[key];
      Object.assign(hotkeys, nextHotkeys);
      if (Object.prototype.hasOwnProperty.call(next, 'gameWorkDir')) refreshWorkdir();
    });

    return () => {
      if (typeof offSettings === 'function') offSettings();
      for (const control of activeCleanups) control.destroy();
      activeCleanups = [];
    };
  }

  window.ShipsSettingsRegistry.register({
    id: 'games',
    icon: 'gamepad',
    labelKey: 'gamesSettings.title',
    mount,
  });
})();
