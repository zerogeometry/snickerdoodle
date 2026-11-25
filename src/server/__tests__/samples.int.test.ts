import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

vi.mock('@/server/mail', async (orig) => ({
  ...(await orig<typeof import('@/server/mail')>()),
  sendMail: vi.fn(async () => {}),
}));

import * as schema from '@/db/schema';
import { accounts, auditRecords, orderItems, orders, promoCodes } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { quote } from '@/pricing';
import type { Reviewer } from '@/authz';
import { getCatalogue, seedCatalogue } from '@/server/catalogue';
import { placeOrder } from '@/server/orders';
import { canOrderSamples, sampleGrantFor, type SampleGrant } from '@/server/samples';
import { signStepUp } from '@/server/admin/stepUp';
import { pulse } from '@/server/admin/today';
import { commissionOwed, listCodes } from '@/server/admin/codes';
import { listOrders } from '@/server/admin/orders';
import { unitsSold } from '@/server/popularity';
import { loadGtmData } from '../../../scripts/lib/gtm-metrics-data.mjs';
import { ensureTestCosts } from '@/test/costFixture';
import type { DbHandle } from '@/server/db';

/**
 * SAMPLE ORDERS AT COST against a real Postgres (founder, 25 Nov 2026; src/server/samples.ts, src/pricing/sample.ts):
 *  - only a signed-in admin with an authenticator AND a valid two-step proof for THIS sign-in gets cost; a customer,
 *    an admin without two-step login, a forged / stale / borrowed cookie, or a grant naming someone else ⇒ normal prices;
 *  - a sample order is marked, audited, carries no code, credit or commission;
 *  - samples are left out of the revenue, best-seller, commission and Monday numbers (and shown as samples to admins).
 * Dev order path (no Stripe key): a placed order is marked paid at once, as the webhook would.
 */
const URL = process.env.DATABASE_URL;

