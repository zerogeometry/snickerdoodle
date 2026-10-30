import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { claimSecret } from '../uploadClaims';

/**
 * Proof that THIS admin passed two-step login recently, IN THIS SIGN-IN: an HMAC-signed, httpOnly
 * cookie naming the account, an expiry and (a hash of) the session it was earned in. It's checked
 * together with the signed-in session (same account, same session, still an admin), so it's useless
 * on its own, dies with the expiry, and dies with the session — signing out, or signing in again
 * from the same browser, asks for the code again (08-B10 / 07-B15).
 */
export const ADMIN_STEPUP_COOKIE = 'sd_admin_mfa';
export const STEPUP_HOURS = 8;

const sign = (payload: string) => createHmac('sha256', `admin-stepup:${claimSecret()}`).update(payload).digest('base64url');

/** The Auth.js session cookie (its secure name in production), whose value names this sign-in. */
export const SESSION_COOKIES = ['__Secure-authjs.session-token', 'authjs.session-token'] as const;
const sessionTag = (sessionToken: string) => createHash('sha256').update(`stepup-session:${sessionToken}`).digest('base64url').slice(0, 22);

export function signStepUp(accountId: string, sessionToken: string, now = Date.now()): string {
  const payload = `${accountId}.${now + STEPUP_HOURS * 3_600_000}.${sessionTag(sessionToken)}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyStepUp(cookie: string | null | undefined, accountId: string, sessionToken: string | null | undefined, now = Date.now()): boolean {
  if (!cookie || !sessionToken) return false;
  const i = cookie.lastIndexOf('.');
  if (i < 0) return false;
  const payload = cookie.slice(0, i), sig = cookie.slice(i + 1);
  const want = Buffer.from(sign(payload)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return false;
  const [id, exp, tag] = payload.split('.');
  return id === accountId && Number(exp) > now && tag === sessionTag(sessionToken);
}
