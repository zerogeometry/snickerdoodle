import { exchangeAuthCode } from '@/server/app/link';
import { appJson, jsonBody, withoutKey } from '@/server/app/http';

/**
 * POST /api/app/v1/token — { grant_type: 'authorization_code', code, code_verifier, redirect_uri,
 * client_id } → { token }. 400 { reason: 'invalid-grant' } for a wrong/used/expired code or verifier;
 * 403 { reason: 'not-owner' } when the grown-up doesn't run a family.
 */
export const POST = withoutKey(async ({ req, db }) => {
  const b = await jsonBody(req);
  const res = await exchangeAuthCode(db, {
    grantType: b.grant_type,
    code: b.code,
    codeVerifier: b.code_verifier,
    redirectUri: b.redirect_uri,
    clientId: b.client_id,
    userAgent: req.headers.get('user-agent'),
  });
  return res.ok ? appJson({ token: res.token }) : appJson({ reason: res.reason }, res.status);
});
