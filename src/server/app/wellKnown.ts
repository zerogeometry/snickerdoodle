/**
 * The two files phones fetch to trust that snickerdoodle.co.uk's /app/callback and /app/link belong to
 * Snickerdoodle Draw. They hold no data — just the app's id and its signing fingerprint. Both come
 * from settings so they can be filled in without a code change:
 *  - DRAW_ANDROID_CERT_SHA256: the SHA-256 fingerprint(s) of the app's signing key, comma-separated
 *    (Play Console → App integrity → App signing; add the upload key's too for test builds).
 *  - DRAW_APPLE_TEAM_ID: the 10-character Apple Developer Team ID.
 * Until they're set, Android simply won't verify the link (the website's /app/callback page has a
 * "back to snickerdoodle draw" button for that) and iOS gets a 404 (iOS uses the custom scheme anyway).
 */
export const DRAW_APP_ID = 'com.launchmode.snickerdoodle.draw';

export function drawAndroidStatements(env: Record<string, string | undefined> = process.env) {
  const prints = (env.DRAW_ANDROID_CERT_SHA256 ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s));
  if (!prints.length) return [];
  return [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: DRAW_APP_ID, sha256_cert_fingerprints: prints } }];
}

export function drawAppleAssociation(env: Record<string, string | undefined> = process.env) {
  const team = env.DRAW_APPLE_TEAM_ID?.trim();
  if (!team || !/^[A-Z0-9]{10}$/.test(team)) return null;
  return { applinks: { details: [{ appIDs: [`${team}.${DRAW_APP_ID}`], components: [{ '/': '/app/callback*' }, { '/': '/app/link*' }] }] } };
}
