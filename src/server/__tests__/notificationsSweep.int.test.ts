import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { accounts, children, consentRecords, emailChangeRequests, giftLinks, memberships, orders, reminderSends, rightsRequests, supportRequests } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import type { MailMessage } from '@/server/mail';
import type { DbHandle } from '@/server/db';

/**
 * Test sweep 2026-10-29 (tester 04): every email the server sends from these paths goes ONLY to the
 * right person, says the right thing, and links where it should — reminders (consent + calendar
 * sharing + once-only), order confirmed / shipped, "bought from your gift list", email change,
 * complaint + support acknowledgements, and the family hand-over. The mailer is captured (nothing is
 * sent anywhere). Invite + sign-in emails are covered end to end in e2e/family-invites.spec.ts.
 */
const sent: MailMessage[] = [];
vi.mock('@/server/mail', async (orig) => ({ ...(await orig<typeof import('@/server/mail')>()), sendMail: vi.fn(async (m: MailMessage) => void sent.push(m)) }));

const { runReminders, setReminderConsent } = await import('@/server/reminders');
const { sendOrderConfirmed, sendOrderShipped } = await import('@/server/orderEmails');
const { notifyGiftListPurchase } = await import('@/server/giftListNotify');
const { requestEmailChange, confirmEmailChange } = await import('@/server/profile');
const { submitComplaint } = await import('@/server/rights');
const { submitSupportRequest } = await import('@/server/support');
const { handOverFamily } = await import('@/server/accountClosure');

const DB = process.env.DATABASE_URL;

