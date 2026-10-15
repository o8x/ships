'use strict';

const fs = require('fs');
const { dialog } = require('electron');
const { APP_NAME, VERSION, IPC } = require('../../shared/constants');
const settingsService = require('./settings-service');
const configService = require('./ssh-config-service');
const credentials = require('./ssh-credentials-service');
const { broadcast } = require('../window-manager');
const logger = require('../utils/logger');

/* 导入 / 导出「全部配置」为一个 JSON 文件：
   - settings：应用设置值（覆盖导入）。
   - ssh.hosts：`~/.ssh/config` 的主机（含分组）；**导入时只新增、不覆盖已有别名**。
   - ssh 密码：导出为**明文**写入 JSON（由用户自行保管）；导入时随新增主机一并保存（加密到本地）。
   导出文件可用于「导入覆盖」当前配置。 */

const FORMAT = 'ships-backup';
const FORMAT_VERSION = 1;

function buildExport() {
  const passwords = credentials.allPlaintext();
  const hosts = configService.list().map((host) => {
    const entry = {
      alias: host.alias,
      hostName: host.hostName,
      user: host.user,
      port: host.port,
      identityFile: host.identityFile,
      proxyJump: host.proxyJump,
      group: host.group || '',
    };
    if (passwords[host.alias]) entry.password = passwords[host.alias];
    return entry;
  });
  return {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    app: APP_NAME,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    settings: settingsService.getAll(),
    ssh: { hosts },
  };
}

async function exportToFile(win) {
  const data = buildExport();
  const stamp = new Date().toISOString().slice(0, 10);
  const opts = {
    title: APP_NAME,
    defaultPath: `ships-backup-${stamp}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  };
  const result = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  try {
    fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    logger.warn('[backup] export failed:', (err && err.message) || err);
    return { ok: false, error: (err && err.message) || 'error' };
  }
  logger.info(`[backup] exported to ${result.filePath}`);
  return { ok: true, path: result.filePath };
}

function applyImport(data) {
  if (!data || typeof data !== 'object') return { ok: false, error: 'invalid' };

  // 设置：覆盖（合并写回，导入里出现的键覆盖当前值）。
  const hadSettings = Boolean(data.settings && typeof data.settings === 'object');
  if (hadSettings) settingsService.set(data.settings);

  // SSH 主机：只新增（别名已存在则跳过），并随新增主机保存其密码。
  const existing = new Set(configService.list().map((h) => h.alias.toLowerCase()));
  let added = 0;
  let skipped = 0;
  let passwords = 0;
  const hosts = data.ssh && Array.isArray(data.ssh.hosts) ? data.ssh.hosts : [];
  for (const raw of hosts) {
    const alias = raw && String(raw.alias || '').trim();
    if (!alias) continue;
    if (existing.has(alias.toLowerCase())) {
      skipped += 1;
      continue;
    }
    configService.upsert({
      alias,
      hostName: raw.hostName || alias,
      user: raw.user || '',
      port: Number(raw.port) || 22,
      identityFile: raw.identityFile || '',
      proxyJump: raw.proxyJump || '',
      group: raw.group || '',
    });
    existing.add(alias.toLowerCase());
    added += 1;
    if (raw.password) {
      credentials.save(alias, raw.password);
      passwords += 1;
    }
  }
  if (added) broadcast(IPC.SSH_CONFIG_CHANGED, { hosts: configService.list() });
  return { ok: true, settings: hadSettings, added, skipped, passwords };
}

async function importFromFile(win) {
  const opts = {
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  };
  const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
  let data;
  try {
    data = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
  } catch (err) {
    logger.warn('[backup] parse failed:', (err && err.message) || err);
    return { ok: false, error: 'invalid' };
  }
  const applied = applyImport(data);
  logger.info(
    `[backup] import: settings=${applied.settings} added=${applied.added} skipped=${applied.skipped} passwords=${applied.passwords}`
  );
  return applied;
}

module.exports = { buildExport, exportToFile, importFromFile, applyImport };
