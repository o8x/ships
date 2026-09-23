'use strict';

// electron-builder afterPack hook: basic hardening, in a fixed order
//   asar protection -> Electron fuses -> (ad-hoc) signing.
// electron-builder hooks must be JS modules; heavier logic lives in shell.
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

async function protectAsar(asarPath) {
  try {
    const asarmor = require('asarmor');
    const archive = await asarmor.open(asarPath);
    // Bloat patch: extraction attempts hit huge fake entries (default patches
    // are mostly neutralized by modern asar, so add the bloat deterrent).
    archive.patch(asarmor.createBloatPatch(100));
    await archive.write(asarPath);
    console.log(`[harden] asar protected: ${asarPath}`);
  } catch (err) {
    console.warn(`[harden] asar protection failed: ${err.message}`);
  }
}

async function flipAppFuses(execPath) {
  try {
    const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
    await flipFuses(execPath, {
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      // Off: asarmor rewrites the asar header (embedded integrity would conflict).
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    });
    console.log('[harden] fuses flipped');
  } catch (err) {
    console.warn(`[harden] flip fuses failed: ${err.message}`);
  }
}

exports.default = async function afterPack(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  if (electronPlatformName !== 'darwin') return;

  const appName = packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  const asarPath = path.join(appPath, 'Contents', 'Resources', 'app.asar');
  const execPath = path.join(appPath, 'Contents', 'MacOS', appName);

  if (fs.existsSync(asarPath)) await protectAsar(asarPath);
  if (fs.existsSync(execPath)) await flipAppFuses(execPath);

  // Ad-hoc sign only when no formal signing is configured (electron-builder
  // signs with Developer ID otherwise, after this hook).
  execFileSync('bash', [path.join(__dirname, 'adhoc-sign.sh'), appPath], { stdio: 'inherit' });
};
