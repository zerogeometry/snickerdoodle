import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { auditRecords, consentRecords, waitlistSignups } from '@/db/schema';
import type { DbHandle } from '@/server/db';
import type { MailMessage } from '@/server/mail';
import { WAITLIST_CONSENT_VERSION } from '@/lib/waitlist';
import {
  WAITLIST_RESEND_MS,
  confirmWaitlist,
  hashWaitlistToken,
  joinWaitlist,
  purgeUnconfirmedWaitlist,
  unsubscribeWaitlist,
} from '@/server/waitlist';

const DB = process.env.DATABASE_URL;
const env = { APP_URL: 'https://snickerdoodle.test' };

/** The "founding families" waitlist end to end against Postgres (P0 L · criterion 15 · PECR). */
describe.skipIf(!DB)('waitlist — integration', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  const emails: string[] = [];
  const outbox: MailMessage[] = [];
  const send = async (m: MailMessage) => void outbox.push(m);
  const fresh = (tag: string) => {
    const e = `wl-${tag}-${randomBytes(4).toString('hex')}@example.com`;
    emails.push(e);
    return e;
  };
  const tokenFrom = (m: MailMessage, path: string) => new RegExp(`${path}\\?t=([A-Za-z0-9_-]{43})`).exec(m.text)?.[1] ?? '';
  const row = async (email: string) => (await db.select().from(waitlistSignups).where(eq(waitlistSignups.email, email)))[0];
  const consents = async (id: string) =>
    db.select().from(consentRecords).where(eq(consentRecords.waitlistSignupId, id)).orderBy(asc(consentRecords.createdAt));
  const audits = async (id: string) =>
    db.select().from(auditRecords).where(and(eq(auditRecords.targetType, 'waitlist_signup'), eq(auditRecords.targetId, id))).orderBy(asc(auditRecords.createdAt));

  beforeAll(() => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
  });
  afterAll(async () => {
    if (emails.length) await db.delete(waitlistSignups).where(inArray(waitlistSignups.email, emails));
    await client.end();
  });

  it('sign-up → unconfirmed (no consent yet) → confirm → GRANTED + audited', async () => {
    const email = fresh('happy');
    const t0 = new Date();
    const res = await joinWaitlist(db, { email: `  ${email.toUpperCase()} `, consent: true }, { send, env, now: t0 });
    expect(res).toEqual({ ok: true, status: 'sent' });

    const pending = (await row(email))!;
    expect(pending.email).toBe(email); // lowercased + trimmed
    expect(pending.confirmedAt).toBeNull();
    expect(pending.consentVersion).toBe(WAITLIST_CONSENT_VERSION);
    expect(await consents(pending.id)).toHaveLength(0); // a sign-up row is NOT consent

    const mail = outbox.at(-1)!;
    expect(mail.to).toBe(email);
    expect(mail.kind).toBe('waitlist-confirm');
    const confirmToken = tokenFrom(mail, '/waitlist/confirm');
    expect(pending.confirmTokenHash).toBe(hashWaitlistToken(confirmToken)); // only the hash is stored
    expect(JSON.stringify(pending)).not.toContain(confirmToken);
    expect(tokenFrom(mail, '/api/waitlist/unsubscribe')).toBe(pending.unsubscribeToken);

    expect(await confirmWaitlist(db, confirmToken)).toEqual({ ok: true, already: false });
    expect(await confirmWaitlist(db, confirmToken)).toEqual({ ok: true, already: true }); // re-tap is harmless

    const confirmed = (await row(email))!;
    expect(confirmed.confirmedAt).not.toBeNull();
    const c = await consents(confirmed.id);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ purpose: 'MARKETING', channel: 'EMAIL', basis: 'CONSENT', status: 'GRANTED', source: 'waitlist', accountId: null });
    expect(c[0]!.evidence).toMatchObject({ method: 'double-opt-in', wordingVersion: WAITLIST_CONSENT_VERSION });
    const a = await audits(confirmed.id);
    expect(a.map((r) => r.event)).toEqual(['CONSENT_CHANGED']);
    expect(a[0]!.metadata).toMatchObject({ status: 'GRANTED', purpose: 'MARKETING' });
    expect(JSON.stringify(a)).not.toContain(email); // ids only in the audit trail
  });

  it('unsubscribe → WITHDRAWN + audited; idempotent; kills the old confirm link', async () => {
    const email = fresh('unsub');
    await joinWaitlist(db, { email, consent: true }, { send, env });
    const confirmToken = tokenFrom(outbox.at(-1)!, '/waitlist/confirm');
    await confirmWaitlist(db, confirmToken);
    const { id, unsubscribeToken } = (await row(email))!;

    expect(await unsubscribeWaitlist(db, unsubscribeToken)).toEqual({ ok: true });
    expect(await unsubscribeWaitlist(db, unsubscribeToken)).toEqual({ ok: true }); // second tap: no new rows

    const after = (await row(email))!;
    expect(after.unsubscribedAt).not.toBeNull();
    expect((await consents(id)).map((r) => r.status)).toEqual(['GRANTED', 'WITHDRAWN']);
    expect((await audits(id)).map((r) => (r.metadata as { status: string }).status)).toEqual(['GRANTED', 'WITHDRAWN']);
    expect(await confirmWaitlist(db, confirmToken)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('a duplicate sign-up is idempotent: one row, no duplicate consent, re-sends throttled, nothing revealed', async () => {
    const email = fresh('dup');
    const t0 = new Date();
    await joinWaitlist(db, { email, consent: true }, { send, env, now: t0 });
    const sentBefore = outbox.length;
    expect(await joinWaitlist(db, { email: email.toUpperCase(), consent: true }, { send, env, now: new Date(t0.getTime() + 1000) })).toEqual({ ok: true, status: 'throttled' });
    expect(outbox.length).toBe(sentBefore); // no inbox-bombing
    expect(await db.select().from(waitlistSignups).where(eq(waitlistSignups.email, email))).toHaveLength(1);

    // after the throttle window a fresh link goes out, and the old one stops working
    const firstToken = tokenFrom(outbox.at(-1)!, '/waitlist/confirm');
    expect(await joinWaitlist(db, { email, consent: true }, { send, env, now: new Date(t0.getTime() + WAITLIST_RESEND_MS + 1000) })).toEqual({ ok: true, status: 'sent' });
    const secondToken = tokenFrom(outbox.at(-1)!, '/waitlist/confirm');
    expect(secondToken).not.toBe(firstToken);
    expect(await confirmWaitlist(db, firstToken)).toEqual({ ok: false, reason: 'invalid' });
    expect(await confirmWaitlist(db, secondToken)).toEqual({ ok: true, already: false });

    // already confirmed: accepted quietly, no email, no second GRANTED
    const n = outbox.length;
    expect(await joinWaitlist(db, { email, consent: true }, { send, env })).toEqual({ ok: true, status: 'already-confirmed' });
    expect(outbox.length).toBe(n);
    const { id } = (await row(email))!;
    expect((await consents(id)).map((r) => r.status)).toEqual(['GRANTED']);
  });

  it('the honeypot is accepted and dropped: nothing stored, nothing sent', async () => {
    const email = fresh('bot');
    const n = outbox.length;
    expect(await joinWaitlist(db, { email, consent: true, website: 'http://spam.example' }, { send, env })).toEqual({ ok: true, status: 'ignored' });
    expect(await row(email)).toBeUndefined();
    expect(outbox.length).toBe(n);
  });

  it('no consent tick (or a truthy-but-not-true value) → refused, nothing stored', async () => {
    const email = fresh('noconsent');
    for (const consent of [false, undefined, 'true', 1, 'on']) {
      expect(await joinWaitlist(db, { email, consent }, { send, env })).toEqual({ ok: false, reason: 'needs-consent' });
    }
    expect(await joinWaitlist(db, { email: 'not-an-email', consent: true }, { send, env })).toEqual({ ok: false, reason: 'invalid-email' });
    expect(await row(email)).toBeUndefined();
  });

  it('an expired confirm link grants nothing; unconfirmed addresses are purged after 30 days', async () => {
    const email = fresh('stale');
    const long = new Date(Date.now() - 40 * 86_400_000);
    await joinWaitlist(db, { email, consent: true }, { send, env, now: long });
    const token = tokenFrom(outbox.at(-1)!, '/waitlist/confirm');
    expect(await confirmWaitlist(db, token)).toEqual({ ok: false, reason: 'expired' });

    const keep = fresh('keep');
    await joinWaitlist(db, { email: keep, consent: true }, { send, env, now: long });
    await db.update(waitlistSignups).set({ confirmedAt: long }).where(eq(waitlistSignups.email, keep)); // confirmed long ago

    const { purged } = await purgeUnconfirmedWaitlist(db);
    expect(purged).toBeGreaterThanOrEqual(1);
    expect(await row(email)).toBeUndefined();
    expect(await row(keep)).toBeDefined();
  });

  it('a consent record must have exactly one subject (account XOR waitlist sign-up)', async () => {
    await expect(
      db.insert(consentRecords).values({ channel: 'EMAIL', purpose: 'MARKETING', status: 'GRANTED', basis: 'CONSENT' }),
    ).rejects.toThrow();
  });
});