describe.skipIf(!DB)('test sweep 04 — who each email goes to (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const nonce = randomUUID().slice(0, 8);
  const email: Record<string, string> = {};
  const orderIds: string[] = [];
  const linkIds: string[] = [];

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    for (const [k, id] of Object.entries({ sam: ids.samId, jo: ids.joId, rosie: ids.rosieId, mallory: ids.malloryId, blake: ids.blakeId })) {
      email[k] = (await db.select({ e: accounts.email }).from(accounts).where(eq(accounts.id, id)))[0]!.e;
    }
  });
  beforeEach(() => void sent.splice(0));
  afterAll(async () => {
    const accts = [ids.samId, ids.joId, ids.rosieId, ids.malloryId, ids.blakeId];
    if (orderIds.length) await db.delete(orders).where(inArray(orders.id, orderIds));
    if (linkIds.length) await db.delete(giftLinks).where(inArray(giftLinks.id, linkIds));
    await db.delete(reminderSends).where(inArray(reminderSends.accountId, accts));
    await db.delete(consentRecords).where(inArray(consentRecords.accountId, accts));
    await db.delete(emailChangeRequests).where(inArray(emailChangeRequests.accountId, accts));
    await db.delete(rightsRequests).where(eq(rightsRequests.subjectEmail, `complainer-${nonce}@example.test`));
    await db.delete(supportRequests).where(eq(supportRequests.email, `asker-${nonce}@example.test`));
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  const ours = () => sent.filter((m) => Object.values(email).includes(m.to) || m.to.includes(nonce));

  it('birthday reminders: only people the calendar is shared with AND who said yes; first name only; once', async () => {
    const d = new Date(Date.now() + 28 * 86_400_000);
    const turns = d.getUTCFullYear() - 2021;
    const bday = `2021-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    await db.update(children).set({ birthday: bday }).where(eq(children.id, ids.oliviaId));
    // the calendar: shared with Jo (Family) and Rosie (Extended); Mallory was removed
    await db.update(memberships).set({ seesOccasions: true }).where(and(eq(memberships.familyId, ids.hartleyId), inArray(memberships.accountId, [ids.joId, ids.rosieId, ids.malloryId])));
    // consent: Sam + Jo + Mallory + Blake say yes; Rosie said yes then no
    for (const id of [ids.samId, ids.joId, ids.malloryId, ids.blakeId, ids.rosieId]) await setReminderConsent(db, id, true, 'sweep04');
    await setReminderConsent(db, ids.rosieId, false, 'sweep04');

    await runReminders(db);
    const got = ours().filter((m) => m.kind === 'reminder');
    expect(got.map((m) => m.to).sort()).toEqual([email.sam, email.jo].sort());
    for (const m of got) {
      expect(m.subject).toBe(`coming up: Olivia turns ${turns} ✦`);
      expect(m.text).toContain(`Olivia turns ${turns}`);
      expect(m.text).toContain('in about a month');
      expect(m.text).toMatch(/\/family\n?/); // the one-tap off switch
      expect(m.text).not.toMatch(/Hartley/); // no family surname
    }
    // once-only: a second run the same day sends nothing new
    sent.splice(0);
    await runReminders(db);
    expect(ours().filter((m) => m.kind === 'reminder')).toHaveLength(0);
  });

  async function order(over: Partial<typeof orders.$inferInsert>) {
    const [o] = await db
      .insert(orders)
      .values({ ref: `SWP-${nonce}-${orderIds.length}`, subtotalPence: 1900, deliveryPence: 0, totalPence: 1900, status: 'PAID', ...over })
      .returning({ id: orders.id, ref: orders.ref });
    orderIds.push(o!.id);
    return o!;
  }

  it('order confirmed / shipped go to the buyer only (account email, or a guest’s address), replies to support@', async () => {
    const mine = await order({ accountId: ids.rosieId });
    await sendOrderConfirmed(db, mine.id);
    await sendOrderShipped(db, mine.id);
    expect(sent.map((m) => [m.kind, m.to])).toEqual([
      ['order-confirmed', email.rosie],
      ['order-shipped', email.rosie],
    ]);
    expect(sent.every((m) => m.replyTo === 'support@snickerdoodle.co.uk')).toBe(true);
    expect(sent[0]!.subject).toBe(`your Snickerdoodle order ${mine.ref} is confirmed`);
    expect(sent[0]!.text).toContain('/orders');
    expect(sent[1]!.text).toContain('no tracking');

    sent.splice(0);
    const guest = await order({ buyerEmail: `guest-${nonce}@example.test`, tracking: { url: 'https://track.example/abc' } });
    await sendOrderConfirmed(db, guest.id);
    await sendOrderShipped(db, guest.id);
    expect(sent.map((m) => m.to)).toEqual([`guest-${nonce}@example.test`, `guest-${nonce}@example.test`]);
    expect(sent[0]!.text).not.toContain('/orders'); // a guest has no orders page
    expect(sent[1]!.text).toContain('Track it here: https://track.example/abc');
  });

  it('"bought from your gift list" goes to the family’s parent only — never the buyer, never another member', async () => {
    const [link] = await db
      .insert(giftLinks)
      .values({ familyId: ids.hartleyId, createdByAccountId: ids.samId, token: `swp-${nonce}`, items: [], expiresAt: new Date(Date.now() + 86_400_000) })
      .returning({ id: giftLinks.id });
    linkIds.push(link!.id);
    const o = await order({ buyerEmail: `nana-${nonce}@example.test`, giftLinkId: link!.id, giftFromName: 'Nana' });
    await notifyGiftListPurchase(db, o.id);
    expect(sent.map((m) => [m.kind, m.to])).toEqual([['gift-list', email.sam]]);
    expect(sent[0]!.subject).toMatch(/^Nana just bought .* from your gift list/);
  });

  it('email change: a 1-hour confirm link to the NEW address only; a heads-up (no link) to the old one; a note after', async () => {
    const newAddr = `jo-new-${nonce}@example.test`;
    expect((await requestEmailChange(db, ids.joId, newAddr)).ok).toBe(true);
    expect(sent.map((m) => m.to)).toEqual([newAddr, email.jo]);
    const link = /\/account\/confirm-email\?token=([A-Za-z0-9_-]+)/.exec(sent[0]!.text);
    expect(link).not.toBeNull();
    expect(sent[0]!.text).toContain('works for an hour');
    expect(sent[1]!.text).not.toContain('confirm-email'); // the old inbox can't confirm it
    sent.splice(0);
    expect((await confirmEmailChange(db, link![1]!)).ok).toBe(true);
    expect(sent.map((m) => m.to)).toEqual([email.jo]); // told at the OLD address
    expect((await confirmEmailChange(db, link![1]!)).ok).toBe(false); // single use
    await db.update(accounts).set({ email: email.jo }).where(eq(accounts.id, ids.joId));
  });

  it('a complaint is acknowledged to the complainant; the privacy inbox gets the ref, never the details', async () => {
    const res = await submitComplaint(db, { name: 'Pat Example', email: `complainer-${nonce}@example.test`, message: 'a private detail that must not be forwarded' }, new Date(), { PRIVACY_INBOX: `privacy-${nonce}@example.test` });
    expect(res.ok).toBe(true);
    expect(sent.map((m) => [m.kind, m.to])).toEqual([
      ['complaint-ack', `complainer-${nonce}@example.test`],
      ['rights-request', `privacy-${nonce}@example.test`],
    ]);
    expect(sent[0]!.text).toContain('Hi Pat,');
    expect(sent[0]!.text).toContain('ico.org.uk');
    expect(sent[1]!.text).not.toContain('private detail');
  });

  it('a support message: acknowledged to the asker; the team copy replies to the asker', async () => {
    const res = await submitSupportRequest(db, { topic: 'other', email: `asker-${nonce}@example.test`, name: 'Sam', message: 'hello there, a question about my keepsakes' }, new Date(), { SUPPORT_INBOX: `team-${nonce}@example.test` });
    if (!res.ok) throw new Error(`support refused: ${JSON.stringify(res)}`);
    expect(sent.map((m) => [m.kind, m.to])).toEqual([
      ['support-ack', `asker-${nonce}@example.test`],
      ['support-request', `team-${nonce}@example.test`],
    ]);
    expect(sent[1]!.replyTo).toBe(`asker-${nonce}@example.test`);
  });

  it('handing the family over tells the new parent only', async () => {
    const res = await handOverFamily(db, ids.samId, { familyId: ids.hartleyId, newOwnerAccountId: ids.joId }, new Date(), { skipLedger: true });
    expect(res.ok).toBe(true);
    expect(sent.map((m) => [m.kind, m.to])).toEqual([['family-handover', email.jo]]);
    expect(sent[0]!.text).toContain('/family');
  });
});
