'use server';

import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { accounts, auditRecords } from '@/db/schema';
import { getDb } from '@/db/client';
import { AuthzError } from '@/authz';
import { currentReviewer } from '@/server/admin/context';
import { decideReview, type ReviewKind } from '@/server/admin/review';
import { ADMIN_STEPUP_COOKIE, signStepUp, STEPUP_HOURS } from '@/server/admin/stepUp';
import { newTotpSecret, openSecret, otpauthUri, sealSecret, verifyTotp } from '@/server/admin/totp';

/**
 * Admin two-step login + content-review decisions. Every action re-checks the caller server-side
 * (an admin flag in the database, never a client claim). Non-admins get the same "not found"
 * silence as a page that doesn't exist.
 */

const PENDING_COOKIE = 'sd_admin_mfa_pending';
const cookieOpts = { httpOnly: true, sameSite: 'strict' as const, secure: process.env.NODE_ENV === 'production', path: '/' };

/** Step 1 of setting up: a new secret to add to an authenticator app (held sealed in a cookie until confirmed). */
export async function startMfaEnrolment(): Promise<{ ok: true; secret: string; uri: string } | { ok: false }> {
  const r = await currentReviewer();
  if (!r.accountId || !r.isAdmin || r.enrolled) return { ok: false };
  const secret = newTotpSecret();
  (await cookies()).set(PENDING_COOKIE, sealSecret(secret), { ...cookieOpts, maxAge: 15 * 60 });
  return { ok: true, secret, uri: otpauthUri(secret, r.email ?? 'admin') };
}

/** Step 2: the first code from the app proves it's set up; the secret is stored (encrypted). */
export async function confirmMfaEnrolment(code: string): Promise<{ ok: boolean }> {
  const r = await currentReviewer();
  if (!r.accountId || !r.isAdmin || r.enrolled) return { ok: false };
  const jar = await cookies();
  const secret = openSecret(jar.get(PENDING_COOKIE)?.value);
  if (!secret || !verifyTotp(secret, code)) return { ok: false };
  const db = getDb();
  await db.update(accounts).set({ mfaSecret: sealSecret(secret) }).where(eq(accounts.id, r.accountId));
  await db.insert(auditRecords).values({ actorAccountId: r.accountId, actorType: 'ADMIN', event: 'ADMIN_MFA_ENROLLED', targetType: 'account', targetId: r.accountId });
  jar.delete(PENDING_COOKIE);
  jar.set(ADMIN_STEPUP_COOKIE, signStepUp(r.accountId), { ...cookieOpts, maxAge: STEPUP_HOURS * 3600 });
  return { ok: true };
}

/** Each session: the current code from the app. */
export async function verifyMfa(code: string): Promise<{ ok: boolean }> {
  const r = await currentReviewer();
  if (!r.accountId || !r.isAdmin || !r.enrolled) return { ok: false };
  const [row] = await getDb().select({ mfa: accounts.mfaSecret }).from(accounts).where(eq(accounts.id, r.accountId));
  const secret = openSecret(row?.mfa);
  if (!secret || !verifyTotp(secret, code)) return { ok: false };
  (await cookies()).set(ADMIN_STEPUP_COOKIE, signStepUp(r.accountId), { ...cookieOpts, maxAge: STEPUP_HOURS * 3600 });
  return { ok: true };
}

/** Clear (fine to print/show) or remove (takedown) a flagged item. */
export async function decideReviewAction(kind: ReviewKind, id: string, decision: 'clear' | 'remove'): Promise<{ ok: boolean }> {
  if ((kind !== 'keepsake' && kind !== 'profile') || (decision !== 'clear' && decision !== 'remove') || typeof id !== 'string') return { ok: false };
  try {
    await decideReview(getDb(), await currentReviewer(), kind, id, decision);
  } catch (e) {
    if (e instanceof AuthzError) return { ok: false };
    throw e;
  }
  revalidatePath('/admin/review');
  return { ok: true };
}
