import { createHmac, timingSafeEqual } from 'node:crypto';
import { claimSecret } from '../uploadClaims';

/**
 * Proof that THIS admin passed two-step login recently: an HMAC-signed, httpOnly cookie naming the
 * account and an expiry. It's checked together with the signed-in session (same account, still an
 * admin), so it's useless on its own and dies with the expiry.
 */
export const ADMIN_STEPUP_COOKIE = 'sd_admin_mfa';
export const STEPUP_HOURS = 8;

const sign = (payload: string) => createHmac('sha256', `admin-stepup:${claimSecret()}`).update(payload).digest('base64url');

export function signStepUp(accountId: string, now = Date.now()): string {
  const payload = `${accountId}.${now + STEPUP_HOURS * 3_600_000}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyStepUp(cookie: string | null | undefined, accountId: string, now = Date.now()): boolean {
  if (!cookie) return false;
  const i = cookie.lastIndexOf('.');
  if (i < 0) return false;
  const payload = cookie.slice(0, i), sig = cookie.slice(i + 1);
  const want = Buffer.from(sign(payload)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return false;
  const [id, exp] = payload.split('.');
  return id === accountId && Number(exp) > now;
}
