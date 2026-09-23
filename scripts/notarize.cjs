'use strict';

// electron-builder afterSign hook: notarize the app when Apple credentials are
// provided. Signing itself is handled by electron-builder (auto-discovers the
// Developer ID identity, or uses CSC_LINK/CSC_KEY_PASSWORD).
//
// Required env (all three) to notarize:
//   APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
// Set SKIP_NOTARIZE=1 to always skip.
const { notarize } = require('@electron/notarize');

exports.default = async function afterSign(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  if (electronPlatformName !== 'darwin') return;
  if (process.env.SKIP_NOTARIZE === '1') {
    console.log('[notarize] skipped (SKIP_NOTARIZE=1)');
    return;
  }

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;
  if (!appleId || !appleIdPassword || !teamId) {
    console.log('[notarize] skipped (APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID not set)');
    return;
  }

  const appName = packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;
  console.log(`[notarize] notarizing ${appPath} ...`);
  await notarize({ appPath, appleId, appleIdPassword, teamId });
  console.log('[notarize] done');
};
