// electron-builder afterSign hook (macOS).
//
// Two modes:
//   • Apple credentials present (CI with secrets) → NOTARIZE + staple the app
//     so Gatekeeper opens it with no warning and permissions persist for good.
//   • No credentials (unsigned build) → apply a clean, deep AD-HOC signature so
//     the bundle has a single valid, consistent signature. macOS keys TCC
//     (Microphone / Accessibility) grants off the code signature; an invalid or
//     inconsistent one makes it re-prompt forever, so a clean ad-hoc signature
//     lets grants stick for that installed copy.
//
// Required env for notarization (set in CI from repo secrets):
//   APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
// (Signing identity itself uses CSC_LINK / CSC_KEY_PASSWORD via electron-builder.)

const { execFileSync } = require('node:child_process');

exports.default = async function afterSign(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
  const haveCreds = APPLE_ID && APPLE_APP_SPECIFIC_PASSWORD && APPLE_TEAM_ID;

  if (!haveCreds) {
    // Unsigned build: guarantee a clean, valid ad-hoc signature on the whole
    // bundle so macOS stops treating it as "modified" on every launch.
    console.log('[sign] No Apple credentials — applying clean ad-hoc signature.');
    try {
      execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
      console.log('[sign] Ad-hoc signature applied.');
    } catch (err) {
      console.warn('[sign] Ad-hoc signing failed:', err.message);
    }
    return;
  }

  // Signed build: notarize with Apple, then staple the approval ticket.
  const { notarize } = require('@electron/notarize');
  console.log(`[notarize] Submitting ${appName}.app to Apple (can take a few minutes)…`);
  await notarize({
    appPath,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID,
  });
  console.log('[notarize] Approved — stapling ticket…');
  execFileSync('xcrun', ['stapler', 'staple', appPath], { stdio: 'inherit' });
  console.log('[notarize] Done.');
};
