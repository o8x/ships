'use strict';

(function registerSshSettings() {
  const { Icons, el, field, osIconInfo } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  const DEFAULT_IDENTITY = '~/.ssh/id_ed25519';

  i18n.extend({
    zh: {
      sshSettings: {
        title: 'SSH 主机',
        subtitle: '编辑当前 ~/.ssh/config',
        add: '新增',
        edit: '编辑主机',
        empty: '~/.ssh/config 中暂无主机',
        alias: '别名',
        hostName: '主机名',
        user: '用户名',
        port: '端口',
        identityFile: '私钥文件',
        proxyJump: '跳板机',
        save: '保存',
        cancel: '取消',
        requiredAlias: '请至少填写别名或主机地址',
        confirmDelete: '确认删除？',
        delete: '删除',
        detect: '探测系统',
        detecting: '探测中…',
        detected: '已识别：{os}',
        detectFailed: '探测失败，请检查地址/端口/私钥',
        detectFirst: '探测成功后才能保存',
        export: '导出',
        exportDone: '已导出到 {path}',
        exportFailed: '导出失败：{error}',
      },
    },
    en: {
      sshSettings: {
        title: 'SSH hosts',
        subtitle: 'Edit the current ~/.ssh/config',
        add: 'Add',
        edit: 'Edit host',
        empty: 'No hosts in ~/.ssh/config',
        alias: 'Alias',
        hostName: 'HostName',
        user: 'User',
        port: 'Port',
        identityFile: 'IdentityFile',
        proxyJump: 'ProxyJump',
        save: 'Save',
        cancel: 'Cancel',
        requiredAlias: 'Alias or host address is required',
        confirmDelete: 'Delete this host?',
        delete: 'Delete',
        detect: 'Detect OS',
        detecting: 'Detecting…',
        detected: 'Detected: {os}',
        detectFailed: 'Detection failed. Check address/port/key',
        detectFirst: 'Detect successfully before saving',
        export: 'Export',
        exportDone: 'Exported to {path}',
        exportFailed: 'Export failed: {error}',
      },
    },
  });

  function mount(pane, ctx) {
    const state = {
      hosts: [],
      detectedMap: {},
      detected: null,
      detecting: false,
      detectError: '',
      editing: null,
      confirmAlias: null,
      error: '',
      message: '',
      messageTimer: null,
    };
    const root = el('div', {});
    pane.appendChild(root);

    async function reload() {
      state.hosts = await window.ships.sshConfig.read();
      try {
        state.detectedMap = await window.ships.sshGetDetected();
      } catch (err) {
        state.detectedMap = {};
      }
      render();
    }

    function showMessage(text) {
      state.message = text;
      render();
      clearTimeout(state.messageTimer);
      state.messageTimer = setTimeout(() => {
        state.message = '';
        render();
      }, 4000);
    }

    function header(titleText, actions) {
      const head = el('div', { class: 'mb-3 flex items-center justify-between gap-2' });
      const left = el('div', { class: 'min-w-0' });
      left.appendChild(el('h2', { class: 'tool-title mb-0' }, titleText));
      left.appendChild(el('div', { class: 'text-[11px] text-fg-muted' }, i18n.t('sshSettings.subtitle')));
      head.appendChild(left);
      if (actions) head.appendChild(actions);
      return head;
    }

    function renderList() {
      root.innerHTML = '';

      const actions = el('div', { class: 'flex shrink-0 items-center gap-2' });
      const exportBtn = el('button', { class: 'btn', type: 'button' });
      exportBtn.append(
        el('span', { class: 'inline-flex' }, Icons.external(14)),
        el('span', {}, i18n.t('sshSettings.export'))
      );
      exportBtn.addEventListener('click', doExport);
      const addBtn = el('button', { class: 'btn', type: 'button' });
      addBtn.append(
        el('span', { class: 'inline-flex' }, Icons.plus(14)),
        el('span', {}, i18n.t('sshSettings.add'))
      );
      addBtn.addEventListener('click', () => {
        state.editing = {
          alias: '',
          hostName: '',
          user: 'root',
          port: 22,
          identityFile: DEFAULT_IDENTITY,
          proxyJump: '',
        };
        state.error = '';
        state.detected = null;
        state.detectError = '';
        render();
      });
      actions.append(exportBtn, addBtn);
      root.appendChild(el('div', { class: 'mb-3 flex items-center justify-end gap-2' })).appendChild(actions);

      if (state.message) {
        root.appendChild(el('div', { class: 'mb-2 text-[11px] text-success' }, state.message));
      }

      if (!state.hosts.length) {
        root.appendChild(
          el('div', { class: 'py-10 text-center text-[12px] text-fg-muted' }, i18n.t('sshSettings.empty'))
        );
        return;
      }

      const list = el('div', { class: 'flex flex-col gap-2.5' });
      for (const host of state.hosts) list.appendChild(buildRow(host));
      root.appendChild(list);
    }

    function buildRow(host) {
      const row = el('div', { class: 'row-card' });
      const detected = state.detectedMap[host.alias];
      const iconInfo = osIconInfo(detected);
      const icon = el('span', { class: 'flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-surface-2' });
      icon.innerHTML = Icons[iconInfo.name] ? Icons[iconInfo.name](17) : Icons.server(17);
      icon.style.color = iconInfo.color || '';
      const info = el('div', { class: 'min-w-0 flex-1' });
      info.appendChild(el('div', { class: 'truncate text-[13px] font-medium text-fg' }, host.alias));
      const portSuffix = host.port && Number(host.port) !== 22 ? `:${host.port}` : '';
      info.appendChild(
        el(
          'div',
          { class: 'truncate font-mono text-[11px] text-fg-muted' },
          `${host.user ? `${host.user}@` : ''}${host.hostName}${portSuffix}`
        )
      );
      row.append(icon, info);

      if (state.confirmAlias === host.alias) {
        const confirmWrap = el('div', { class: 'flex shrink-0 items-center gap-1' });
        confirmWrap.appendChild(el('span', { class: 'text-[11px] text-danger' }, i18n.t('sshSettings.confirmDelete')));
        const yes = el('button', { class: 'icon-btn h-7 w-7', type: 'button' });
        yes.innerHTML = Icons.check(15);
        yes.style.color = 'var(--color-danger)';
        yes.addEventListener('click', () => doRemove(host.alias));
        const no = el('button', { class: 'icon-btn h-7 w-7', type: 'button' });
        no.innerHTML = Icons.x(15);
        no.addEventListener('click', () => {
          state.confirmAlias = null;
          render();
        });
        confirmWrap.append(yes, no);
        row.appendChild(confirmWrap);
        return row;
      }

      const actions = el('div', { class: 'flex shrink-0 items-center gap-1' });
      const editBtn = el('button', { class: 'icon-btn h-7 w-7', type: 'button', 'data-tip': i18n.t('sshSettings.edit') });
      editBtn.innerHTML = Icons.edit(15);
      editBtn.addEventListener('click', () => {
        state.editing = Object.assign({ originalAlias: host.alias }, host);
        state.error = '';
        state.detectError = '';
        state.detected = state.detectedMap[host.alias] || null;
        render();
      });
      const delBtn = el('button', { class: 'icon-btn h-7 w-7', type: 'button', 'data-tip': i18n.t('sshSettings.delete') });
      delBtn.innerHTML = Icons.trash(15);
      delBtn.addEventListener('click', () => {
        state.confirmAlias = host.alias;
        render();
      });
      actions.append(editBtn, delBtn);
      row.appendChild(actions);
      return row;
    }

    function renderForm() {
      root.innerHTML = '';
      const editing = state.editing;
      const isNew = !editing.originalAlias;
      root.appendChild(header(isNew ? i18n.t('sshSettings.add') : i18n.t('sshSettings.edit'), null));

      const form = el('div', { class: 'flex flex-col' });
      const inputs = {};

      const defs = [
        ['alias', i18n.t('sshSettings.alias'), '', 'web'],
        ['hostName', i18n.t('sshSettings.hostName'), '', '192.168.1.10'],
        ['user', i18n.t('sshSettings.user'), '', 'root'],
        ['port', i18n.t('sshSettings.port'), 'number', '22'],
        ['identityFile', i18n.t('sshSettings.identityFile'), '', DEFAULT_IDENTITY],
        ['proxyJump', i18n.t('sshSettings.proxyJump'), '', 'bastion'],
      ];

      for (const [key, label, type, placeholder] of defs) {
        const attrs = { placeholder, spellcheck: 'false' };
        if (type) attrs.type = type;
        const built = field(label, attrs);
        built.input.dataset.key = key;
        built.input.value = editing[key] != null && editing[key] !== '' ? String(editing[key]) : '';
        inputs[key] = built.input;
        form.appendChild(built.wrapper);
      }

      if (state.error) {
        form.appendChild(el('div', { class: 'mb-2 text-[11px] text-danger' }, state.error));
      }

      const detectStatus = el('div', { class: 'mb-2 text-[11px]' }, '');
      if (state.detecting) {
        detectStatus.textContent = i18n.t('sshSettings.detecting');
        detectStatus.style.color = 'var(--color-fg-muted)';
      } else if (state.detected && state.detected.label) {
        detectStatus.textContent = i18n.t('sshSettings.detected', { os: state.detected.label });
        detectStatus.style.color = 'var(--color-success)';
      } else if (state.detectError) {
        detectStatus.textContent = state.detectError;
        detectStatus.style.color = 'var(--color-danger)';
      } else {
        detectStatus.textContent = i18n.t('sshSettings.detectFirst');
        detectStatus.style.color = 'var(--color-fg-muted)';
      }
      form.appendChild(detectStatus);

      const actions = el('div', { class: 'mt-1 flex items-center gap-2' });
      const detectBtn = el('button', { class: 'btn', type: 'button' }, i18n.t('sshSettings.detect'));
      detectBtn.disabled = state.detecting;
      detectBtn.addEventListener('click', () => doDetect(inputs));
      const saveBtn = el('button', { class: 'btn btn-accent', type: 'button' }, i18n.t('sshSettings.save'));
      saveBtn.disabled = !state.detected || state.detecting;
      saveBtn.addEventListener('click', save);
      const cancelBtn = el('button', { class: 'btn', type: 'button' }, i18n.t('sshSettings.cancel'));
      cancelBtn.addEventListener('click', () => {
        state.editing = null;
        state.detected = null;
        state.detectError = '';
        render();
      });
      actions.append(detectBtn, saveBtn, cancelBtn);
      form.appendChild(actions);
      root.appendChild(form);
    }

    function readInputs(inputs) {
      const value = {};
      for (const key of Object.keys(inputs)) value[key] = inputs[key].value.trim();
      return value;
    }

    // Fill defaults into empty fields, then detect the OS using current values.
    async function doDetect(inputs) {
      const value = readInputs(inputs);
      if (!value.alias) inputs.alias.value = value.hostName || '';
      if (!value.user) inputs.user.value = 'root';
      if (!value.port) inputs.port.value = '22';
      if (!value.identityFile) inputs.identityFile.value = DEFAULT_IDENTITY;

      const current = readInputs(inputs);
      // Keep the form values so a failed detection does not clear them.
      Object.assign(state.editing, current);
      if (!current.hostName) {
        state.detected = null;
        state.detectError = i18n.t('sshSettings.requiredAlias');
        render();
        return;
      }

      state.detecting = true;
      state.detected = null;
      state.detectError = '';
      render();

      const result = await window.ships.sshDetectHost({
        alias: current.alias || current.hostName,
        hostName: current.hostName,
        user: current.user,
        port: Number(current.port) || 22,
        identityFile: current.identityFile,
        proxyJump: current.proxyJump,
      });

      state.detecting = false;
      if (result && result.ok && result.info && result.info.os && result.info.os !== 'unknown') {
        state.detected = result.info;
        state.detectError = '';
      } else {
        state.detected = null;
        state.detectError = i18n.t('sshSettings.detectFailed');
      }
      render();
    }

    async function save() {
      if (!state.detected) return;
      const inputs = {};
      for (const input of root.querySelectorAll('input')) inputs[input.dataset.key] = input;
      const value = readInputs(inputs);
      const hostName = value.hostName;
      const alias = value.alias || hostName;
      if (!alias) {
        state.error = i18n.t('sshSettings.requiredAlias');
        render();
        return;
      }
      await window.ships.sshConfig.upsert({
        originalAlias: state.editing.originalAlias || alias,
        alias,
        hostName,
        user: value.user || 'root',
        port: Number(value.port) || 22,
        identityFile: value.identityFile,
        proxyJump: value.proxyJump,
      });
      state.editing = null;
      state.detected = null;
      state.detectError = '';
      await reload();
    }

    async function doExport() {
      const result = await window.ships.sshConfig.export();
      if (result && result.ok) showMessage(i18n.t('sshSettings.exportDone', { path: result.path }));
      else if (result && result.canceled) return;
      else showMessage(i18n.t('sshSettings.exportFailed', { error: (result && result.error) || 'error' }));
    }

    async function doRemove(alias) {
      state.confirmAlias = null;
      await window.ships.sshConfig.remove(alias);
      await reload();
    }

    function render() {
      if (state.editing) renderForm();
      else renderList();
    }

    reload();
  }

  window.ShipsSettingsRegistry.register({
    id: 'ssh',
    icon: 'terminal',
    labelKey: 'settingsPage.ssh',
    mount,
  });
})();
