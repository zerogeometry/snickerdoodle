import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

vi.mock('@/server/mail', async (orig) => ({
  ...(await orig<typeof import('@/server/mail')>()),
  sendMail: vi.fn(async () => {}),
}));

import * as schema from '@/db/schema';
import { accounts, orders, promoCodes } from '@/db/schema';
import { markOrderPaid, placeOrder } from '@/server/orders';
import { resolvePromo } from '@/server/promos';
import { seedCatalogue } from '@/server/catalogue';
import { ensureTestCosts } from '@/test/costFixture';
import type { DbHandle } from '@/server/db';

/**
 * C10 — creator codes + the free first card, against a real Postgres (dev order path: no Stripe key,
 * so a placed order is marked paid at once — the same moment a Stripe webhook would).
 *  - A creator (INFLUENCER) code: the follower's 10% and the creator's 5% are for the follower's FIRST
 *    paid order only (by account, or a guest by email), never the creator's own; the commission is
 *    settled ONCE, when the order is paid, and two first orders paid at once can't both earn.
 *  - A PTA code still earns on every order.
 *  - A FREE_CARD code: one greetings card off a first order, margin-guarded, server-side only.
 */
const URL = process.env.DATABASE_URL;

describe.skipIf(!URL)('creator codes + the free first card (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  const nonce = Math.random().toString(36).slice(2, 8);
  const codes: string[] = [];
  const accountIds: string[] = [];
  const emails: string[] = [];
  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;

  beforeAll(async () => {
    delete process.env.STRIPE_SECRET_KEY; // the dev mark-paid path
    client = postgres(URL!, { prepare: false });
    db = drizzle(client, { schema });
    await seedCatalogue(db); // idempotent
    await ensureTestCosts(db);
  });
  afterAll(async () => {
    if (STRIPE_KEY) process.env.STRIPE_SECRET_KEY = STRIPE_KEY;
    const mine = await db
      .select({ id: orders.id })
      .from(orders)
      .leftJoin(promoCodes, eq(promoCodes.id, orders.promoCodeId))
      .where(or(inArray(promoCodes.code, codes.length ? codes : ['-']), inArray(orders.buyerEmail, emails.length ? emails : ['-'])));
    if (mine.length) await db.delete(orders).where(inArray(orders.id, mine.map((o) => o.id)));
    if (codes.length) await db.delete(promoCodes).where(inArray(promoCodes.code, codes));
    if (accountIds.length) await db.delete(accounts).where(inArray(accounts.id, accountIds));
    await client.end();
  });

  const email = (who: string) => {
    const e = `${who}-${nonce}@example.test`;
    emails.push(e);
    return e;
  };
  const mkCode = async (v: Partial<typeof promoCodes.$inferInsert>) => {
    const code = `C10${nonce.toUpperCase()}${codes.length}`;
    codes.push(code);
    const [row] = await db.insert(promoCodes).values({ code, kind: 'PERCENT', value: 1000, ...v }).returning();
    return row!;
  };
  const creatorCode = (partnerEmail: string | null = null) =>
    mkCode({ kind: 'PERCENT', value: 1000, commissionBps: 500, partnerType: 'INFLUENCER', partnerName: 'a creator', partnerEmail });
  const mkAccount = async (who: string) => {
    const [a] = await db.insert(accounts).values({ email: email(who), displayName: who }).returning();
    accountIds.push(a!.id);
    return a!;
  };
  const frame = [{ productKey: 'framedPrint', qty: 1 }];
  const orderOf = async (ref?: string) => (ref ? ((await db.select().from(orders).where(eq(orders.ref, ref)))[0] ?? null) : null);
  /** Resolve the code for this buyer and place (= pay, dev path) an order with it. */
  const buy = async (code: string, buyer: { accountId: string | null; email: string }, items = frame) => {
    const r = await resolvePromo(db, code, new Date(), buyer);
    const res = await placeOrder(db, { items, account: buyer.accountId ? { id: buyer.accountId } : null, joinProvenance: null, promo: r.ok ? r.rule : null, buyerEmail: buyer.email });
    return { resolved: r, res, order: await orderOf(res.ref) };
  };
  /** A checkout still open at Stripe (PENDING) with the code — paid later by the webhook. */
  const openCheckout = async (codeId: string, buyerEmail: string, accountId: string | null = null) => {
    const [o] = await db
      .insert(orders)
      .values({
        ref: `SNK-C${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        status: 'PENDING',
        accountId,
        subtotalPence: 6500,
        deliveryPence: 0,
        totalPence: 5850,
        promoCodeId: codeId,
        promoSavingPence: 650,
        partnerCommissionPence: 244,
        buyerEmail,
      })
      .returning();
    return o!;
  };
  const commissionOf = async (id: string) => (await db.select({ c: orders.partnerCommissionPence, s: orders.status }).from(orders).where(eq(orders.id, id)))[0]!;

  describe('a creator code: 10% off + 5% commission, the follower’s first order only', () => {
    it('a new guest (by email): 10% off, and the creator earns on it — recorded on the order when paid', async () => {
      const code = await creatorCode();
      const { resolved, order } = await buy(code.code, { accountId: null, email: email('follower') });
      expect(resolved.ok).toBe(true);
      expect(order?.status).toBe('PAID');
      expect(order?.promoSavingPence).toBe(Math.round(order!.subtotalPence / 10));
      expect(order?.partnerCommissionPence).toBeGreaterThan(0);
    });

    it('the same guest’s second order: no 10%, no commission — refused when typed AND when replayed at placement', async () => {
      const code = await creatorCode();
      const guest = email('again');
      const first = await buy(code.code, { accountId: null, email: guest });
      expect(first.order?.partnerCommissionPence).toBeGreaterThan(0);
      expect(await resolvePromo(db, code.code, new Date(), { accountId: null, email: guest.toUpperCase() })).toEqual({ ok: false, reason: 'first-order-only' });
      if (!first.resolved.ok) throw new Error('resolved the first time');
      const replay = await placeOrder(db, { items: frame, account: null, joinProvenance: null, promo: first.resolved.rule, buyerEmail: guest });
      expect(replay).toEqual({ ok: false, reason: 'promo', promoError: 'first-order-only' });
    });

    it('a signed-in parent who has ordered before (with no code at all) doesn’t get it; a brand-new account does', async () => {
      const code = await creatorCode();
      const returning = await mkAccount('returning');
      await placeOrder(db, { items: frame, account: { id: returning.id }, joinProvenance: null, buyerEmail: returning.email });
      expect(await resolvePromo(db, code.code, new Date(), { accountId: returning.id, email: returning.email })).toEqual({ ok: false, reason: 'first-order-only' });
      // …and as a signed-out guest with the same email, it's the same person
      expect(await resolvePromo(db, code.code, new Date(), { accountId: null, email: returning.email })).toEqual({ ok: false, reason: 'first-order-only' });
      const fresh = await mkAccount('fresh');
      const { order } = await buy(code.code, { accountId: fresh.id, email: fresh.email });
      expect(order?.promoSavingPence).toBeGreaterThan(0);
      expect(order?.partnerCommissionPence).toBeGreaterThan(0);
    });

    it('a guest we can’t identify (no email yet) isn’t given it — checkout asks for an email', async () => {
      const code = await creatorCode();
      expect(await resolvePromo(db, code.code, new Date(), { accountId: null, email: null })).toEqual({ ok: false, reason: 'needs-buyer' });
    });

    it('never the creator’s own code: by their email as a guest, or signed in with it (any case)', async () => {
      const creator = await mkAccount('creator');
      const code = await creatorCode(creator.email.toLowerCase());
      expect(await resolvePromo(db, code.code, new Date(), { accountId: null, email: creator.email.toUpperCase() })).toEqual({ ok: false, reason: 'own-code' });
      expect(await resolvePromo(db, code.code, new Date(), { accountId: creator.id, email: creator.email })).toEqual({ ok: false, reason: 'own-code' });
      // a creator's checkout that slipped through before the email was on the code still earns nothing when paid
      const open = await openCheckout(code.id, creator.email);
      await markOrderPaid(db, open.id);
      expect(await commissionOf(open.id)).toEqual({ c: 0, s: 'PAID' });
    });

    it('exactly once: two first-order checkouts by one follower, paid at the same moment — only one earns', async () => {
      const code = await creatorCode();
      const guest = email('twotabs');
      const [a, b] = [await openCheckout(code.id, guest), await openCheckout(code.id, guest)];
      await Promise.all([markOrderPaid(db, a.id), markOrderPaid(db, b.id)]);
      const paid = [await commissionOf(a.id), await commissionOf(b.id)];
      expect(paid.map((p) => p.s)).toEqual(['PAID', 'PAID']);
      expect(paid.filter((p) => p.c > 0)).toHaveLength(1);
      // a webhook retry never re-settles (the flip is the one moment it happens)
      await markOrderPaid(db, a.id);
      await markOrderPaid(db, b.id);
      expect([await commissionOf(a.id), await commissionOf(b.id)].filter((p) => p.c > 0)).toHaveLength(1);
    });

    it('a code checkout left open while another order was paid: when it’s paid later it isn’t the first, so it earns nothing', async () => {
      const code = await creatorCode();
      const guest = email('later');
      const open = await openCheckout(code.id, guest);
      await placeOrder(db, { items: frame, account: null, joinProvenance: null, buyerEmail: guest }); // paid, no code
      await markOrderPaid(db, open.id);
      expect(await commissionOf(open.id)).toEqual({ c: 0, s: 'PAID' });
    });
  });

  it('a PTA code still gives the school its share of EVERY order (repeat orders too)', async () => {
    const pta = await mkCode({ kind: 'PERCENT', value: 0, commissionBps: 1000, partnerType: 'PTA', partnerName: 'St Test’s PTA' });
    const parent = email('pta-parent');
    const one = await buy(pta.code, { accountId: null, email: parent });
    const two = await buy(pta.code, { accountId: null, email: parent });
    expect(one.order?.partnerCommissionPence).toBeGreaterThan(0);
    expect(two.resolved.ok).toBe(true);
    expect(two.order?.partnerCommissionPence).toBeGreaterThan(0);
  });

  describe('a free first card', () => {
    // (a framed print alongside: the test database's stand-in costs are too thin for a card + mug to carry it)
    const cardAndFrame = [{ productKey: 'card', qty: 1 }, { productKey: 'framedPrint', qty: 1 }];

    it('first order: exactly one card’s price comes off (server price), and only once per buyer', async () => {
      const free = await mkCode({ kind: 'FREE_CARD', value: 0 });
      const guest = email('card');
      const { order } = await buy(free.code, { accountId: null, email: guest }, cardAndFrame);
      const [cardRow] = await db.select({ price: schema.productVariants.pricePence }).from(schema.productVariants).where(eq(schema.productVariants.sku, 'card'));
      expect(order?.status).toBe('PAID');
      expect(order?.promoSavingPence).toBe(cardRow!.price);
      expect(order?.totalPence).toBe(order!.subtotalPence - cardRow!.price + order!.deliveryPence);
      expect(await resolvePromo(db, free.code, new Date(), { accountId: null, email: guest })).toEqual({ ok: false, reason: 'first-order-only' });
    });

    it('a card on its own can’t be given away (margin guard): full price, the code isn’t recorded as used', async () => {
      const free = await mkCode({ kind: 'FREE_CARD', value: 0 });
      const { resolved, order } = await buy(free.code, { accountId: null, email: email('cardalone') }, [{ productKey: 'card', qty: 1 }]);
      expect(resolved.ok).toBe(true);
      expect(order?.promoSavingPence).toBe(0);
      expect(order?.promoCodeId).toBeNull();
      expect(order?.totalPence).toBe(order!.subtotalPence + order!.deliveryPence);
    });
  });
});
