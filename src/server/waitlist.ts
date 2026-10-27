import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { auditRecords, consentRecords, waitlistSignups } from '@/db/schema';
import { WAITLIST_CONSENT_VERSION, WAITLIST_CONSENT_WORDING, normaliseWaitlistEmail, type WaitlistJoinReason } from '@/lib/waitlist';
import type { DbHandle } from './db';
import { appUrl, sendMail, type MailMessage } from './mail';

/**
 * The "founding families" waitlist (P0 scope L; acceptance criterion 15 — PECR).
 *
 *  - Email ONLY. No name, nothing about any child, before or after the gate.
 *  - Consent is a separate, unticked tick-box (never bundled with terms) AND a double opt-in:
 *    a sign-up row is not consent. Only the confirm tap writes a GRANTED consent_record
 *    (purpose MARKETING · channel EMAIL · basis CONSENT) + a CONSENT_CHANGED audit.
 *  - Every email carries a one-tap unsubscribe link (and RFC 8058 headers); unsubscribing writes
 *    WITHDRAWN + CONSENT_CHANGED.
 *  - Repeat sign-ups are idempotent and never reveal whether an address is already on the list;
 *    re-sends to one inbox are throttled so the form can't be used to spam someone.
 *  - Unconfirmed addresses are purged after WAITLIST_UNCONFIRMED_DAYS (the retention job).
 */

export const WAITLIST_CONFIRM_DAYS = 7;
export const WAITLIST_UNCONFIRMED_DAYS = 30;
/** At most one confirmation email per inbox per this window, however often the form is sent. */
export const WAITLIST_RESEND_MS = 10 * 60_000;
const SOURCE = 'waitlist';
const DAY = 86_400_000;

/** An unguessable, URL-safe token (256 bits). */
export function newWaitlistToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Only the hash of a confirm token is stored; the raw token lives only in the email. */
export function hashWaitlistToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** A token as it arrives from a link: the right shape, or null (never hits the DB otherwise). */
export function parseWaitlistToken(raw: unknown): string | null {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{43}$/.test(raw) ? raw : null;
}

export const waitlistConfirmUrl = (token: string, env?: Record<string, string | undefined>) => appUrl(`/waitlist/confirm?t=${token}`, env);
export const waitlistUnsubscribeUrl = (token: string, env?: Record<string, string | undefined>) =>
  appUrl(`/api/waitlist/unsubscribe?t=${token}`, env);

export function confirmationEmail(to: string, confirmToken: string, unsubscribeToken: string, env?: Record<string, string | undefined>): MailMessage {
  const unsubscribeUrl = waitlistUnsubscribeUrl(unsubscribeToken, env);
  return {
    kind: 'waitlist-confirm',
    to,
    subject: 'one tap to join the founding families',
    unsubscribeUrl,
    text: [
      'Hello!',
      '',
      'Someone (hopefully you) asked to join snickerdoodle’s founding families with this email address.',
      '',
      'Tap here to say yes — until you do, we won’t send you anything else:',
      waitlistConfirmUrl(confirmToken, env),
      '',
      `That link works for ${WAITLIST_CONFIRM_DAYS} days. Not you? Just ignore this — we’ll forget the address within ${WAITLIST_UNCONFIRMED_DAYS} days.`,
      '',
      'Changed your mind? One tap and you’re off the list:',
      unsubscribeUrl,
      '',
      '— the snickerdoodle team · keep the magic',
    ].join('\n'),
  };
}

export type JoinOutcome =
  | { ok: true; status: 'sent' | 'already-confirmed' | 'throttled' | 'ignored' }
  | { ok: false; reason: WaitlistJoinReason };

/**
 * Add an email to the list (pending confirmation) and send the double-opt-in email.
 * `website` is the honeypot: a filled one is quietly accepted and dropped.
 */
export async function joinWaitlist(
  db: DbHandle,
  input: { email: unknown; consent: unknown; website?: unknown },
  deps: { now?: Date; send?: (m: MailMessage) => Promise<void>; env?: Record<string, string | undefined> } = {},
): Promise<JoinOutcome> {
  if (typeof input.website === 'string' && input.website.trim() !== '') return { ok: true, status: 'ignored' };
  const email = normaliseWaitlistEmail(input.email);
  if (!email) return { ok: false, reason: 'invalid-email' };
  // Explicit, affirmative consent only: the literal `true` from a tick-box the person ticked.
  if (input.consent !== true) return { ok: false, reason: 'needs-consent' };

  const now = deps.now ?? new Date();
  const send = deps.send ?? sendMail;

  await db
    .insert(waitlistSignups)
    .values({ email, consentVersion: WAITLIST_CONSENT_VERSION, unsubscribeToken: newWaitlistToken(), createdAt: now })
    .onConflictDoNothing({ target: waitlistSignups.email });
  const [row] = await db.select().from(waitlistSignups).where(eq(waitlistSignups.email, email));
  if (!row) return { ok: false, reason: 'error' };

  // Already on the list and consented: nothing to do, and nothing that tells the form so.
  if (row.confirmedAt && !row.unsubscribedAt) return { ok: true, status: 'already-confirmed' };
  if (row.confirmSentAt && now.getTime() - row.confirmSentAt.getTime() < WAITLIST_RESEND_MS) return { ok: true, status: 'throttled' };

  // Fresh (or a past unsubscriber signing up again — new consent, new opt-in): a new confirm token.
  const token = newWaitlistToken();
  await db
    .update(waitlistSignups)
    .set({
      confirmTokenHash: hashWaitlistToken(token),
      confirmTokenExpiresAt: new Date(now.getTime() + WAITLIST_CONFIRM_DAYS * DAY),
      consentVersion: WAITLIST_CONSENT_VERSION,
      confirmedAt: null,
      unsubscribedAt: null,
    })
    .where(eq(waitlistSignups.id, row.id));
  await send(confirmationEmail(email, token, row.unsubscribeToken, deps.env));
  await db.update(waitlistSignups).set({ confirmSentAt: now }).where(eq(waitlistSignups.id, row.id));
  return { ok: true, status: 'sent' };
}

