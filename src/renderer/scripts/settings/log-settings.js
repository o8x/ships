'use strict';

(function registerLogSettings() {
  const { Icons, el, section, createSelect } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      settingsPage: {
        logs: '日志',
        logsToConsole: '同步到控制台 App',
        logsToConsoleHint: '仅 macOS：日志同时写入系统统一日志，可在「控制台」App 查看',
        logRetention: '日志保留天数',
        logRetentionHint: '按天滚动保存，超过保留期的日志文件会被自动删除',
        logsFolder: '日志文件夹',
        logsFolderHint: '打开保存日志的文件夹',
        openConsole: '打开控制台 App',
        openConsoleHint: '在系统「控制台」App 中查看 Ships 日志',
        open: '打开',
        days: '天',
      },
    },
    en: {
      settingsPage: {
        logs: 'Logs',
        logsToConsole: 'Also log to Console.app',
        logsToConsoleHint: 'macOS only: mirror logs into the unified log (viewable in Console.app)',
        logRetention: 'Log retention',
        logRetentionHint: 'Rotated daily; files older than this are removed automatically',
        logsFolder: 'Logs folder',
        logsFolderHint: 'Open the folder that holds the logs',
        openConsole: 'Open Console.app',
        openConsoleHint: 'View Ships logs in the system Console app',
        open: 'Open',
        days: 'days',
      },
    },
  });

  function row(labelText, hintText, control) {
    const root = el('div', {
      class: 'flex items-center justify-between gap-4 rounded-card border border-border bg-surface px-4 py-3',
    });
    const left = el('div', { class: 'min-w-0' });
    left.appendChild(el('div', { class: 'text-[13px] font-medium text-fg' }, labelText));
    if (hintText) left.appendChild(el('div', { class: 'mt-0.5 break-all text-[11px] text-fg-muted' }, hintText));
    root.append(left, control);
    return root;
  }

  function switchControl(value, onToggle) {
    const button = el('button', { class: 'switch', type: 'button' });
    button.classList.toggle('on', Boolean(value));
    button.addEventListener('click', () => {
      const next = !button.classList.contains('on');
      button.classList.toggle('on', next);
      onToggle(next);
    });
    return { root: button };
  }

  function mount(pane, ctx) {
    const { settings, info, patch } = ctx;
    const logsSection = section(i18n.t('settingsPage.logs'));

    // 「同步到控制台 App」仅 macOS 有意义，其它平台不展示。
    if (!info || info.platform === 'darwin') {
      // 开启同步后，追加一个「打开控制台 App」入口（关闭时隐藏）。
      const consoleOpenBtn = el('button', { class: 'btn shrink-0', type: 'button' });
      consoleOpenBtn.append(
        el('span', { class: 'inline-flex' }, Icons.monitor(14)),
        el('span', {}, i18n.t('settingsPage.open'))
      );
      consoleOpenBtn.addEventListener('click', () => window.ships.openConsole());
      const consoleOpenRow = row(
        i18n.t('settingsPage.openConsole'),
        i18n.t('settingsPage.openConsoleHint'),
        consoleOpenBtn
      );

      function syncConsoleOpen(enabled) {
        consoleOpenRow.classList.toggle('hidden', !enabled);
      }
      syncConsoleOpen(Boolean(settings.logToConsoleApp));

      const consoleSwitch = switchControl(settings.logToConsoleApp, (value) => {
        syncConsoleOpen(value);
        patch({ logToConsoleApp: value });
      });
      logsSection.appendChild(
        row(i18n.t('settingsPage.logsToConsole'), i18n.t('settingsPage.logsToConsoleHint'), consoleSwitch.root)
      );
      logsSection.appendChild(consoleOpenRow);
    }

    const retentionSelect = createSelect({
      options: [1, 3, 7, 14, 30, 90].map((value) => ({
        value,
        label: `${value} ${i18n.t('settingsPage.days')}`,
      })),
      value: settings.logRetentionDays || 7,
      align: 'right',
      className: 'w-[120px] shrink-0',
      onChange: (value) => patch({ logRetentionDays: Number(value) }),
    });
    logsSection.appendChild(
      row(i18n.t('settingsPage.logRetention'), i18n.t('settingsPage.logRetentionHint'), retentionSelect.el)
    );

    const folderBtn = el('button', { class: 'btn shrink-0', type: 'button' });
    folderBtn.append(
      el('span', { class: 'inline-flex' }, Icons.folder(14)),
      el('span', {}, i18n.t('settingsPage.open'))
    );
    folderBtn.addEventListener('click', () => window.ships.openLog());
    logsSection.appendChild(
      row(i18n.t('settingsPage.logsFolder'), i18n.t('settingsPage.logsFolderHint'), folderBtn)
    );

    pane.append(logsSection);
  }

  window.ShipsSettingsRegistry.register({
    id: 'logs',
    icon: 'doc',
    labelKey: 'settingsPage.logs',
    mount,
  });
})();
