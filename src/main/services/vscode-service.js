'use strict';

// Open a local file with Visual Studio Code (the file manager's "Open in VS Code"
// action). Prefers the `code` CLI when present; otherwise falls back to LaunchServices
// via `open -b <bundle id>` so it also works for GUI-launched sessions without a PATH.

const { execFile } = require('child_process');
const fs = require('fs');
const logger = require('../utils/logger');

const VSCODE_BUNDLE_ID = 'com.microsoft.VSCode';
const CODE_CLI_CANDIDATES = [
  '/opt/homebrew/bin/code',
  '/usr/local/bin/code',
  '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
];

function findCli() {
  for (const candidate of CODE_CLI_CANDIDATES) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch (err) {
      /* ignore */
    }
  }
  return '';
}

function openPath(filePath) {
  const target = String(filePath || '');
  if (!target) return Promise.resolve({ ok: false, error: 'no-path' });
  const cli = findCli();
  const cmd = cli || 'open';
  const args = cli ? [target] : ['-b', VSCODE_BUNDLE_ID, target];
  return new Promise((resolve) => {
    execFile(cmd, args, (err) => {
      if (err) {
        logger.error(`[vscode] open failed (${target}): ${err.message}`);
        resolve({ ok: false, error: err.message });
        return;
      }
      logger.file(`[vscode] opened ${target}`);
      resolve({ ok: true });
    });
  });
}

module.exports = { openPath, _findCli: findCli };
