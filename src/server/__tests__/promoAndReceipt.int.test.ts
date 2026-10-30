import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const mail = vi.hoisted(() => ({ sent: [] as { kind: string; to: string; text: string }[] }));
vi.mock('@/server/mail', async (orig) => ({
  ...(await orig<typeof import('@/server/mail')>()),
  sendMail: vi.fn(async (m: { kind: string; to: string; text: string }) => {
    mail.sent.push(m);
  }),
}));

import * as schema from '@/db/schema';
import { accounts, assets, orderItems, orders, productVariants, promoCodes } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { getOrdersForAccount, placeOrder } from '@/server/orders';
import { PROMO_HOLD_MS, resolvePromo } from '@/server/promos';
import { seedCatalogue } from '@/server/catalogue';
import { ensureTestCosts } from '@/test/costFixture';
import type { DbHandle } from '@/server/db';

/**
 * The 29 Oct sweep's promo-code and receipt bugs, pinned against a real Postgres (dev order path:
 * no Stripe key, so a placed order is marked paid at once — the same moment a Stripe webhook would):
 *  - 07-B6: a personal referral code ("first order only, never your own") was given to any signed-out
 *    guest, again and again. Now a guest is checked by their own email; with none, it isn't given.
 *  - 05-B4: a limited code could be used more times than its limit (two checkouts open at once).
 *  - 05-B5: the receipt + orders page listed a christmas bundle as its packs, with raw skus.
 *  - 05-B6: the gift note was thrown away.
 */
const URL = process.env.DATABASE_URL;

