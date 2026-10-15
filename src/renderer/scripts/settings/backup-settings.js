'use strict';

(function registerBackupSettings() {
  const { Icons, el, section } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      settingsPage: {
        backup: '导入 / 导出',
        exportConfig: '导出配置',
        exportHint: '把应用设置与 SSH 主机导出为 JSON 文件（SSH 密码为明文，请妥善保管）',
        importConfig: '导入配置',
        importHint: '从 JSON 文件导入：设置覆盖当前值，SSH 主机只新增、不覆盖已有',
        backupExport: '导出',
        backupImport: '导入',
        backupImportConfirm: '导入将覆盖当前设置，并新增 JSON 里的 SSH 主机。继续？',
        backupExportDone: '已导出到 {path}',
        backupExportFailed: '导出失败：{error}',
        backupImportDone: '已导入：设置已覆盖；SSH 新增 {added} 个、跳过 {skipped} 个；密码 {passwords} 个',
        backupImportFailed: '导入失败：{error}',
      },
    },
    en: {
      settingsPage: {
        backup: 'Import / Export',
        exportConfig: 'Export config',
        exportHint: 'Export app settings and SSH hosts as a JSON file (SSH passwords are plaintext — keep it safe)',
        importConfig: 'Import config',
        importHint: 'Import from a JSON file: settings are overwritten, SSH hosts are only added (never overwritten)',
        backupExport: 'Export',
        backupImport: 'Import',
        backupImportConfirm: 'Import will overwrite current settings and add the SSH hosts in the file. Continue?',
        backupExportDone: 'Exported to {path}',
        backupExportFailed: 'Export failed: {error}',
        backupImportDone: 'Imported: settings overwritten; SSH +{added}, skipped {skipped}; passwords {passwords}',
        backupImportFailed: 'Import failed: {error}',
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

  function mount(pane) {
    const backupSection = section(i18n.t('settingsPage.backup'));

    const note = el('div', { class: 'mt-1 break-all text-[11px] text-fg-muted' }, '');
    function showNote(text, isError) {
      note.textContent = text;
      note.style.color = isError ? 'var(--color-danger)' : 'var(--color-success)';
    }

    const exportBtn = el('button', { class: 'btn shrink-0', type: 'button' });
    exportBtn.append(
      el('span', { class: 'inline-flex' }, Icons.download(14)),
      el('span', {}, i18n.t('settingsPage.backupExport'))
    );
    exportBtn.addEventListener('click', async () => {
      exportBtn.disabled = true;
      try {
        const res = await window.ships.backup.exportAll();
        if (res && res.ok) showNote(i18n.t('settingsPage.backupExportDone', { path: res.path }), false);
        else if (res && res.canceled) showNote('', false);
        else showNote(i18n.t('settingsPage.backupExportFailed', { error: (res && res.error) || 'error' }), true);
      } finally {
        exportBtn.disabled = false;
      }
    });
    backupSection.appendChild(
      row(i18n.t('settingsPage.exportConfig'), i18n.t('settingsPage.exportHint'), exportBtn)
    );

    // 导入：二次确认（自绘，不用系统 confirm）。
    const importControl = el('div', { class: 'flex shrink-0 items-center gap-1' });
    let confirming = false;
    let importing = false;
    async function doImport() {
      importing = true;
      renderImportControl();
      try {
        const res = await window.ships.backup.importAll();
        if (res && res.ok) {
          showNote(
            i18n.t('settingsPage.backupImportDone', {
              added: res.added || 0,
              skipped: res.skipped || 0,
              passwords: res.passwords || 0,
            }),
            false
          );
        } else if (res && res.canceled) {
          showNote('', false);
        } else {
          showNote(i18n.t('settingsPage.backupImportFailed', { error: (res && res.error) || 'error' }), true);
        }
      } finally {
        importing = false;
        confirming = false;
        renderImportControl();
      }
    }
    function renderImportControl() {
      importControl.innerHTML = '';
      if (importing) {
        importControl.appendChild(el('span', { class: 'text-[11px] text-fg-muted' }, i18n.t('common.loading')));
        return;
      }
      if (confirming) {
        importControl.appendChild(
          el('span', { class: 'text-[11px] text-danger' }, i18n.t('settingsPage.backupImportConfirm'))
        );
        const yes = el('button', { class: 'icon-btn h-7 w-7', type: 'button' });
        yes.innerHTML = Icons.check(15);
        yes.style.color = 'var(--color-danger)';
        yes.addEventListener('click', doImport);
        const no = el('button', { class: 'icon-btn h-7 w-7', type: 'button' });
        no.innerHTML = Icons.x(15);
        no.addEventListener('click', () => {
          confirming = false;
          renderImportControl();
        });
        importControl.append(yes, no);
        return;
      }
      const importBtn = el('button', { class: 'btn shrink-0', type: 'button' });
      importBtn.append(
        el('span', { class: 'inline-flex' }, Icons.external(14)),
        el('span', {}, i18n.t('settingsPage.backupImport'))
      );
      importBtn.addEventListener('click', () => {
        confirming = true;
        renderImportControl();
      });
      importControl.appendChild(importBtn);
    }
    renderImportControl();
    backupSection.appendChild(
      row(i18n.t('settingsPage.importConfig'), i18n.t('settingsPage.importHint'), importControl)
    );
    backupSection.appendChild(note);

    pane.append(backupSection);
  }

  window.ShipsSettingsRegistry.register({
    id: 'backup',
    icon: 'download',
    labelKey: 'settingsPage.backup',
    mount,
  });
})();