async function latestConsent(db: DbHandle, signupId: string) {
  const [latest] = await db
    .select({ status: consentRecords.status })
    .from(consentRecords)
    .where(and(eq(consentRecords.waitlistSignupId, signupId), eq(consentRecords.channel, 'EMAIL'), eq(consentRecords.purpose, 'MARKETING')))
    .orderBy(desc(consentRecords.createdAt))
    .limit(1);
  return latest?.status ?? null;
}

async function recordConsent(db: DbHandle, signupId: string, status: 'GRANTED' | 'WITHDRAWN', evidence: Record<string, unknown>, now: Date) {
  await db.insert(consentRecords).values({
    waitlistSignupId: signupId,
    channel: 'EMAIL',
    purpose: 'MARKETING',
    status,
    basis: 'CONSENT',
    source: SOURCE,
    evidence,
    createdAt: now,
  });
  // ids only — the address itself never goes in the audit trail
  await db.insert(auditRecords).values({
    actorType: 'ANON',
    event: 'CONSENT_CHANGED',
    targetType: 'waitlist_signup',
    targetId: signupId,
    metadata: { channel: 'EMAIL', purpose: 'MARKETING', status, source: SOURCE },
    createdAt: now,
  });
}

export type ConfirmOutcome = { ok: true; already: boolean } | { ok: false; reason: 'invalid' | 'expired' };

/** The double-opt-in tap. Only this grants marketing consent. Re-tapping is harmless. */
export async function confirmWaitlist(db: DbHandle, rawToken: unknown, now = new Date()): Promise<ConfirmOutcome> {
  const token = parseWaitlistToken(rawToken);
  if (!token) return { ok: false, reason: 'invalid' };
  const [row] = await db.select().from(waitlistSignups).where(eq(waitlistSignups.confirmTokenHash, hashWaitlistToken(token)));
  if (!row || row.unsubscribedAt) return { ok: false, reason: 'invalid' };
  if (row.confirmedAt) return { ok: true, already: true };
  if (!row.confirmTokenExpiresAt || row.confirmTokenExpiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'expired' };

  // Claim the confirmation atomically, so two taps can't write two GRANTED rows.
  const claimed = await db
    .update(waitlistSignups)
    .set({ confirmedAt: now })
    .where(and(eq(waitlistSignups.id, row.id), isNull(waitlistSignups.confirmedAt)))
    .returning({ id: waitlistSignups.id });
  if (claimed.length === 0) return { ok: true, already: true };
  await recordConsent(
    db,
    row.id,
    'GRANTED',
    { method: 'double-opt-in', wordingVersion: row.consentVersion, wording: WAITLIST_CONSENT_WORDING, askedAt: row.confirmSentAt?.toISOString() ?? null, confirmedAt: now.toISOString() },
    now,
  );
  return { ok: true, already: false };
}

/** One-tap unsubscribe (from any waitlist email). Idempotent; unknown tokens are a quiet no-op. */
export async function unsubscribeWaitlist(db: DbHandle, rawToken: unknown, now = new Date()): Promise<{ ok: boolean }> {
  const token = parseWaitlistToken(rawToken);
  if (!token) return { ok: false };
  const [row] = await db.select().from(waitlistSignups).where(eq(waitlistSignups.unsubscribeToken, token));
  if (!row) return { ok: false };
  if (!row.unsubscribedAt) {
    // also kills any outstanding confirm link, so an old email can't sign them back up
    await db.update(waitlistSignups).set({ unsubscribedAt: now, confirmTokenHash: null, confirmTokenExpiresAt: null }).where(eq(waitlistSignups.id, row.id));
  }
  if ((await latestConsent(db, row.id)) === 'GRANTED') {
    await recordConsent(db, row.id, 'WITHDRAWN', { method: 'one-tap-unsubscribe' }, now);
  }
  return { ok: true };
}

/** Retention: forget addresses that never confirmed (their last confirmation email is > 30 days old). */
export async function purgeUnconfirmedWaitlist(db: DbHandle, now = new Date()): Promise<{ purged: number }> {
  const cutoff = new Date(now.getTime() - WAITLIST_UNCONFIRMED_DAYS * DAY);
  const gone = await db
    .delete(waitlistSignups)
    .where(and(isNull(waitlistSignups.confirmedAt), sql`coalesce(${waitlistSignups.confirmSentAt}, ${waitlistSignups.createdAt}) < ${cutoff.toISOString()}::timestamptz`))
    .returning({ id: waitlistSignups.id });
  return { purged: gone.length };
}
