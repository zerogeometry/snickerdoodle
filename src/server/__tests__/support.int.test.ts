import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { accounts, assets, auditRecords, giftLinks, orderItems, orders, supportRequests } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError, type Reviewer } from '@/authz';
import { REPORTED_LABEL } from '@/lib/reports';
import { resolveViewerContext } from '@/server/assets';
import { reviewQueue } from '@/server/admin/review';
import { setSupportStatus, supportInbox } from '@/server/admin/support';
import { reportGiftLink } from '@/server/contentReports';
import { createGiftLink, getGiftLink } from '@/server/giftLinks';
import { ingestOriginalAsset } from '@/server/ingest';
import { markOrderPaid } from '@/server/orders';
import { sendOrderShipped } from '@/server/orderEmails';
import { checkHumanProof, createHumanChallenge } from '@/server/humanCheck';
import { solveHumanCheck } from '@/lib/humanCheck';
import { SUPPORT_PER_EMAIL_PER_DAY, SUPPORT_RETENTION_DAYS, purgeExpiredSupportRequests, submitSupportRequest } from '@/server/support';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;

/** Customer service: the help form, the support inbox, the order emails and gift-link reports. */
describe.skipIf(!DB)('help & support — integration', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  let admin: Reviewer;
  const email = `parent-${randomUUID().slice(0, 8)}@example.test`;
  const orderIds: string[] = [];
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const mailed = () => log.mock.calls.map((c) => String(c[0])).join('\n');

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    admin = { accountId: ids.samId, isAdmin: true, mfaVerified: true };
  });
  afterEach(() => log.mockClear());
  afterAll(async () => {
    await db.delete(supportRequests).where(eq(supportRequests.email, email));
    if (orderIds.length) await db.delete(orders).where(inArray(orders.id, orderIds));
    if (ids) {
      await db.delete(giftLinks).where(eq(giftLinks.familyId, ids.hartleyId));
      await cleanupDemoFamilies(db, ids);
    }
    log.mockRestore();
    await client.end();
  });

  const ask = (over: Partial<{ topic: string; email: string; name: string; orderRef: string; message: string }> = {}, env: Record<string, string> = {}) =>
    submitSupportRequest(db, { topic: 'order-change', email, name: 'Alex Parent', orderRef: 'snk-123456', message: 'Could I change the mug to the bigger size please?', ...over }, new Date(), env);

  describe('the help form', () => {
    it('saves the message first, then acknowledges the customer and tells the support inbox', async () => {
      const res = await ask({}, { SUPPORT_INBOX: 'team@example.test' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.ref).toMatch(/^S-[0-9A-F]{6}$/);
      const [row] = await db.select().from(supportRequests).where(eq(supportRequests.ref, res.ref));
      expect(row).toMatchObject({ topic: 'order-change', email, name: 'Alex Parent', orderRef: 'SNK-123456', status: 'OPEN' });
      expect(row!.ackSentAt).not.toBeNull();
      expect(row!.teamNotifiedAt).not.toBeNull();

      const out = mailed();
      expect(out).toContain(`[support-ack] to ${email}`);
      expect(out).toContain('(reply to support@snickerdoodle.co.uk)');
      expect(out).toContain('[support-request] to team@example.test');
      expect(out).toContain(`(reply to ${email})`); // the team answers the customer directly
      expect(out).toContain('bigger size');
    });

    it('keeps the message even when email is down — and says which emails didn’t go', async () => {
      const prev = process.env.MAIL_PROVIDER;
      process.env.MAIL_PROVIDER = 'broken-on-purpose'; // resolveMailer throws, like a failed send
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const res = await ask();
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        const [row] = await db.select().from(supportRequests).where(eq(supportRequests.ref, res.ref));
        expect(row!.message).toContain('bigger size');
        expect(row!.ackSentAt).toBeNull();
        expect(row!.teamNotifiedAt).toBeNull(); // the inbox page flags it
      } finally {
        if (prev === undefined) delete process.env.MAIL_PROVIDER;
        else process.env.MAIL_PROVIDER = prev;
        err.mockRestore();
      }
    });

    it('drops the order reference on non-order topics', async () => {
      const res = await ask({ topic: 'making', orderRef: 'SNK-999999' });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const [row] = await db.select().from(supportRequests).where(eq(supportRequests.ref, res.ref));
      expect(row!.orderRef).toBeNull();
    });

    it('the "are you a person?" check works once — a solve can’t be replayed', async () => {
      const proof = await solveHumanCheck(createHumanChallenge(Date.now(), 2000));
      expect(await checkHumanProof(db, proof)).toBe(true);
      expect(await checkHumanProof(db, proof)).toBe(false);
      expect(await checkHumanProof(db, null)).toBe(false);
    });

    it('refuses an unusable message', async () => {
      expect(await ask({ topic: 'nope' })).toEqual({ ok: false, reason: 'invalid' });
      expect(await ask({ email: 'not-an-email' })).toEqual({ ok: false, reason: 'invalid' });
      expect(await ask({ message: 'short' })).toEqual({ ok: false, reason: 'invalid' });
      expect(await ask({ name: 'x'.repeat(81) })).toEqual({ ok: false, reason: 'invalid' });
    });

    it('caps messages per email per day', async () => {
      const n = (await db.select({ id: supportRequests.id }).from(supportRequests).where(eq(supportRequests.email, email))).length;
      for (let i = n; i < SUPPORT_PER_EMAIL_PER_DAY; i++) expect((await ask()).ok).toBe(true);
      expect(await ask()).toEqual({ ok: false, reason: 'too-many' });
    });

    it('the retention job deletes messages older than two years — and only those', async () => {
      const old = new Date(Date.now() - (SUPPORT_RETENTION_DAYS + 1) * 86_400_000);
      const [stale] = await db.insert(supportRequests).values({ ref: `S-OLD${ids.nonce.slice(0, 4)}`.toUpperCase(), topic: 'other', email, message: 'an old message', receivedAt: old }).returning();
      const before = (await db.select().from(supportRequests).where(eq(supportRequests.email, email))).length;
      expect(await purgeExpiredSupportRequests(db)).toBeGreaterThanOrEqual(1);
      expect(await db.select().from(supportRequests).where(eq(supportRequests.id, stale!.id))).toHaveLength(0);
      expect((await db.select().from(supportRequests).where(eq(supportRequests.email, email))).length).toBe(before - 1);
    });
  });

  describe('the support inbox', () => {
    it('is admin + two-step only, and statuses move', async () => {
      await expect(supportInbox(db, { ...admin, mfaVerified: false })).rejects.toBeInstanceOf(AuthzError);
      await expect(supportInbox(db, { ...admin, isAdmin: false })).rejects.toBeInstanceOf(AuthzError);
      await expect(setSupportStatus(db, { ...admin, isAdmin: false }, randomUUID(), 'CLOSED')).rejects.toBeInstanceOf(AuthzError);

      const open = await supportInbox(db, admin, 'open');
      const mine = open.find((m) => m.email === email);
      expect(mine).toBeDefined();
      expect(await setSupportStatus(db, admin, mine!.id, 'ANSWERED')).toBe(true);
      expect((await supportInbox(db, admin, 'open')).some((m) => m.id === mine!.id)).toBe(false);
      const [row] = await db.select().from(supportRequests).where(eq(supportRequests.id, mine!.id));
      expect(row!.status).toBe('ANSWERED');
      expect(row!.closedAt).not.toBeNull();
      expect(await setSupportStatus(db, admin, mine!.id, 'OPEN')).toBe(true);
      expect(await setSupportStatus(db, admin, randomUUID(), 'CLOSED')).toBe(false);
    });
  });

  describe('order emails', () => {
    async function order(over: Partial<typeof orders.$inferInsert> = {}) {
      const [o] = await db
        .insert(orders)
        .values({ ref: `SNK-M${randomUUID().slice(0, 6)}`.toUpperCase(), status: 'PENDING', subtotalPence: 1400, deliveryPence: 399, totalPence: 1799, ...over })
        .returning();
      orderIds.push(o!.id);
      await db.insert(orderItems).values({ orderId: o!.id, productKey: 'mug', qty: 2, unitPricePence: 700, linePence: 1400 });
      return o!;
    }

    it('"we’ve got your order" goes once, on the real paid flip, to the account’s email', async () => {
      const [sam] = await db.select({ email: accounts.email }).from(accounts).where(eq(accounts.id, ids.samId));
      const o = await order({ accountId: ids.samId });
      await markOrderPaid(db, o.id);
      await markOrderPaid(db, o.id); // a replayed webhook: no second email
      const sent = log.mock.calls.map((c) => String(c[0])).filter((t) => t.includes('[order-confirmed]'));
      expect(sent).toHaveLength(1);
      expect(sent[0]).toContain(`to ${sam!.email}`);
      expect(sent[0]).toContain(o.ref);
      expect(sent[0]).toContain('× 2');
      expect(sent[0]).toContain('£17.99');
      expect(sent[0]).toContain(`order=${o.ref}`);
      expect(sent[0]).toContain('(reply to support@snickerdoodle.co.uk)');
    });

    it('a guest’s confirmation goes to the email they checked out with', async () => {
      const o = await order({ buyerEmail: 'guest-buyer@example.test' });
      await markOrderPaid(db, o.id);
      expect(mailed()).toContain('[order-confirmed] to guest-buyer@example.test');
      expect(mailed()).not.toContain('/orders'); // no account → no orders page to point at
    });

    it('"on its way" carries the tracking link, or says plainly when there is none', async () => {
      const tracked = await order({ buyerEmail: 'guest-buyer@example.test', status: 'SHIPPED', tracking: { carrier: 'Royal Mail', number: 'RM123', url: 'https://track.example.test/RM123' } });
      await sendOrderShipped(db, tracked.id);
      expect(mailed()).toContain('[order-shipped] to guest-buyer@example.test');
      expect(mailed()).toContain('https://track.example.test/RM123');
      log.mockClear();
      const untracked = await order({ buyerEmail: 'guest-buyer@example.test', status: 'SHIPPED', tracking: { carrier: null, number: null, url: null } });
      await sendOrderShipped(db, untracked.id);
      expect(mailed()).toContain('no tracking');
    });
  });

  describe.skipIf(!S3)('reporting a gift link', () => {
    const png = () => sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 9, g: 9, b: 9 } } }).png().toBuffer();

    it('holds every keepsake on it at once — offline, unprintable, in the review queue — and tells the team, with no picture', async () => {
      const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
      const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: true });
      await db.update(assets).set({ moderationStatus: 'CLEAR', moderationDetail: { labels: [], original: { status: 'CLEAR', labels: [] } } }).where(eq(assets.id, a.assetId));
      const { id: linkId, token } = await createGiftLink(db, sam, { familyId: ids.hartleyId, assetIds: [a.assetId] });
      expect((await getGiftLink(db, token)).state).toBe('active');

      expect(await reportGiftLink(db, { token, reason: 'inappropriate', note: 'not ok', email: 'Worried@Example.test' }, new Date(), { SUPPORT_INBOX: 'team@example.test' })).toEqual({ ok: true });

      const [held] = await db.select().from(assets).where(eq(assets.id, a.assetId));
      expect(held!.moderationStatus).toBe('FLAGGED'); // printing needs CLEAR (canPurchase/createPrint deny)
      expect((held!.moderationDetail as { labels: string[] }).labels[0]).toBe(REPORTED_LABEL);
      expect((held!.moderationDetail as { original: { status: string } }).original.status).toBe('CLEAR'); // the screening's verdict kept
      expect((await getGiftLink(db, token)).state).toBe('gone');
      expect((await reviewQueue(db, admin)).items.some((i) => i.id === a.assetId && i.labels.includes(REPORTED_LABEL))).toBe(true);

      const [audit] = await db.select().from(auditRecords).where(and(eq(auditRecords.targetId, linkId), eq(auditRecords.event, 'CONTENT_FLAGGED')));
      expect(audit).toMatchObject({ event: 'CONTENT_FLAGGED', actorType: 'ANON', targetType: 'gift_link' });

      const out = mailed();
      expect(out).toContain('[content-report] to team@example.test');
      expect(out).toContain('(reply to worried@example.test)');
      expect(out).not.toContain(token); // the link itself never travels in the email
      expect(out).not.toMatch(/https?:\/\/\S*\/g\//);
    });

    it('a second report doesn’t re-flag or double up; nonsense is refused', async () => {
      expect(await reportGiftLink(db, { token: 'not-a-real-token-123', reason: 'other' })).toEqual({ ok: false, reason: 'invalid' });
      const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
      const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: true });
      await db.update(assets).set({ moderationStatus: 'CLEAR' }).where(eq(assets.id, a.assetId));
      const { token } = await createGiftLink(db, sam, { familyId: ids.hartleyId, assetIds: [a.assetId] });
      expect(await reportGiftLink(db, { token, reason: 'made-up' })).toEqual({ ok: false, reason: 'invalid' });
      expect(await reportGiftLink(db, { token, reason: 'other', email: 'nope' })).toEqual({ ok: false, reason: 'invalid' });
      expect(await reportGiftLink(db, { token, reason: 'copyright' })).toEqual({ ok: true });
      expect(await reportGiftLink(db, { token, reason: 'copyright' })).toEqual({ ok: true });
      const [held] = await db.select().from(assets).where(eq(assets.id, a.assetId));
      expect(held!.moderationStatus).toBe('FLAGGED');
      expect((held!.moderationDetail as { reports: unknown[] }).reports).toHaveLength(1);
    });
  });
});
