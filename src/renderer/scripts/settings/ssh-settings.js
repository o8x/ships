'use strict';

(function registerSshSettings() {
  const { Icons, el, field } = window.ShipsUI;
  const i18n = window.ShipsI18n;

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
        requiredAlias: '别名为必填项',
        confirmDelete: '确认删除？',
        delete: '删除',
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
        requiredAlias: 'Alias is required',
        confirmDelete: 'Delete this host?',
        delete: 'Delete',
      },
    },
  });

  function mount(pane, ctx) {
    const state = { hosts: [], editing: null, confirmAlias: null, error: '' };
    const root = el('div', {});
    pane.appendChild(root);

    async function reload() {
      state.hosts = await window.ships.sshConfig.read();
      render();
    }

    function header(titleText, actionButton) {
      const head = el('div', { class: 'mb-3 flex items-center justify-between' });
      const left = el('div', {});
      left.appendChild(el('h2', { class: 'tool-title mb-0' }, titleText));
      left.appendChild(el('div', { class: 'text-[11px] text-fg-muted' }, i18n.t('sshSettings.subtitle')));
      head.appendChild(left);
      if (actionButton) head.appendChild(actionButton);
      return head;
    }

    function renderList() {
      root.innerHTML = '';
      const addBtn = el('button', { class: 'btn', type: 'button' });
      addBtn.append(
        el('span', { class: 'inline-flex' }, Icons.plus(14)),
        el('span', {}, i18n.t('sshSettings.add'))
      );
      addBtn.addEventListener('click', () => {
        state.editing = { alias: '', hostName: '', user: '', port: 22, identityFile: '', proxyJump: '' };
        state.error = '';
        render();
      });
      root.appendChild(header(i18n.t('sshSettings.title'), addBtn));

      if (!state.hosts.length) {
        root.appendChild(
          el('div', { class: 'py-10 text-center text-[12px] text-fg-muted' }, i18n.t('sshSettings.empty'))
        );
        return;
      }

      const list = el('div', { class: 'flex flex-col gap-1.5' });
      for (const host of state.hosts) list.appendChild(buildRow(host));
      root.appendChild(list);
    }

    function buildRow(host) {
      const row = el('div', { class: 'row-card' });
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
      row.appendChild(info);

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
      const editBtn = el('button', { class: 'icon-btn h-7 w-7', type: 'button', title: i18n.t('sshSettings.edit') });
      editBtn.innerHTML = Icons.edit(15);
      editBtn.addEventListener('click', () => {
        state.editing = Object.assign({ originalAlias: host.alias }, host);
        state.error = '';
        render();
      });
      const delBtn = el('button', { class: 'icon-btn h-7 w-7', type: 'button', title: i18n.t('sshSettings.delete') });
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
      root.appendChild(
        header(isNew ? i18n.t('sshSettings.add') : i18n.t('sshSettings.edit'), null)
      );

      const form = el('div', { class: 'flex flex-col' });
      const inputs = {};

      const defs = [
        ['alias', i18n.t('sshSettings.alias'), '', 'web'],
        ['hostName', i18n.t('sshSettings.hostName'), '', '192.168.1.10'],
        ['user', i18n.t('sshSettings.user'), '', 'root'],
        ['port', i18n.t('sshSettings.port'), 'number', '22'],
        ['identityFile', i18n.t('sshSettings.identityFile'), '', '~/.ssh/id_ed25519'],
        ['proxyJump', i18n.t('sshSettings.proxyJump'), '', 'bastion'],
      ];

      for (const [key, label, type, placeholder] of defs) {
        const attrs = { placeholder, spellcheck: 'false' };
        if (type) attrs.type = type;
        const built = field(label, attrs);
        built.input.dataset.key = key;
        built.input.value = editing[key] != null && editing[key] !== '' ? String(editing[key]) : key === 'port' ? '22' : '';
        inputs[key] = built.input;
        form.appendChild(built.wrapper);
      }

      if (state.error) {
        form.appendChild(el('div', { class: 'mb-2 text-[11px] text-danger' }, state.error));
      }

      const actions = el('div', { class: 'mt-1 flex items-center gap-2' });
      const saveBtn = el('button', { class: 'btn btn-accent', type: 'button' }, i18n.t('sshSettings.save'));
      saveBtn.addEventListener('click', save);
      const cancelBtn = el('button', { class: 'btn', type: 'button' }, i18n.t('sshSettings.cancel'));
      cancelBtn.addEventListener('click', () => {
        state.editing = null;
        render();
      });
      actions.append(saveBtn, cancelBtn);
      form.appendChild(actions);
      root.appendChild(form);
    }

    async function save() {
      const value = {};
      for (const input of root.querySelectorAll('input')) {
        value[input.dataset.key] = input.value.trim();
      }
      const alias = value.alias;
      if (!alias) {
        state.error = i18n.t('sshSettings.requiredAlias');
        render();
        return;
      }
      await window.ships.sshConfig.upsert({
        originalAlias: state.editing.originalAlias || alias,
        alias,
        hostName: value.hostName,
        user: value.user,
        port: Number(value.port) || 22,
        identityFile: value.identityFile,
        proxyJump: value.proxyJump,
      });
      state.editing = null;
      await reload();
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
