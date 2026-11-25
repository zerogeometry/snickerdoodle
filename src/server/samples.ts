import { eq } from 'drizzle-orm';
import { accounts } from '@/db/schema';
import type { DbHandle, Tx } from './db';
import { verifyStepUp } from './admin/stepUp';

/**
 * WHO may order a SAMPLE at cost (founder, 25 Nov 2026): a signed-in ADMIN who has done two-step login in THIS
 * sign-in. Decided here, server-side, from the database and the signed step-up cookie — never from the request.
 * There is no code to type, so there's nothing to copy, share or leak:
 *  - `accounts.is_admin` and an enrolled authenticator, read fresh from the database on every quote and order;
 *  - the step-up proof (src/server/admin/stepUp.ts): HMAC-signed, httpOnly, names this account, expires after
 *    8 hours, and is bound to this browser's sign-in session — useless to anyone else, or after signing out.
 * The basket's "order as a sample" switch only ASKS; without all of the above the order is priced as normal.
 * What "at cost" costs is src/pricing/sample.ts.
 */

/** Proof, made only by {@link sampleGrantFor}, that this account may order a sample right now. */
export interface SampleGrant {
  readonly accountId: string;
}

export interface SampleAsk {
  /** The signed-in account, resolved from the session by the caller (never the request). */
  account: { id: string } | null;
  /** The admin step-up cookie's value (sd_admin_mfa), as the browser sent it. */
  stepUpCookie: string | null | undefined;
  /** This browser's sign-in session token, which the step-up proof is bound to. */
  sessionToken: string | null | undefined;
  now?: number;
}

/** Is this account an admin with an authenticator enrolled, right now (the database, never a cached flag)? */
export async function isEnrolledAdmin(db: DbHandle | Tx, accountId: string): Promise<boolean> {
  const [row] = await db.select({ isAdmin: accounts.isAdmin, mfa: accounts.mfaSecret }).from(accounts).where(eq(accounts.id, accountId));
  return row?.isAdmin === true && !!row.mfa;
}

/** May this signed-in person order samples at cost (shows the basket's switch)? Admin + two-step login done. */
export async function canOrderSamples(db: DbHandle, ask: SampleAsk): Promise<boolean> {
  if (!ask.account) return false;
  if (!verifyStepUp(ask.stepUpCookie, ask.account.id, ask.sessionToken, ask.now)) return false;
  return isEnrolledAdmin(db, ask.account.id);
}

/**
 * The grant for ONE quote or order: only when the person asked for a sample (`wanted === true`) AND may have one.
 * Anything else — a signed-out buyer, a customer, an admin without two-step login, a forged or stale cookie,
 * a cookie from another sign-in — gets null, and normal prices.
 */
export async function sampleGrantFor(db: DbHandle, ask: SampleAsk & { wanted: unknown }): Promise<SampleGrant | null> {
  if (ask.wanted !== true || !ask.account) return null;
  if (!(await canOrderSamples(db, ask))) return null;
  return Object.freeze({ accountId: ask.account.id });
}