describe.skipIf(!URL)('promo codes, receipts + the gift note (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const orderIds: string[] = [];
  const codes: string[] = [];
  const assetIds: string[] = [];
  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  let costBefore: number | null | undefined;

  beforeAll(async () => {
    delete process.env.STRIPE_SECRET_KEY; // the dev mark-paid path
    client = postgres(URL!, { prepare: false });
    db = drizzle(client, { schema });
    await seedCatalogue(db); // idempotent
    await ensureTestCosts(db); // first, so the cost restored afterwards is never a null over the fixture
    // the framed print's real cost (the promo margin guard never discounts a product without one)
    [{ unitCostPence: costBefore } = { unitCostPence: null }] = await db.select({ unitCostPence: productVariants.unitCostPence }).from(productVariants).where(eq(productVariants.sku, 'framedPrint'));
    await db.update(productVariants).set({ unitCostPence: 2800 }).where(eq(productVariants.sku, 'framedPrint'));
    ids = await seedDemoFamilies(db);
  });
  afterAll(async () => {
    if (STRIPE_KEY) process.env.STRIPE_SECRET_KEY = STRIPE_KEY;
    await db.update(productVariants).set({ unitCostPence: costBefore ?? null }).where(eq(productVariants.sku, 'framedPrint'));
    const mine = await db.select({ id: orders.id }).from(orders).innerJoin(promoCodes, eq(promoCodes.id, orders.promoCodeId)).where(inArray(promoCodes.code, codes.length ? codes : ['-']));
    const all = [...new Set([...orderIds, ...mine.map((o) => o.id)])];
    if (all.length) await db.delete(orders).where(inArray(orders.id, all));
    if (codes.length) await db.delete(promoCodes).where(inArray(promoCodes.code, codes));
    if (assetIds.length) await db.delete(assets).where(inArray(assets.id, assetIds));
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  const track = async (ref?: string) => {
    if (!ref) return null;
    const [o] = await db.select().from(orders).where(eq(orders.ref, ref));
    if (o) orderIds.push(o.id);
    return o ?? null;
  };
  const mkCode = async (v: Partial<typeof promoCodes.$inferInsert>) => {
    const code = `PR${ids.nonce.toUpperCase()}${codes.length}`.slice(0, 20);
    codes.push(code);
    const [row] = await db.insert(promoCodes).values({ code, kind: 'FIXED', value: 500, ...v }).returning();
    return row!;
  };
  const frame = [{ productKey: 'framedPrint', qty: 1 }];
  const emailOf = async (accountId: string) => (await db.select({ email: accounts.email }).from(accounts).where(eq(accounts.id, accountId)))[0]!.email;
  /** A paid order by a guest's email — so that email has had its first order. */
  const pastOrderFor = async (email: string) => {
    const res = await placeOrder(db, { items: frame, account: null, joinProvenance: null, buyerEmail: email });
    return track(res.ref);
  };

  // ── 07-B6 ───────────────────────────────────────────────────────────────────────────────────
  describe('07-B6: a friend’s referral code — never your own, first order only — for guests too', () => {
    const referral = () => mkCode({ value: 500, minSpendPence: 3000, ownerAccountId: ids.samId, firstOrderOnly: true, partnerType: 'REFERRAL', partnerName: 'referral' });

    it('a signed-out guest we can’t identify isn’t given it (the code owner checking out signed out, say)', async () => {
      const code = await referral();
      expect(await resolvePromo(db, code.code, new Date(), { accountId: ids.samId })).toEqual({ ok: false, reason: 'own-code' });
      expect(await resolvePromo(db, code.code, new Date(), null)).toEqual({ ok: false, reason: 'needs-buyer' });
      expect(await resolvePromo(db, code.code, new Date(), { accountId: null, email: null })).toEqual({ ok: false, reason: 'needs-buyer' });
    });

    it('a guest is checked by their email: the owner’s own email is refused; so is an email that has already ordered', async () => {
      const code = await referral();
      const samEmail = await emailOf(ids.samId);
      expect(await resolvePromo(db, code.code, new Date(), { accountId: null, email: samEmail.toUpperCase() })).toEqual({ ok: false, reason: 'own-code' });
      const returning = `returning-${ids.nonce}@example.test`;
      await pastOrderFor(returning);
      expect(await resolvePromo(db, code.code, new Date(), { accountId: null, email: returning })).toEqual({ ok: false, reason: 'first-order-only' });
      // a genuinely new guest gets it — no account wall
      expect(await resolvePromo(db, code.code, new Date(), { accountId: null, email: `new-${ids.nonce}@example.test` })).toMatchObject({ ok: true });
    });

    it('£5 off once, not again and again: the second order by the same guest email is refused at placement', async () => {
      const code = await referral();
      const guest = `twice-${ids.nonce}@example.test`;
      const r = await resolvePromo(db, code.code, new Date(), { accountId: null, email: guest });
      if (!r.ok) throw new Error('a new guest should get the code');
      const first = await track((await placeOrder(db, { items: frame, account: null, joinProvenance: null, promo: r.rule, buyerEmail: guest })).ref);
      expect(first?.status).toBe('PAID');
      expect(first?.promoSavingPence).toBe(500);
      // the SAME rule, replayed for the same guest (e.g. resolved before the first order was paid)
      const again = await placeOrder(db, { items: frame, account: null, joinProvenance: null, promo: r.rule, buyerEmail: guest });
      expect(again).toEqual({ ok: false, reason: 'promo', promoError: 'first-order-only' });
    });
  });

  // ── 05-B4 ───────────────────────────────────────────────────────────────────────────────────
  describe('05-B4: a limited code is never used more times than its limit', () => {
    it('two shoppers who both resolved a 1-use code before either paid: only one order gets it', async () => {
      const once = await mkCode({ kind: 'PERCENT', value: 1000, maxRedemptions: 1 });
      const a = await resolvePromo(db, once.code);
      const b = await resolvePromo(db, once.code);
      if (!a.ok || !b.ok) throw new Error('both resolve while nothing is paid');
      const oa = await track((await placeOrder(db, { items: frame, account: null, joinProvenance: null, promo: a.rule })).ref);
      const rb = await placeOrder(db, { items: frame, account: null, joinProvenance: null, promo: b.rule });
      expect(rb).toEqual({ ok: false, reason: 'promo', promoError: 'used-up' });
      expect(oa?.status).toBe('PAID');
      expect(oa!.promoSavingPence).toBeGreaterThan(0);
    });

    it('…even placed at the very same moment (the code’s row is locked while the order is written)', async () => {
      const twice = await mkCode({ kind: 'PERCENT', value: 1000, maxRedemptions: 2 });
      const r = await resolvePromo(db, twice.code);
      if (!r.ok) throw new Error('resolves');
      const results = await Promise.all([0, 1, 2, 3, 4].map((i) => placeOrder(db, { items: frame, account: null, joinProvenance: null, promo: r.rule, buyerEmail: `rush-${i}-${ids.nonce}@example.test` })));
      for (const res of results) await track(res.ref);
      expect(results.filter((x) => x.ok)).toHaveLength(2);
      expect(results.filter((x) => !x.ok && x.reason === 'promo' && x.promoError === 'used-up')).toHaveLength(3);
      const withCode = await db.select().from(orders).where(eq(orders.promoCodeId, twice.id));
      expect(withCode).toHaveLength(2);
    });

    it('a checkout still open at Stripe holds a use; an abandoned one lets go after the hold; your own never blocks you', async () => {
      const once = await mkCode({ kind: 'PERCENT', value: 1000, maxRedemptions: 1 });
      const holder = `holder-${ids.nonce}@example.test`;
      const [open] = await db
        .insert(orders)
        .values({ ref: `SNK-H${ids.nonce.slice(0, 5)}`, status: 'PENDING', subtotalPence: 6500, deliveryPence: 0, totalPence: 5850, promoCodeId: once.id, promoSavingPence: 650, buyerEmail: holder })
        .returning();
      orderIds.push(open!.id);
      expect(await resolvePromo(db, once.code, new Date(), { accountId: null, email: `other-${ids.nonce}@example.test` })).toEqual({ ok: false, reason: 'used-up' });
      // the shopper who went back from Stripe to the basket can try again with their code
      expect(await resolvePromo(db, once.code, new Date(), { accountId: null, email: holder })).toMatchObject({ ok: true });
      // past the hold (the Stripe session has expired by then) the use is free again
      await db.update(orders).set({ createdAt: new Date(Date.now() - PROMO_HOLD_MS - 60_000) }).where(eq(orders.id, open!.id));
      expect(await resolvePromo(db, once.code, new Date(), { accountId: null, email: `other-${ids.nonce}@example.test` })).toMatchObject({ ok: true });
    });
  });

  // ── 05-B5 + 05-B6 ───────────────────────────────────────────────────────────────────────────
  it('05-B5: a christmas bundle reads as ONE line on the receipt and the orders page, named, with the savings', async () => {
    const [art] = await db
      .insert(assets)
      .values({ familyId: ids.hartleyId, kind: 'DRAWING', uploaderAccountId: ids.samId, controllerAccountId: ids.samId, visibility: 'FAMILY', keptInHome: true, moderationStatus: 'CLEAR' })
      .returning();
    assetIds.push(art!.id);
    const bundle = { placemat: { assetId: art!.id }, ornaments: [0, 1, 2, 3].map(() => ({ assetId: art!.id })) };
    mail.sent.length = 0;
    const res = await placeOrder(db, {
      items: [{ productKey: 'christmasBundle-for4', qty: 1, bundle }, { productKey: 'mug', qty: 2, artwork: { assetId: art!.id, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } } }],
      account: { id: ids.samId },
      joinProvenance: null,
      buyerEmail: await emailOf(ids.samId),
    });
    const o = (await track(res.ref))!;
    expect(o.status).toBe('PAID');
    const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id));
    expect(lines.filter((l) => l.bundleKey === 'christmasBundle-for4').length).toBeGreaterThan(1); // still its Prodigi pieces

    const confirmed = mail.sent.find((m) => m.kind === 'order-confirmed');
    expect(confirmed?.text).toContain('· christmas family bundle · a set for 4 — £145');
    expect(confirmed?.text).toMatch(/· mug[^\n]* × 2 — £36/);
    expect(confirmed?.text).not.toMatch(/packof|placemats —|ornament ×/);
    // the lines, less the savings listed, are the total
    const amounts = [...confirmed!.text.matchAll(/^· .* — (−?)£([\d.]+)$/gm)].map((m) => (m[1] ? -1 : 1) * Math.round(Number(m[2]) * 100));
    expect(amounts.reduce((n, x) => n + x, 0)).toBe(o.totalPence);

    const history = await getOrdersForAccount(db, ids.samId);
    const shown = history.find((h) => h.ref === o.ref)!;
    expect(shown.items.map((i) => i.label)).toEqual(['christmas family bundle · a set for 4', expect.stringMatching(/^mug/)]);
    expect(shown.items[0]!.linePence).toBe(14500);
    expect(shown.items.reduce((n, i) => n + i.linePence, 0) - shown.savings.reduce((n, sv) => n + sv.pence, 0) + shown.deliveryPence).toBe(o.totalPence);
  });

  it('05-B6: the gift note travels with a gift order (screened), and comes back on the receipt', async () => {
    mail.sent.length = 0;
    const guest = `gift-${ids.nonce}@example.test`;
    const res = await placeOrder(db, { items: frame, gift: true, giftNote: '  happy christmas, love from us all  ', account: null, joinProvenance: null, buyerEmail: guest });
    const o = (await track(res.ref))!;
    expect(o.giftNote).toBe('happy christmas, love from us all');
    expect(o.buyerEmail).toBe(guest); // the guest's receipt email is kept, not thrown away
    expect(mail.sent.find((m) => m.kind === 'order-confirmed' && m.to === guest)?.text).toContain('Your gift note: “happy christmas, love from us all”');
    // abuse is refused before anything is written; a note on a non-gift order is dropped
    expect(await placeOrder(db, { items: frame, gift: true, giftNote: 'you little shit', account: null, joinProvenance: null })).toEqual({ ok: false, reason: 'gift-note' });
    const plain = (await track((await placeOrder(db, { items: frame, gift: false, giftNote: 'not a gift', account: null, joinProvenance: null })).ref))!;
    expect(plain.giftNote).toBeNull();
  });

  it('05-B3: a checkout left at Stripe past the hold isn’t shown as “awaiting payment” forever', async () => {
    const [left] = await db
      .insert(orders)
      .values({ ref: `SNK-L${ids.nonce.slice(0, 5)}`, accountId: ids.samId, status: 'PENDING', subtotalPence: 1800, deliveryPence: 0, totalPence: 1800, createdAt: new Date(Date.now() - PROMO_HOLD_MS - 60_000) })
      .returning();
    orderIds.push(left!.id);
    expect((await getOrdersForAccount(db, ids.samId)).some((h) => h.ref === left!.ref)).toBe(false);
    await db.update(orders).set({ createdAt: new Date() }).where(eq(orders.id, left!.id));
    expect((await getOrdersForAccount(db, ids.samId)).some((h) => h.ref === left!.ref)).toBe(true);
  });
});
