/**
 * Post-sign notarization hook — called by electron-builder's afterSign.
 * Skips silently if APPLE_ID is not set (local/unsigned builds).
 *
 * Required env vars (set in CI or your local shell):
 *   APPLE_ID                   — your Apple ID email
 *   APPLE_APP_SPECIFIC_PASSWORD — app-specific password from appleid.apple.com
 *   APPLE_TEAM_ID              — 10-char team ID from developer.apple.com
 */
const { notarize } = require('@electron/notarize');
const path = require('path');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== 'darwin') return;

  if (!process.env.APPLE_ID) {
    console.log('⚠  Skipping notarization — APPLE_ID not set.');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`Notarizing ${appPath}…`);

  await notarize({
    tool: 'notarytool',
    appBundleId: 'com.gasalley.creativeautomationplatform',
    appPath,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  });

  console.log('✓ Notarization complete.');
};
