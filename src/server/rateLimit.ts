import 'server-only';
import { createHmac } from 'node:crypto';
import { lt, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { rateLimits } from '@/db/schema';
import type { DbHandle } from './db';

/**
 * ONE small rate limiter for the whole app, in the Postgres we already run (no new service, no
 * standing cost). Fixed windows: each (bucket, caller) row counts actions since its window began;
 * an atomic upsert increments it — or restarts it once the window has passed — so concurrent
 * requests can't slip past the limit. Callers are stored as an HMAC (IP / email / account id are
 * never written in the clear), and rows are purged a day after their window (the retention job).
 *
 * Fail-open by default: if the database hiccups, the action goes ahead (a limiter must never take
 * the shop down). Pass `failClosed` where a guess is the threat (a password, a two-step code).
 */
export interface Limit {
  /** what is being limited, e.g. 'magic-link:email' */
  bucket: string;
  /** who: an IP, an email, an account id (hashed before storage) */
  caller: string;
  /** how many actions per window */
  limit: number;
  windowSec: number;
  /** how much this action counts (a batch of 8 previews counts 8) — default 1 */
  cost?: number;
  failClosed?: boolean;
}
export interface LimitResult {
  ok: boolean;
  /** seconds until the window resets (0 when ok) */
  retryAfterSec: number;
}

/** The caller's fingerprint — an HMAC, so the table never holds a raw IP or email. */
export function callerKey(bucket: string, caller: string, secret = process.env.AUTH_SECRET ?? 'dev-rate-limit'): string {
  const h = createHmac('sha256', `rate-limit:${secret}`).update(caller.trim().toLowerCase()).digest('base64url').slice(0, 32);
  return `${bucket}:${h}`;
}

export async function rateLimit(db: DbHandle, l: Limit): Promise<LimitResult> {
  const key = callerKey(l.bucket, l.caller);
  const cost = Math.max(1, Math.round(l.cost ?? 1));
  const window = `${Math.max(1, Math.round(l.windowSec))} seconds`;
  try {
    const rows = await db.execute<{ count: number; window_start: Date | string }>(sql`
      insert into rate_limits (key, window_start, count) values (${key}, now(), ${cost})
      on conflict (key) do update set
        count = case when rate_limits.window_start <= now() - ${window}::interval then ${cost} else rate_limits.count + ${cost} end,
        window_start = case when rate_limits.window_start <= now() - ${window}::interval then now() else rate_limits.window_start end
      returning count, window_start`);
    const row = (Array.isArray(rows) ? rows[0] : (rows as unknown as { rows: { count: number; window_start: Date | string }[] }).rows[0])!;
    if (Number(row.count) <= l.limit) return { ok: true, retryAfterSec: 0 };
    const started = new Date(row.window_start).getTime();
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((started + l.windowSec * 1000 - Date.now()) / 1000)) };
  } catch (err) {
    console.warn('[rate-limit] check failed:', err instanceof Error ? err.message : err);
    return l.failClosed ? { ok: false, retryAfterSec: 60 } : { ok: true, retryAfterSec: 0 };
  }
}

/** Every limit must pass (e.g. per-email AND per-IP). Each is still counted. */
export async function rateLimitAll(db: DbHandle, limits: Limit[]): Promise<LimitResult> {
  const results = await Promise.all(limits.map((l) => rateLimit(db, l)));
  const blocked = results.filter((r) => !r.ok);
  return blocked.length ? { ok: false, retryAfterSec: Math.max(...blocked.map((r) => r.retryAfterSec)) } : { ok: true, retryAfterSec: 0 };
}

/**
 * The caller's IP. A host can name the ONE header its proxy sets and a visitor can't forge, with
 * CLIENT_IP_HEADER (the AWS box: `x-real-ip`, which Caddy overwrites on every request) — then
 * nothing else is read, so a visitor-supplied header can never pick their rate-limit bucket.
 * Unset (Netlify, local dev): the platform's own header first (Netlify sets
 * x-nf-client-connection-ip), else the usual proxy headers. 'unknown' when there's none.
 */
export function ipFromHeaders(h: Pick<Headers, 'get'>, env: Record<string, string | undefined> = process.env): string {
  const pinned = (env.CLIENT_IP_HEADER ?? '').trim().toLowerCase();
  if (pinned) {
    const v = h.get(pinned);
    return v ? v.split(',')[0]!.trim() || 'unknown' : 'unknown';
  }
  const nf = h.get('x-nf-client-connection-ip');
  if (nf) return nf.trim();
  const real = h.get('x-real-ip');
  if (real) return real.trim();
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return 'unknown';
}

/** The current request's IP (server actions / route handlers). */
export async function clientIp(): Promise<string> {
  try {
    return ipFromHeaders(await headers());
  } catch {
    return 'unknown';
  }
}

/** Forget windows that ended over a day ago (run by the retention job). */
export async function purgeExpiredRateLimits(db: DbHandle): Promise<number> {
  const gone = await db.delete(rateLimits).where(lt(rateLimits.windowStart, sql`now() - interval '1 day'`)).returning({ key: rateLimits.key });
  return gone.length;
}

/** The limits, in one place — generous for real families, tight where guessing is the threat. */
export const LIMITS = {
  magicLinkPerEmail: { bucket: 'magic-link:email', limit: 5, windowSec: 3600 },
  magicLinkPerIp: { bucket: 'magic-link:ip', limit: 20, windowSec: 3600 },
  emailChange: { bucket: 'email-change:account', limit: 5, windowSec: 3600 },
  guestUploadPerIp: { bucket: 'upload:guest-ip', limit: 60, windowSec: 3600 },
  homeUploadPerAccount: { bucket: 'upload:account', limit: 120, windowSec: 3600 },
  testGatePerIp: { bucket: 'test-gate:ip', limit: 10, windowSec: 900, failClosed: true },
  mfaPerAccount: { bucket: 'mfa:account', limit: 5, windowSec: 900, failClosed: true },
  complaintPerIp: { bucket: 'complaint:ip', limit: 5, windowSec: 3600 },
  supportPerIp: { bucket: 'support:ip', limit: 6, windowSec: 3600 },
  // the news-list sign-up (each inbox is also throttled to one confirmation email per 10 minutes)
  waitlistPerIp: { bucket: 'waitlist:ip', limit: 10, windowSec: 3600 },
  reportPerIp: { bucket: 'report:ip', limit: 10, windowSec: 3600 },
  reportPerAccount: { bucket: 'report:account', limit: 10, windowSec: 3600 },
  invitesPerAccount: { bucket: 'invite:account', limit: 20, windowSec: 3600 },
  giftLinksPerAccount: { bucket: 'gift-link:account', limit: 30, windowSec: 3600 },
  giftRequestsPerAccount: { bucket: 'gift-request:account', limit: 20, windowSec: 3600 },
  rememberKeepPerIp: { bucket: 'remember-keep:ip', limit: 10, windowSec: 3600 },
  mockupsPerIp: { bucket: 'mockup:ip', limit: 1500, windowSec: 600 },
  mockupContextsPerIp: { bucket: 'mockup-contexts:ip', limit: 120, windowSec: 600 },
  giftPreviewPerIp: { bucket: 'gift-preview:ip', limit: 600, windowSec: 600 },
  printPreviewPerIp: { bucket: 'print-preview:ip', limit: 60, windowSec: 600 },
  magicEditsPerIp: { bucket: 'magic-edit:ip', limit: 60, windowSec: 600 },
} as const satisfies Record<string, Omit<Limit, 'caller'>>;
