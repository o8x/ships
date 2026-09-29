'use strict';

// Opens a new iTerm window and runs a command in it.
// Shared by the SSH tool (connect / open directory) and the IP tool (port test).

const { execFile } = require('child_process');
const logger = require('../utils/logger');

function appleScriptString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function openCommand(command, tag) {
  const script =
    'tell application "iTerm"\n' +
    '  activate\n' +
    '  set newWindow to (create window with default profile)\n' +
    '  tell current session of newWindow\n' +
    `    write text ${appleScriptString(command)}\n` +
    '  end tell\n' +
    'end tell';

  return new Promise((resolve) => {
    execFile('osascript', ['-e', script], (err) => {
      if (err) {
        logger.error(`[iterm] ${tag} failed: ${err.message}`);
        resolve({ ok: false, error: err.message, command });
        return;
      }
      resolve({ ok: true, command });
    });
  });
}

module.exports = { openCommand, appleScriptString };