describe.skipIf(!URL)('sample orders at cost (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const tag = `S${Date.now().toString(36).toUpperCase()}`;
  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  const SESSION = `session-${tag}`;
  const admin = (): Reviewer => ({ accountId: ids.samId, isAdmin: true, mfaVerified: true });
  const ask = (accountId: string | null, cookie: string | null, sessionToken: string | null = SESSION) => ({
    account: accountId ? { id: accountId } : null,
    stepUpCookie: cookie,
    sessionToken,
  });
  const basket = [{ productKey: 'mug', qty: 2 }, { productKey: 'card', qty: 1 }];

  beforeAll(async () => {
    delete process.env.STRIPE_SECRET_KEY; // the dev mark-paid path
    client = postgres(URL!, { prepare: false });
    db = drizzle(client, { schema });
    await seedCatalogue(db);
    await ensureTestCosts(db);
    ids = await seedDemoFamilies(db);
    // Sam is an admin with an authenticator enrolled; Jo is a customer; Rosie is an admin who never enrolled
    await db.update(accounts).set({ isAdmin: true, mfaSecret: 'TESTSECRET' }).where(eq(accounts.id, ids.samId));
    await db.update(accounts).set({ isAdmin: true, mfaSecret: null }).where(eq(accounts.id, ids.rosieId));
  }, 120_000);

  afterAll(async () => {
    if (STRIPE_KEY) process.env.STRIPE_SECRET_KEY = STRIPE_KEY;
    const accountIds = ids ? [ids.samId, ids.joId, ids.rosieId] : [];
    const mine = await db.select({ id: orders.id }).from(orders).where(accountIds.length ? inArray(orders.accountId, accountIds) : like(orders.ref, `${tag}-%`));
    const tagged = await db.select({ id: orders.id }).from(orders).where(like(orders.ref, `${tag}-%`));
    const all = [...new Set([...mine, ...tagged].map((o) => o.id))];
    if (all.length) await db.delete(orders).where(inArray(orders.id, all));
    await db.delete(promoCodes).where(like(promoCodes.code, `${tag}%`));
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  describe('who may have it', () => {
    it('an admin with two-step login done in this sign-in gets a grant', async () => {
      const cookie = signStepUp(ids.samId, SESSION);
      expect(await canOrderSamples(db, ask(ids.samId, cookie))).toBe(true);
      expect(await sampleGrantFor(db, { ...ask(ids.samId, cookie), wanted: true })).toEqual({ accountId: ids.samId });
    });

    it('asking is not enough: wanted must be exactly true', async () => {
      const cookie = signStepUp(ids.samId, SESSION);
      for (const wanted of [undefined, false, 'true', 1, {}]) expect(await sampleGrantFor(db, { ...ask(ids.samId, cookie), wanted })).toBeNull();
    });

    it('a customer never gets one — even with a correctly signed proof in their own name', async () => {
      const cookie = signStepUp(ids.joId, SESSION); // as if the HMAC secret leaked
      expect(await canOrderSamples(db, ask(ids.joId, cookie))).toBe(false);
      expect(await sampleGrantFor(db, { ...ask(ids.joId, cookie), wanted: true })).toBeNull();
    });

    it('an admin who never enrolled an authenticator never gets one', async () => {
      expect(await sampleGrantFor(db, { ...ask(ids.rosieId, signStepUp(ids.rosieId, SESSION)), wanted: true })).toBeNull();
    });

    it('a forged, borrowed, stale or missing two-step proof gets nothing', async () => {
      const good = signStepUp(ids.samId, SESSION);
      const cases: Array<[string | null, string | null, string | null]> = [
        [ids.samId, null, SESSION], // no two-step login
        [ids.samId, `${good.slice(0, -2)}xx`, SESSION], // tampered signature
        [ids.samId, `${ids.samId}.${Date.now() + 3_600_000}.whatever.sig`, SESSION], // made up
        [ids.samId, good, 'another-sign-in'], // the proof from a different sign-in (another browser)
        [ids.samId, good, null], // signed out of the session it was earned in
        [ids.samId, signStepUp(ids.samId, SESSION, Date.now() - 9 * 3_600_000), SESSION], // past its 8 hours
        [ids.joId, good, SESSION], // the admin's proof, used by someone else
        [null, good, SESSION], // signed out
      ];
      for (const [who, cookie, session] of cases) expect(await sampleGrantFor(db, { ...ask(who, cookie, session), wanted: true })).toBeNull();
    });
  });

  describe('the order', () => {
    it('an admin’s sample is priced at cost, marked, audited, and carries no code, credit or commission', async () => {
      const grant = await sampleGrantFor(db, { ...ask(ids.samId, signStepUp(ids.samId, SESSION)), wanted: true });
      expect(grant).not.toBeNull();
      const catalogue = await getCatalogue(db);
      const atCost = quote(basket, { catalogue, sample: true });
      const shelf = quote(basket, { catalogue });
      expect(atCost.totalPence).toBeLessThan(shelf.totalPence);

      const res = await placeOrder(db, { items: basket, account: { id: ids.samId }, buyerEmail: 'sam@example.test', sample: grant, creditAvailablePence: 5000, freeCardEligible: true });
      expect(res.ok).toBe(true);
      const [o] = await db.select().from(orders).where(eq(orders.ref, res.ref!));
      expect(o).toMatchObject({ isSample: true, status: 'PAID', totalPence: atCost.totalPence, subtotalPence: atCost.subtotalPence, deliveryPence: atCost.deliveryPence, promoCodeId: null, promoSavingPence: 0, partnerCommissionPence: 0, creditAppliedPence: 0 });
      const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, o!.id)).orderBy(orderItems.seq);
      expect(lines.map((l) => [l.productKey, l.qty, l.linePence])).toEqual(atCost.lines.map((l) => [l.productKey, l.qty, l.linePence]));
      const [audit] = await db.select().from(auditRecords).where(and(eq(auditRecords.event, 'SAMPLE_ORDER_PLACED'), eq(auditRecords.targetId, o!.id)));
      expect(audit).toMatchObject({ actorAccountId: ids.samId, actorType: 'ADMIN', targetType: 'order' });
      // the admin orders list shows it as a sample
      expect((await listOrders(db, admin(), { filter: 'all', q: res.ref! }))[0]).toMatchObject({ ref: res.ref, isSample: true });
    });

    it('a grant naming someone else, or made up for a customer, gets the normal price (and no sample mark)', async () => {
      const shelf = quote(basket, { catalogue: await getCatalogue(db) });
      const borrowed: SampleGrant = { accountId: ids.samId }; // Sam's grant, Jo's order
      const forged: SampleGrant = { accountId: ids.joId }; // never made by sampleGrantFor: Jo isn't an admin
      for (const sample of [borrowed, forged]) {
        const res = await placeOrder(db, { items: basket, account: { id: ids.joId }, buyerEmail: 'jo@example.test', sample });
        const [o] = await db.select().from(orders).where(eq(orders.ref, res.ref!));
        expect(o).toMatchObject({ isSample: false, totalPence: shelf.totalPence });
      }
    });

    it('an admin whose admin flag was taken away since the grant pays the normal price', async () => {
      const grant = await sampleGrantFor(db, { ...ask(ids.samId, signStepUp(ids.samId, SESSION)), wanted: true });
      await db.update(accounts).set({ isAdmin: false }).where(eq(accounts.id, ids.samId));
      try {
        const res = await placeOrder(db, { items: basket, account: { id: ids.samId }, buyerEmail: 'sam@example.test', sample: grant });
        const [o] = await db.select().from(orders).where(eq(orders.ref, res.ref!));
        expect(o!.isSample).toBe(false);
        expect(o!.totalPence).toBe(quote(basket, { catalogue: await getCatalogue(db) }).totalPence);
      } finally {
        await db.update(accounts).set({ isAdmin: true }).where(eq(accounts.id, ids.samId));
      }
    });
  });

  describe('samples are never sales', () => {
    // a quiet corner of time no other suite writes to
    const DAY = new Date('2099-01-15T12:00:00Z');
    const at = (h: number) => new Date(Date.UTC(2099, 0, 15, h));
    const md5 = (s: string) => createHash('md5').update(s).digest('hex');
    const saleEmail = `sale-${tag.toLowerCase()}@example.test`;
    const sampleEmail = `sample-${tag.toLowerCase()}@example.test`;

    beforeAll(async () => {
      // a partner code (as a school's): its commission is what the commission screen totals
      const [code] = await db.insert(promoCodes).values({ code: `${tag}PTA`, kind: 'FREE_CARD', value: 0, commissionBps: 1000, partnerType: 'PTA', partnerName: `${tag} school` }).returning();
      const row = (s: string, o: Partial<typeof orders.$inferInsert>) => ({ ref: `${tag}-${s}`, status: 'PAID' as const, subtotalPence: 0, deliveryPence: 0, totalPence: 0, ...o });
      const [sale, sample] = await db
        .insert(orders)
        .values([
          row('SALE', { totalPence: 3000, subtotalPence: 3000, paidAt: at(9), buyerEmail: saleEmail, promoCodeId: code!.id, partnerCommissionPence: 250 }),
          // belt and braces: even a sample that somehow carried a code and a commission is never counted
          row('SAMPLE', { totalPence: 1000, subtotalPence: 1000, paidAt: at(10), buyerEmail: sampleEmail, promoCodeId: code!.id, partnerCommissionPence: 80, isSample: true }),
        ])
        .returning();
      await db.insert(orderItems).values([
        { orderId: sale!.id, productKey: 'mug', qty: 2, unitPricePence: 1500, linePence: 3000 },
        { orderId: sample!.id, productKey: 'mug', qty: 5, unitPricePence: 200, linePence: 1000 },
      ]);
    });

    it('the Today screen’s revenue and order count', async () => {
      const p = await pulse(db, DAY);
      expect([p.ordersToday, p.revenueTodayPence]).toEqual([1, 3000]);
      expect([p.ordersWeek, p.revenueWeekPence]).toEqual([1, 3000]);
    });

    it('partner commission owed, and the codes screen’s orders and revenue', async () => {
      const owed = await commissionOwed(db, admin(), '2099-01');
      const school = owed.partners.find((x) => x.key === `${tag} school`);
      expect(school).toMatchObject({ paidOrders: 1, salesPence: 3000, commissionPence: 250 });
      const { codes } = await listCodes(db, admin(), 'all', DAY);
      expect(codes.find((c) => c.code === `${tag}PTA`)).toMatchObject({ uses: 1, revenuePence: 3000, commissionPence: 250 });
    });

    it('best sellers (the shop’s popularity order)', async () => {
      expect((await unitsSold(db, DAY)).get('mug')).toBe(2);
    });

    it('the Monday numbers (npm run metrics and the admin week screen)', async () => {
      // read only, as the report and the week screen run it
      const data = (await client.begin('read only', (tx) => loadGtmData(tx, new Date('2099-02-01T00:00:00Z')))) as Awaited<ReturnType<typeof loadGtmData>>;
      const customers = new Set(data.orders.map((o: { customer: string }) => o.customer));
      expect(customers.has(md5(saleEmail))).toBe(true);
      expect(customers.has(md5(sampleEmail))).toBe(false);
    });
  });
});
