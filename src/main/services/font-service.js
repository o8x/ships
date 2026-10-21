'use strict';

const { execFile } = require('child_process');
const logger = require('../utils/logger');

const TIMEOUT_MS = 15000;
let cachedFonts = null;

/* Returns installed font families via AppKit, with a fixed-pitch flag so the UI
   can list monospaced fonts first. Cached for the process lifetime. */
function listFonts() {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') {
      resolve({ ok: false, error: 'unsupported', fonts: [] });
      return;
    }
    if (cachedFonts) {
      resolve({ ok: true, fonts: cachedFonts });
      return;
    }

    const script = [
      'ObjC.import("AppKit");',
      'const fm = $.NSFontManager.sharedFontManager;',
      'const out = [];',
      'for (const family of ObjC.deepUnwrap(fm.availableFontFamilies)) {',
      '  const font = fm.fontWithFamilyTraitsWeightSize(family, 0, 5, 12);',
      '  let mono = false;',
      '  if (font && !font.isNil()) {',
      '    mono = (fm.traitsOfFont(font) & 1024) !== 0;', // NSFontMonoSpaceTrait
      '  }',
      '  out.push({ family, mono });',
      '}',
      'JSON.stringify(out);',
    ].join('\n');

    execFile(
      '/usr/bin/osascript',
      ['-l', 'JavaScript', '-e', script],
      { encoding: 'utf8', timeout: TIMEOUT_MS },
      (err, stdout) => {
        if (err) {
          logger.warn('[font] list fonts failed:', (err && err.message) || err);
          resolve({ ok: false, error: (err && err.message) || 'error', fonts: [] });
          return;
        }
        try {
          const parsed = JSON.parse(String(stdout || '').trim());
          const fonts = (Array.isArray(parsed) ? parsed : [])
            .filter((entry) => entry && typeof entry.family === 'string' && entry.family)
            .map((entry) => ({ family: entry.family, mono: entry.mono === true }))
            .sort((a, b) => {
              if (a.mono !== b.mono) return a.mono ? -1 : 1;
              return a.family.localeCompare(b.family);
            });
          cachedFonts = fonts;
          resolve({ ok: true, fonts });
        } catch (parseErr) {
          logger.warn('[font] invalid font list:', parseErr.message);
          resolve({ ok: false, error: 'invalid', fonts: [] });
        }
      }
    );
  });
}

module.exports = { listFonts };
