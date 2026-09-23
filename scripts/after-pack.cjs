'use strict';

// electron-builder afterPack hook: run the ad-hoc signing shell script.
// (electron-builder hooks must be JS modules; the logic lives in shell.)
const path = require('path');
const { execFileSync } = require('child_process');

exports.default = async function afterPack(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  if (electronPlatformName !== 'darwin') return;
  const appPath = path.join(appOutDir, `${packager.appInfo.productFilename}.app`);
  execFileSync('bash', [path.join(__dirname, 'adhoc-sign.sh'), appPath], { stdio: 'inherit' });
};
