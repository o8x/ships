'use strict';

/* Detached file-manager window: an always-on-top panel with a dedicated SSH
   connection bar (saved-host picker + manual username / host / port / password or
   key), plus the shared file manager. The window always uses the light theme and a
   pure white background, independent of the main window's theme. */

(function bootstrapFileWindow() {
  const i18n = window.ShipsI18n;
  const { Icons, el, createSelect, segmented } = window.ShipsUI;

  i18n.extend({
    zh: {
      fileWin: {
        sshPlaceholder: '选择已保存的主机',
        userPlaceholder: '用户名',
        hostPlaceholder: '地址 / IP',
        portPlaceholder: '端口',
        passwordPlaceholder: '密码',
        keyPlaceholder: '私钥路径（留空用默认）',
        password: '密码',
        key: '密钥',
        connect: '连接',
        chooseKey: '选择私钥文件',
        showPassword: '显示密码',
        hidePassword: '隐藏密码',
        listFailed: '读取主机失败',
        ungrouped: '未分组',
      },
    },
    en: {
      fileWin: {
        sshPlaceholder: 'Choose a saved host',
        userPlaceholder: 'User',
        hostPlaceholder: 'Address / IP',
        portPlaceholder: 'Port',
        passwordPlaceholder: 'Password',
        keyPlaceholder: 'Private key path (blank = default)',
        password: 'Password',
        key: 'Key',
        connect: 'Connect',
        chooseKey: 'Choose private key',
        showPassword: 'Show password',
        hidePassword: 'Hide password',
        listFailed: 'Cannot read hosts',
        ungrouped: 'Ungrouped',
      },
    },
  });

  // 独立文件窗口使用**原生标题栏 / 红绿灯**，字号固定 14px，
  // 不再跟随终端设置，也不支持 Cmd +/- 缩放（字号变量见 styles/tailwind.css 的 body.file-window）。
  const formEl = document.getElementById('file-ssh-form');
  const rootEl = document.getElementById('file-root');

  let manager = null;
  let picker = null;
  let hosts = [];
  let currentTarget = '';
  let authMode = 'key';
  let filling = false;
  // 密码 / 密钥互斥：共用同一个输入框，按当前认证方式各自保留草稿。
  const drafts = { password: '', key: '' };
  let passwordVisible = false;
  // 连接按钮状态：连接中禁用；成功后保持禁用，直到用户修改任一字段；失败后恢复可用。
  let connectionState = 'idle';
  let dirty = true;

  let userInput = null;
  let hostInput = null;
  let portInput = null;
  let authSeg = null;
  let credentialInput = null;
  let credentialBtn = null;
  let connectBtn = null;

  function connInput(placeholder, extraClass, attrs) {
    return el(
      'input',
      Object.assign(
        {
          class: `file-conn-input ${extraClass || ''}`.trim(),
          type: 'text',
          spellcheck: 'false',
          autocomplete: 'off',
          placeholder,
        },
        attrs || {}
      )
    );
  }

  function hostByAlias(alias) {
    return hosts.find((host) => host.alias === alias) || null;
  }

  function parseAddress(token) {
    const value = String(token || '').trim();
    if (!value) return null;
    const at = value.lastIndexOf('@');
    return {
      user: at >= 0 ? value.slice(0, at) : '',
      host: at >= 0 ? value.slice(at + 1) : value,
    };
  }

  function updateConnectButton() {
    if (!connectBtn) return;
    connectBtn.disabled = connectionState === 'connecting' || (connectionState === 'connected' && !dirty);
  }

  function markDirty() {
    if (filling) return;
    dirty = true;
    updateConnectButton();
  }

  function syncCredentialInput() {
    if (!credentialInput || !credentialBtn) return;
    if (authMode === 'password') {
      credentialInput.type = passwordVisible ? 'text' : 'password';
      credentialInput.placeholder = i18n.t('fileWin.passwordPlaceholder');
      credentialBtn.innerHTML = (passwordVisible ? Icons.eyeOff : Icons.eye)(13);
      credentialBtn.setAttribute('data-tip', i18n.t(passwordVisible ? 'fileWin.hidePassword' : 'fileWin.showPassword'));
    } else {
      credentialInput.type = 'text';
      credentialInput.placeholder = i18n.t('fileWin.keyPlaceholder');
      credentialBtn.innerHTML = Icons.folder(13);
      credentialBtn.setAttribute('data-tip', i18n.t('fileWin.chooseKey'));
    }
  }

  function setAuth(mode) {
    const next = mode === 'password' ? 'password' : 'key';
    if (credentialInput && authMode !== next) {
      drafts[authMode] = credentialInput.value;
      authMode = next;
      credentialInput.value = drafts[authMode] || '';
      passwordVisible = false;
    } else {
      authMode = next;
    }
    if (authSeg) authSeg.set(authMode);
    syncCredentialInput();
  }

  function fillFromAlias(alias) {
    const record = hostByAlias(alias);
    const parsed = parseAddress(alias);
    filling = true;
    if (record) {
      userInput.value = record.user || '';
      hostInput.value = record.hostName || record.alias || '';
      portInput.value = String(record.port || 22);
      drafts.password = '';
      drafts.key = record.identityFile || '';
    } else if (parsed) {
      userInput.value = parsed.user || '';
      hostInput.value = parsed.host || '';
      portInput.value = '22';
      drafts.password = '';
      drafts.key = '';
    }
    setAuth('key');
    credentialInput.value = drafts.key;
    filling = false;
  }

  function buildPayload(targetOverride) {
    const username = userInput.value.trim();
    const host = hostInput.value.trim();
    const port = Number(portInput.value) || 22;
    const target = String(targetOverride != null ? targetOverride : currentTarget || '').trim();
    const composed = target || (host ? (username ? `${username}@${host}` : host) : '');
    const payload = { target: composed, username, host, port, auth: authMode };
    if (authMode === 'password') payload.password = credentialInput.value;
    else payload.identityFile = credentialInput.value.trim();
    return payload;
  }

  function connectNow(targetOverride) {
    if (!hostInput.value.trim()) {
      hostInput.focus();
      return false;
    }
    dirty = false;
    updateConnectButton();
    if (manager) manager.connectWith(buildPayload(targetOverride));
    return true;
  }

  function clearTargetOnEdit() {
    if (filling) return;
    currentTarget = '';
    if (picker) picker.setValue('');
    markDirty();
  }

  function setupForm() {
    if (!formEl) return;

    picker = createSelect({
      options: [],
      value: '',
      placeholder: i18n.t('fileWin.sshPlaceholder'),
      align: 'left',
      className: 'select-compact file-conn-select',
      matchTrigger: true,
      onChange: (alias) => {
        currentTarget = alias;
        fillFromAlias(alias);
        connectNow(alias);
      },
    });

    userInput = connInput(i18n.t('fileWin.userPlaceholder'), 'file-conn-user');
    hostInput = connInput(i18n.t('fileWin.hostPlaceholder'), 'file-conn-host');
    portInput = connInput(i18n.t('fileWin.portPlaceholder'), 'file-conn-port', { inputmode: 'numeric' });

    authSeg = segmented(
      [
        { value: 'password', label: i18n.t('fileWin.password') },
        { value: 'key', label: i18n.t('fileWin.key') },
      ],
      authMode,
      (value) => {
        setAuth(value);
        markDirty();
      },
      { className: 'file-conn-auth' }
    );

    credentialInput = connInput(i18n.t('fileWin.keyPlaceholder'), 'file-conn-secret');
    credentialBtn = el('button', { class: 'file-conn-icon', type: 'button' });
    credentialBtn.addEventListener('click', async () => {
      if (authMode === 'password') {
        passwordVisible = !passwordVisible;
        syncCredentialInput();
        return;
      }
      try {
        const result = await window.ships.openFile();
        if (result && result.path) {
          credentialInput.value = result.tilde || result.path;
          drafts.key = credentialInput.value;
          clearTargetOnEdit();
          syncCredentialInput();
        }
      } catch (err) {
        /* ignore picker failures */
      }
    });

    connectBtn = el('button', { class: 'file-conn-btn', type: 'button' }, i18n.t('fileWin.connect'));
    connectBtn.addEventListener('click', () => connectNow());

    for (const input of [userInput, hostInput, portInput, credentialInput]) {
      input.addEventListener('input', clearTargetOnEdit);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          connectNow();
        }
      });
    }

    const credentialGroup = el('div', { class: 'file-conn-group' });
    credentialGroup.append(credentialInput, credentialBtn);

    formEl.append(
      picker.el,
      userInput,
      hostInput,
      portInput,
      authSeg.root,
      credentialGroup,
      connectBtn
    );
    setAuth(authMode);
    updateConnectButton();
  }

  function applyLocale() {
    if (picker && typeof picker.setPlaceholder === 'function') {
      picker.setPlaceholder(i18n.t('fileWin.sshPlaceholder'));
    }
    if (userInput) userInput.placeholder = i18n.t('fileWin.userPlaceholder');
    if (hostInput) hostInput.placeholder = i18n.t('fileWin.hostPlaceholder');
    if (portInput) portInput.placeholder = i18n.t('fileWin.portPlaceholder');
    if (connectBtn) connectBtn.textContent = i18n.t('fileWin.connect');
    if (authSeg) {
      authSeg.setOptions([
        { value: 'password', label: i18n.t('fileWin.password') },
        { value: 'key', label: i18n.t('fileWin.key') },
      ]);
    }
    syncCredentialInput();
  }

  async function refreshPicker() {
    if (!picker) return;
    applyLocale();
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
    const next = String(target || '');
    currentTarget = next;
    if (next) fillFromAlias(next);
    if (picker) picker.setValue(currentTarget);
    if (manager) manager.setTarget(currentTarget);
  }

  async function boot() {
    const [settings, info] = await Promise.all([window.ships.getSettings(), window.ships.fileWindow.info()]);
    i18n.setLocale((settings && settings.locale) || 'zh');
    // 文件窗口固定浅色主题（纯白背景），不跟随主界面的明暗主题。
    window.ShipsTheme.set({ theme: 'light', accent: (settings && settings.accent) || '#2e6bfc' });
    setupForm();
    currentTarget = (info && info.target) || '';
    const startPath = (info && info.path) || '';
    await refreshPicker();

    const layout = await window.ships.filesLayout.get('window');
    manager = window.ShipsFileManager.create({
      root: rootEl,
      layout: layout || {},
      active: true,
      onLayout: (patch) => window.ships.filesLayout.set('window', patch),
      onConnectionState: (state) => {
        connectionState = state;
        if (state === 'connecting') dirty = false;
        updateConnectButton();
      },
    });
    if (currentTarget) {
      fillFromAlias(currentTarget);
      manager.setTarget(currentTarget);
    }
    // 分离过来时带上当前目录：连上后进入该目录。
    if (startPath) manager.openPath(startPath);

    window.ships.fileWindow.onTarget((payload) => {
      const next = payload && typeof payload === 'object' ? payload : { target: payload };
      setTarget(next.target || '');
      if (next.path) manager.openPath(next.path);
    });
    window.ships.onSettingsChanged((next) => {
      i18n.setLocale((next && next.locale) || 'zh');
      window.ShipsTheme.set({ theme: 'light', accent: (next && next.accent) || '#2e6bfc' });
      refreshPicker();
    });
    // 设置页增删改 SSH 主机 / 分组后实时刷新下拉。
    window.ships.ssh.onConfigChanged(() => refreshPicker());
  }

  boot().catch((err) => console.error(err));
})();
