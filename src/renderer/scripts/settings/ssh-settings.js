'use strict';

(function registerSshSettings() {
  const { Icons, el, field, inputField, osIconInfo, segmented } = window.ShipsUI;
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
        chooseFile: '选择文件',
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
        group: '分组',
        ungrouped: '未分组',
        newGroup: '新增分组',
        groupPlaceholder: '输入新分组名称',
        renameGroup: '重命名分组',
        groupExists: '同名分组已存在',
        password: '密码',
        passwordPlaceholder: '（可选）登录密码，仅 macOS',
        passwordSaved: '已保存（留空则不修改）',
        clearPassword: '清除已保存的密码',
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
        chooseFile: 'Choose file',
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
        group: 'Group',
        ungrouped: 'Ungrouped',
        newGroup: 'New group',
        groupPlaceholder: 'New group name',
        renameGroup: 'Rename group',
        groupExists: 'A group with this name already exists',
        password: 'Password',
        passwordPlaceholder: 'Login password (optional, macOS)',
        passwordSaved: 'Saved (leave empty to keep)',
        clearPassword: 'Clear saved password',
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
      // 折叠的分组（默认空 = 全部分组展开）。key 为分组名，未分组用 ''。
      collapsed: new Set(),
      // 正在重命名的分组（null = 无）；renameValue 保存输入草稿，renameError 显示校验错误。
      renamingGroup: null,
      renameValue: '',
      renameError: '',
      // 表单里的「密码」控件（仅 macOS）：{ input, isClear(), hadPassword } 或 null。
      passwordControl: null,
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
      const head = el('div', { class: 'mb-2.5 flex items-center justify-between gap-2' });
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
          group: '',
        };
        state.error = '';
        state.detected = null;
        state.detectError = '';
        render();
      });
      actions.append(exportBtn, addBtn);
      root.appendChild(el('div', { class: 'mb-2.5 flex items-center justify-end gap-2' })).appendChild(actions);

      if (state.message) {
        root.appendChild(el('div', { class: 'mb-2.5 text-[11px] text-success' }, state.message));
      }

      if (!state.hosts.length) {
        root.appendChild(
          el('div', { class: 'py-10 text-center text-[12px] text-fg-muted' }, i18n.t('sshSettings.empty'))
        );
        return;
      }

      const named = namedGroups();
      // 没有任何命名分组时保持扁平列表；有分组时按分组手风琴展示（默认全部展开）。
      if (!named.length) {
        const list = el('div', { class: 'flex flex-col gap-2.5' });
        for (const host of state.hosts) list.appendChild(buildRow(host));
        root.appendChild(list);
        return;
      }

      const accordion = el('div', { class: 'accordion' });
      for (const group of named) {
        accordion.appendChild(
          buildGroupSection(group, state.hosts.filter((host) => (host.group || '') === group))
        );
      }
      const ungrouped = state.hosts.filter((host) => !host.group);
      if (ungrouped.length) accordion.appendChild(buildGroupSection('', ungrouped));
      root.appendChild(accordion);
    }

    function namedGroups() {
      const seen = new Set();
      const groups = [];
      for (const host of state.hosts) {
        const group = host.group || '';
        if (!group) continue;
        const key = group.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        groups.push(group);
      }
      return groups;
    }

    function buildGroupSection(group, hosts) {
      const collapsed = state.collapsed.has(group);
      const item = el('div', { class: collapsed ? 'accordion-item collapsed' : 'accordion-item' });
      const head = el('div', { class: 'accordion-header' });

      if (group && state.renamingGroup === group) {
        // 就地重命名：输入框 + 确认 / 取消（未分组不可重命名）。
        const input = el('input', { class: 'field min-w-0 flex-1 px-2 py-1 text-[12px]', type: 'text', spellcheck: 'false' });
        input.value = state.renameValue != null ? state.renameValue : group;
        input.addEventListener('input', () => {
          state.renameValue = input.value;
        });
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') commitRename(group, input.value);
          else if (event.key === 'Escape') {
            state.renamingGroup = null;
            state.renameError = '';
            render();
          }
        });
        const ok = el('button', { class: 'icon-btn h-7 w-7 shrink-0', type: 'button' });
        ok.innerHTML = Icons.check(15);
        ok.style.color = 'var(--color-success)';
        ok.addEventListener('click', () => commitRename(group, input.value));
        const cancel = el('button', { class: 'icon-btn h-7 w-7 shrink-0', type: 'button' });
        cancel.innerHTML = Icons.x(15);
        cancel.addEventListener('click', () => {
          state.renamingGroup = null;
          state.renameError = '';
          render();
        });
        head.append(input, ok, cancel);
        item.appendChild(head);
        if (state.renameError) {
          item.appendChild(el('div', { class: 'px-3 pb-1 text-[11px] text-danger' }, state.renameError));
        }
        setTimeout(() => {
          if (input.isConnected) {
            input.focus();
            input.select();
          }
        }, 0);
      } else {
        const toggle = el('button', { class: 'accordion-toggle', type: 'button' });
        const chevron = el('span', { class: 'accordion-chevron inline-flex' });
        chevron.innerHTML = Icons.chevronDown(14);
        const name = el('span', { class: 'accordion-name truncate' });
        name.textContent = group || i18n.t('sshSettings.ungrouped');
        toggle.append(chevron, name, el('span', { class: 'accordion-count' }, String(hosts.length)));
        toggle.addEventListener('click', () => {
          if (state.collapsed.has(group)) state.collapsed.delete(group);
          else state.collapsed.add(group);
          render();
        });
        head.appendChild(toggle);
        if (group) {
          const renameBtn = el('button', {
            class: 'icon-btn h-7 w-7 shrink-0',
            type: 'button',
            'data-tip': i18n.t('sshSettings.renameGroup'),
          });
          renameBtn.innerHTML = Icons.edit(15);
          renameBtn.addEventListener('click', () => {
            state.renamingGroup = group;
            state.renameValue = group;
            state.renameError = '';
            render();
          });
          head.appendChild(renameBtn);
        }
        item.appendChild(head);
      }

      const body = el('div', { class: 'accordion-body' });
      for (const host of hosts) body.appendChild(buildRow(host));
      item.appendChild(body);
      return item;
    }

    async function commitRename(from, rawValue) {
      const to = String(rawValue || '').trim();
      if (!to || to.toLowerCase() === from.toLowerCase()) {
        state.renamingGroup = null;
        state.renameError = '';
        render();
        return;
      }
      const duplicate = namedGroups().some(
        (g) => g.toLowerCase() === to.toLowerCase() && g.toLowerCase() !== from.toLowerCase()
      );
      if (duplicate) {
        state.renameError = i18n.t('sshSettings.groupExists');
        state.renameValue = to;
        render();
        return;
      }
      await window.ships.sshConfig.renameGroup({ from, to });
      if (state.collapsed.has(from)) {
        state.collapsed.delete(from);
        state.collapsed.add(to);
      }
      state.renamingGroup = null;
      state.renameError = '';
      await reload();
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

      const form = el('div', { class: 'flex flex-col gap-2.5' });
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
        const initial = editing[key] != null && editing[key] !== '' ? String(editing[key]) : '';

        if (key === 'identityFile') {
          const input = el('input', { class: 'field font-mono', spellcheck: 'false', placeholder });
          input.dataset.key = key;
          input.value = initial;
          const pick = el('button', { class: 'btn shrink-0', type: 'button', 'data-tip': i18n.t('sshSettings.chooseFile') });
          pick.appendChild(el('span', { class: 'inline-flex' }, Icons.folder(14)));
          pick.addEventListener('click', async () => {
            const info = await window.ships.openFile({ defaultPath: '~/.ssh' });
            if (info) input.value = info.tilde || info.path;
          });
          const row = el('div', { class: 'flex items-center gap-2' });
          row.append(input, pick);
          inputs[key] = input;
          form.appendChild(inputField(label, row));
          continue;
        }

        const attrs = { placeholder, spellcheck: 'false' };
        if (type) attrs.type = type;
        const built = field(label, attrs);
        built.input.dataset.key = key;
        built.input.value = initial;
        inputs[key] = built.input;
        form.appendChild(built.wrapper);
      }

      // 分组：TAB 式 Switch 展示已有分组（默认「未分组」）+ 最右侧「新增分组」按钮。
      // 选中值存 state.editing.group，保存时写回 config 注释 `# group: <名>`。
      const existingGroups = namedGroups();
      const currentGroup = editing.group || '';
      let groupList = [
        { value: '', label: i18n.t('sshSettings.ungrouped') },
        ...existingGroups.map((g) => ({ value: g, label: g })),
      ];
      if (currentGroup && !existingGroups.some((g) => g.toLowerCase() === currentGroup.toLowerCase())) {
        groupList.push({ value: currentGroup, label: currentGroup });
      }
      state.editing.group = currentGroup;

      const groupError = el('div', { class: 'hidden text-[11px] text-danger' }, '');
      const newGroupInput = el('input', {
        class: 'field min-w-0 flex-1 px-2 py-1 text-[12px]',
        type: 'text',
        spellcheck: 'false',
        placeholder: i18n.t('sshSettings.groupPlaceholder'),
      });
      const newGroupRow = el('div', { class: 'hidden flex items-center gap-2' });
      function hideNewGroup() {
        newGroupRow.classList.add('hidden');
        groupError.classList.add('hidden');
        newGroupInput.value = '';
      }
      function confirmNewGroup() {
        const name = newGroupInput.value.trim();
        if (!name) return;
        if (groupList.some((option) => option.value && option.value.toLowerCase() === name.toLowerCase())) {
          groupError.textContent = i18n.t('sshSettings.groupExists');
          groupError.classList.remove('hidden');
          return;
        }
        groupList = groupList.concat([{ value: name, label: name }]);
        groupSwitch.setOptions(groupList);
        groupSwitch.set(name);
        state.editing.group = name;
        hideNewGroup();
      }
      const newGroupOk = el('button', { class: 'icon-btn h-7 w-7 shrink-0', type: 'button' });
      newGroupOk.innerHTML = Icons.check(15);
      newGroupOk.style.color = 'var(--color-success)';
      newGroupOk.addEventListener('click', confirmNewGroup);
      const newGroupCancel = el('button', { class: 'icon-btn h-7 w-7 shrink-0', type: 'button' });
      newGroupCancel.innerHTML = Icons.x(15);
      newGroupCancel.addEventListener('click', hideNewGroup);
      newGroupInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          confirmNewGroup();
        } else if (event.key === 'Escape') {
          hideNewGroup();
        }
      });
      newGroupRow.append(newGroupInput, newGroupOk, newGroupCancel);

      const groupSwitch = segmented(
        groupList,
        currentGroup,
        (value) => {
          state.editing.group = value;
          hideNewGroup();
        },
        {}
      );

      const newGroupBtn = el('button', { class: 'btn shrink-0', type: 'button' });
      newGroupBtn.append(
        el('span', { class: 'inline-flex' }, Icons.plus(14)),
        el('span', {}, i18n.t('sshSettings.newGroup'))
      );
      newGroupBtn.addEventListener('click', () => {
        newGroupRow.classList.remove('hidden');
        groupError.classList.add('hidden');
        newGroupInput.value = '';
        newGroupInput.focus();
      });

      const groupScroll = el('div', { class: 'min-w-0 flex-1 overflow-x-auto' });
      groupScroll.appendChild(groupSwitch.root);
      const groupRow = el('div', { class: 'flex items-center gap-2' });
      groupRow.append(groupScroll, newGroupBtn);
      form.appendChild(inputField(i18n.t('sshSettings.group'), groupRow));
      form.appendChild(newGroupRow);
      form.appendChild(groupError);

      // 登录密码（仅 macOS）：AES-256-GCM 加密保存在本地，连接时在内置终端自动输入。
      state.passwordControl = null;
      if (ctx && ctx.info && ctx.info.platform === 'darwin') {
        const hasPw = Boolean(editing.hasPassword);
        let clearPassword = false;
        const pwInput = el('input', {
          class: 'field font-mono',
          type: 'password',
          spellcheck: 'false',
          autocomplete: 'new-password',
          placeholder: hasPw ? i18n.t('sshSettings.passwordSaved') : i18n.t('sshSettings.passwordPlaceholder'),
        });
        const clearBtn = el('button', {
          class: 'icon-btn h-8 w-8 shrink-0',
          type: 'button',
          'data-tip': i18n.t('sshSettings.clearPassword'),
        });
        clearBtn.innerHTML = Icons.trash(15);
        if (!hasPw) clearBtn.classList.add('hidden');
        clearBtn.addEventListener('click', () => {
          clearPassword = !clearPassword;
          clearBtn.style.color = clearPassword ? 'var(--color-danger)' : '';
        });
        const pwRow = el('div', { class: 'flex items-center gap-2' });
        pwRow.append(pwInput, clearBtn);
        form.appendChild(inputField(i18n.t('sshSettings.password'), pwRow));
        state.passwordControl = { input: pwInput, isClear: () => clearPassword, hadPassword: hasPw };
      }

      if (state.error) {
        form.appendChild(el('div', { class: 'text-[11px] text-danger' }, state.error));
      }

      const detectStatus = el('div', { class: 'text-[11px]' }, '');
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

      const actions = el('div', { class: 'flex items-center gap-2' });
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
      const originalAlias = state.editing.originalAlias || alias;
      const hadPassword = Boolean(state.editing.hasPassword);
      const password = state.passwordControl ? state.passwordControl.input.value : '';
      const clearPassword = state.passwordControl ? state.passwordControl.isClear() : false;

      await window.ships.sshConfig.upsert({
        originalAlias,
        alias,
        hostName,
        user: value.user || 'root',
        port: Number(value.port) || 22,
        identityFile: value.identityFile,
        proxyJump: value.proxyJump,
        group: (state.editing.group || '').trim(),
      });

      // 密码（加密本地存储）：改了别名则迁移（先清旧）；输入了新密码则保存；否则按「清除」处理。
      if (hadPassword && originalAlias !== alias) {
        await window.ships.sshConfig.removePassword(originalAlias);
      }
      if (password) {
        await window.ships.sshConfig.savePassword({ alias, password });
      } else if (clearPassword) {
        await window.ships.sshConfig.removePassword(alias);
      }

      state.editing = null;
      state.detected = null;
      state.detectError = '';
      state.passwordControl = null;
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
