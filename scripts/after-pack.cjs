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

// macOS 15+ Local Network privacy silently drops a bundled app's LAN traffic
// unless its Info.plist declares NSLocalNetworkUsageDescription. Electron's
// helper bundles need the key too: the system attributes some Electron traffic
// to them, and without the key those bundles get a silent default-deny rule and
// never prompt. Reuse the main app's description so there is a single source.
function declareLocalNetworkUsage(appPath) {
  const pkg = require('../package.json');
  const description =
    pkg.build && pkg.build.mac && pkg.build.mac.extendInfo
      ? pkg.build.mac.extendInfo.NSLocalNetworkUsageDescription
      : '';
  if (!description) return;

  const frameworks = path.join(appPath, 'Contents', 'Frameworks');
  if (!fs.existsSync(frameworks)) return;

  for (const entry of fs.readdirSync(frameworks)) {
    if (!entry.endsWith('.app')) continue;
    const infoPath = path.join(frameworks, entry, 'Contents', 'Info.plist');
    if (!fs.existsSync(infoPath)) continue;
    try {
      execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :NSLocalNetworkUsageDescription', infoPath], {
        stdio: 'ignore',
      });
      continue;
    } catch (err) {
      // Key missing: add it below.
    }
    execFileSync(
      '/usr/libexec/PlistBuddy',
      ['-c', `Add :NSLocalNetworkUsageDescription string ${description}`, infoPath],
      { stdio: 'inherit' }
    );
    console.log(`[harden] NSLocalNetworkUsageDescription -> ${entry}`);
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
  declareLocalNetworkUsage(appPath);

  // Ad-hoc sign only when no formal signing is configured (electron-builder
  // signs with Developer ID otherwise, after this hook).
  execFileSync('bash', [path.join(__dirname, 'adhoc-sign.sh'), appPath], { stdio: 'inherit' });
};
