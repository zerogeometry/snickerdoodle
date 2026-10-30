import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import Stripe from 'stripe';
import * as schema from '@/db/schema';
import { assets, orderItems, orders, promoCodes, storageObjects, webhookEvents } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { basketHasPrintWithoutDrawing, placeOrder } from '@/server/orders';
import { resolvePromo } from '@/server/promos';
import { getCatalogue } from '@/server/catalogue';
import { resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { reportKeepsake } from '@/server/contentReports';
import { handleStripeEvent } from '@/payments';
import { processFulfilment } from '@/fulfillment/worker';
import { submitReadyOrders } from '@/fulfillment/submit';
import { deleteObject } from '@/storage';
import { lineEconomics, quote, type PricedCatalogue } from '@/pricing';
import { multiBuyTiers, netAt, tierFor, MULTI_BUY } from '@/pricing/multibuy';
import { evaluatePromo, PROMO_ECONOMICS } from '@/pricing/promo';
import type { CreateOrderRequest, ProdigiOrderTransport } from '@/server/prodigi/orders';
import type { GateEnv } from '@/fulfillment/gate';
import type { DbHandle } from '@/server/db';

/**
 * Test sweep 05 (29 Oct 2026) — basket, prices, checkout + orders. Pins what tester 05 verified
 * against a real Postgres: the live catalogue's discount rules, promo codes, the bundle sizes,
 * Stripe's charged total vs the order record, the webhook, and the fulfilment hold. Skipped (it.skip)
 * tests carry a bug id from reports/test-sweep-2026-10-29/05-checkout.md and assert the EXPECTED
 * behaviour — un-skip them when the bug is fixed.
 */
const URL = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY ?? '';
const STRIPE_TEST = STRIPE_KEY.startsWith('sk_test_'); // NEVER run the Stripe checks against a live key
const SANDBOX: GateEnv = { podMode: 'SANDBOX', lg3SignedOff: false };

describe.skipIf(!URL)('sweep 05 — checkout money + orders (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  let catalogue: PricedCatalogue;
  const orderIds: string[] = [];
  const assetIds: string[] = [];
  const keys: string[] = [];
  const codes: string[] = [];
  const webhookIds: string[] = [];

  beforeAll(async () => {
    delete process.env.STRIPE_SECRET_KEY; // the dev mark-paid path, except where a test puts it back
    client = postgres(URL!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    catalogue = await getCatalogue(db);
  });
  afterAll(async () => {
    if (STRIPE_KEY) process.env.STRIPE_SECRET_KEY = STRIPE_KEY;
    if (orderIds.length) {
      await db.update(orders).set({ promoCodeId: null }).where(inArray(orders.id, orderIds));
      await db.delete(orders).where(inArray(orders.id, orderIds));
    }
    if (codes.length) await db.delete(promoCodes).where(inArray(promoCodes.code, codes));
    if (webhookIds.length) await db.delete(webhookEvents).where(inArray(webhookEvents.id, webhookIds));
    if (assetIds.length) {
      const objs = await db.select().from(storageObjects).where(inArray(storageObjects.assetId, assetIds));
      for (const o of objs) await deleteObject(o.key).catch(() => {});
      await db.delete(assets).where(inArray(assets.id, assetIds));
    }
    for (const k of keys) await deleteObject(k).catch(() => {});
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  const track = async (ref?: string) => {
    if (!ref) return null;
    const [o] = await db.select().from(orders).where(eq(orders.ref, ref));
    if (o) orderIds.push(o.id);
    return o ?? null;
  };
  const mkCode = async (v: Partial<typeof promoCodes.$inferInsert> & { kind: 'PERCENT' | 'FIXED'; value: number }) => {
    const code = `SW5${ids.nonce.toUpperCase()}${codes.length}`.slice(0, 20);
    codes.push(code);
    const [row] = await db.insert(promoCodes).values({ code, ...v }).returning();
    return row!;
  };
  const mkAsset = async () => {
    const [a] = await db
      .insert(assets)
      .values({ familyId: ids.hartleyId, kind: 'DRAWING', uploaderAccountId: ids.samId, controllerAccountId: ids.samId, visibility: 'FAMILY', keptInHome: true, moderationStatus: 'CLEAR' })
      .returning();
    assetIds.push(a!.id);
    return a!;
  };

  // ── the Christmas family bundle sizes ────────────────────────────────────────────────────────
  it('the christmas family bundle is £78 / £145 / £279 for 2 / 4 / 8 — from the DB catalogue', () => {
    expect(catalogue['christmasBundle']?.pricePence).toBe(7800);
    expect(catalogue['christmasBundle-for4']?.pricePence).toBe(14500);
    expect(catalogue['christmasBundle-for8']?.pricePence).toBe(27900);
  });

  // ── multi-buy on the LIVE catalogue (not fixtures) ──────────────────────────────────────────
  it('multi-buy on every live variant: steps 0/5/10/15 only, never decreasing, ≥15% net at every quantity 2…12', () => {
    let priced = 0;
    for (const key of Object.keys(catalogue)) {
      const e = lineEconomics(catalogue, key);
      const tiers = multiBuyTiers(e);
      expect(tiers).toHaveLength(4);
      for (const t of tiers) expect([0, 500, 1000, 1500]).toContain(t);
      for (let i = 1; i < tiers.length; i++) expect(tiers[i]!).toBeGreaterThanOrEqual(tiers[i - 1]!);
      if (!e) {
        expect(tiers).toEqual([0, 0, 0, 0]); // unknown costs → no offer
        continue;
      }
      priced++;
      for (let q = 2; q <= MULTI_BUY.checkUpTo; q++) {
        const bps = tierFor(tiers, q);
        if (bps === 0) continue;
        const { netPence, revenueExVatPence } = netAt(e, q, bps);
        expect(netPence, `${key} ×${q} at ${bps}bps`).toBeGreaterThanOrEqual((revenueExVatPence * MULTI_BUY.targetNetBps) / 10000 - 1e-6);
      }
    }
    expect(priced).toBeGreaterThan(100); // the live catalogue really has costs (prodigi costs loaded)
  });

  // ── the promo margin guard on the LIVE catalogue ────────────────────────────────────────────
  it('margin guard on every live variant: even a 50% code (or £50 off) keeps ≥10% of ex-VAT goods after cost + card fee', () => {
    const e = PROMO_ECONOMICS;
    for (const [key, entry] of Object.entries(catalogue)) {
      if (typeof entry.unitCostPence !== 'number') continue;
      for (const rule of [
        { id: 'x', code: 'X', kind: 'PERCENT' as const, value: 5000, minSpendPence: 0, commissionBps: 0 },
        { id: 'y', code: 'Y', kind: 'FIXED' as const, value: 5000, minSpendPence: 0, commissionBps: 0 },
        { id: 'z', code: 'Z', kind: 'PERCENT' as const, value: 1000, minSpendPence: 0, commissionBps: 500 }, // influencer 10% + 5%
      ]) {
        const S = entry.pricePence;
        const C = entry.unitCostPence;
        const out = evaluatePromo(rule, [{ linePence: S, lineCostPence: C }], 0);
        if (!out.applied) continue;
        const x = S - out.discountPence;
        const contribution = x / (1 + e.vatRate) - out.commissionPence - e.stripePct * x - e.stripeFixedPence - C;
        expect(contribution, `${key} with ${rule.code}`).toBeGreaterThanOrEqual(((S / (1 + e.vatRate)) * e.floorBps) / 10000 - 1);
      }
    }
  });

  // ── promo codes, end to end through placeOrder ──────────────────────────────────────────────
  it('£5 off £40 / £10 off £60: below the minimum the code is not used; at it, it is (or the guard trims it)', async () => {
    const five = await mkCode({ kind: 'FIXED', value: 500, minSpendPence: 4000 });
    const ten = await mkCode({ kind: 'FIXED', value: 1000, minSpendPence: 6000 });
    const r5 = await resolvePromo(db, five.code);
    const r10 = await resolvePromo(db, ten.code);
    if (!r5.ok || !r10.ok) throw new Error('codes should resolve');

    // a mug (£18) + a cushion (£22) = £40 exactly → £5 off
    const q40 = quote([{ productKey: 'mug', qty: 1 }, { productKey: 'cushion', qty: 1 }], { catalogue, promo: r5.rule });
    expect(q40.subtotalPence).toBe(4000);
    expect(q40.promo).toMatchObject({ applied: true });
    expect(q40.promoSavingPence).toBe(500);
    // one mug (£18) → min-spend, nothing off
    const q18 = quote([{ productKey: 'mug', qty: 1 }], { catalogue, promo: r5.rule });
    expect(q18.promo).toMatchObject({ applied: false, reason: 'min-spend', minSpendPence: 4000 });
    expect(q18.totalPence).toBe(1800);
    // £10 off a £65 framed print — and persisted on the order
    const res = await placeOrder(db, { items: [{ productKey: 'framedPrint', qty: 1 }], account: null, joinProvenance: null, promo: r10.rule });
    const o = await track(res.ref);
    expect(o!.promoCodeId).toBe(ten.id);
    expect(o!.promoSavingPence).toBe(1000);
    expect(o!.totalPence).toBe(o!.subtotalPence - 1000);
  });

  it('a code never stacks with buy-more-&-save: two mugs keep multi-buy + same-parcel, the 10% code is not used', async () => {
    const pct = await mkCode({ kind: 'PERCENT', value: 1000 });
    const r = await resolvePromo(db, pct.code);
    if (!r.ok) throw new Error('code should resolve');
    const res = await placeOrder(db, { items: [{ productKey: 'mug', qty: 2 }], account: null, joinProvenance: null, promo: r.rule });
    const o = await track(res.ref);
    expect(o!.multiBuySavingPence).toBeGreaterThan(0);
    expect(o!.parcelSavingPence).toBe(300);
    expect(o!.promoSavingPence).toBe(0);
    expect(o!.promoCodeId).toBeNull();
    expect(o!.totalPence).toBe(o!.subtotalPence - o!.multiBuySavingPence - o!.parcelSavingPence);
  });

  it('a code on a basket WITH the family bundle: the bundle is never discounted — the code only touches the other items', async () => {
    const ten = await mkCode({ kind: 'FIXED', value: 1000, minSpendPence: 6000 });
    const r = await resolvePromo(db, ten.code);
    if (!r.ok) throw new Error('code should resolve');
    const art = await mkAsset();
    const bundle = { placemat: { assetId: art.id }, ornaments: [{ assetId: art.id }, { assetId: art.id }] };
    // the bundle alone (£78 ≥ the £60 minimum): nothing eligible → not used
    const alone = quote([{ productKey: 'christmasBundle', qty: 1, bundle }], { catalogue, promo: r.rule });
    expect(alone.promoSavingPence).toBe(0);
    expect(alone.totalPence).toBe(7800);
    // bundle + a mug: the bundle's £78 counts toward the £60 minimum; the £10 can only come off the mug
    const withMug = quote([{ productKey: 'christmasBundle', qty: 1, bundle }, { productKey: 'mug', qty: 1 }], { catalogue, promo: r.rule });
    // RECORDED (05-N2): the outcome — the code is weighed against the £3 same-parcel saving the mug already earns
    expect(withMug.subtotalPence).toBe(9600);
    expect(withMug.promoSavingPence).toBeLessThanOrEqual(1000);
    expect(withMug.totalPence).toBe(9600 - withMug.promoSavingPence - withMug.parcelSavingPence);
    expect(withMug.totalPence).toBeGreaterThanOrEqual(7800); // the bundle is never cut
  });

  it('invalid, not-started, expired, switched-off and used-up codes are refused server-side', async () => {
    const now = new Date();
    const future = await mkCode({ kind: 'PERCENT', value: 1000, startsAt: new Date(now.getTime() + 86_400_000) });
    const past = await mkCode({ kind: 'PERCENT', value: 1000, endsAt: new Date(now.getTime() - 1000) });
    const off = await mkCode({ kind: 'PERCENT', value: 1000, active: false });
    const once = await mkCode({ kind: 'PERCENT', value: 1000, maxRedemptions: 1 });
    expect(await resolvePromo(db, 'NOT-A-REAL-CODE')).toEqual({ ok: false, reason: 'unknown' });
    expect(await resolvePromo(db, '<script>')).toEqual({ ok: false, reason: 'unknown' });
    expect(await resolvePromo(db, future.code)).toEqual({ ok: false, reason: 'not-started' });
    expect(await resolvePromo(db, past.code)).toEqual({ ok: false, reason: 'expired' });
    expect(await resolvePromo(db, off.code)).toEqual({ ok: false, reason: 'unknown' });
    const r = await resolvePromo(db, once.code);
    if (!r.ok) throw new Error('should resolve before use');
    await track((await placeOrder(db, { items: [{ productKey: 'framedPrint', qty: 1 }], account: null, joinProvenance: null, promo: r.rule })).ref);
    expect(await resolvePromo(db, once.code)).toEqual({ ok: false, reason: 'used-up' });
  });

  // 05-B4: maxRedemptions is only counted over PAID orders at the moment a basket is QUOTED/PLACED —
  // two checkouts opened before either is paid both get the discount, so a "1 use" code pays out twice.
  it.skip('05-B4: a max-1 code can be redeemed only once even when two checkouts are open at the same time', async () => {
    const once = await mkCode({ kind: 'PERCENT', value: 1000, maxRedemptions: 1 });
    const a = await resolvePromo(db, once.code);
    const b = await resolvePromo(db, once.code); // a second shopper, before the first has paid
    if (!a.ok || !b.ok) throw new Error('both resolve while nothing is paid');
    const oa = await track((await placeOrder(db, { items: [{ productKey: 'framedPrint', qty: 1 }], account: null, joinProvenance: null, promo: a.rule })).ref);
    const ob = await track((await placeOrder(db, { items: [{ productKey: 'framedPrint', qty: 1 }], account: null, joinProvenance: null, promo: b.rule })).ref);
    const paidWithCode = [oa, ob].filter((o) => o?.status === 'PAID' && o.promoSavingPence > 0);
    expect(paidWithCode).toHaveLength(1); // EXPECTED; today both are PAID with the discount
  });

  // ── the 5% join saving ──────────────────────────────────────────────────────────────────────
  it('the 5% join saving: never for a guest, an owner, a removed member, or a forged provenance', async () => {
    const now = Date.now();
    const invite = { id: 'inv-1', familyId: ids.hartleyId, verified: true, revoked: false, expiresAt: now + 86_400_000 };
    const member = { familyId: ids.hartleyId, status: 'ACTIVE' as const, inviteId: 'inv-1', isOwner: false, savingConsumed: false };
    const items = [{ productKey: 'framedPrint', qty: 1 }];
    const join = (p: object) => quote(items, { catalogue, joinProvenance: { invite, membership: member, now, ...p } as never }).joinSavingPence;
    expect(quote(items, { catalogue, joinProvenance: null }).joinSavingPence).toBe(0); // guest
    expect(join({})).toBe(Math.round(catalogue['framedPrint']!.pricePence * 0.05)); // genuine join
    expect(join({ membership: { ...member, isOwner: true } })).toBe(0);
    expect(join({ membership: { ...member, status: 'REMOVED' } })).toBe(0);
    expect(join({ membership: { ...member, savingConsumed: true } })).toBe(0);
    expect(join({ membership: { ...member, inviteId: 'some-other-invite' } })).toBe(0);
    expect(join({ invite: { ...invite, verified: false } })).toBe(0);
    expect(join({ invite: { ...invite, expiresAt: now - 1 } })).toBe(0);
    expect(join({ invite: { ...invite, familyId: ids.bloomId } })).toBe(0); // cross-family
  });

  // ── Stripe: what the card is charged == the order record ────────────────────────────────────
  describe.skipIf(!STRIPE_TEST)('Stripe Checkout (TEST mode) charges exactly the order total', () => {
    const stripe = () => new Stripe(STRIPE_KEY);
    const sessions: string[] = [];
    beforeAll(() => {
      process.env.STRIPE_SECRET_KEY = STRIPE_KEY;
    });
    afterAll(async () => {
      for (const s of sessions) await stripe().checkout.sessions.expire(s).catch(() => {});
      delete process.env.STRIPE_SECRET_KEY;
    });

    const charged = async (input: Parameters<typeof placeOrder>[1]) => {
      const res = await placeOrder(db, input);
      expect(res.ok).toBe(true);
      expect(res.checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.com\//);
      const o = (await track(res.ref))!;
      expect(o.status).toBe('PENDING'); // never paid before Stripe says so
      sessions.push(o.stripeSessionId!);
      const s = await stripe().checkout.sessions.retrieve(o.stripeSessionId!);
      expect(s.livemode).toBe(false);
      expect(s.currency).toBe('gbp');
      expect(s.shipping_address_collection?.allowed_countries).toEqual(['GB']);
      expect(s.client_reference_id).toBe(o.ref);
      return { o, s };
    };

    it('two mugs (multi-buy + same-parcel)', async () => {
      const { o, s } = await charged({ items: [{ productKey: 'mug', qty: 2 }], account: null, joinProvenance: null });
      expect(o.multiBuySavingPence + o.parcelSavingPence).toBeGreaterThan(0);
      expect(s.amount_total).toBe(o.totalPence);
    });

    it('a family set (3 garments)', async () => {
      const { o, s } = await charged({ items: [{ productKey: 'kidsTee', qty: 1 }, { productKey: 'adultTee', qty: 1 }, { productKey: 'babyBodysuit', qty: 1 }], account: null, joinProvenance: null });
      expect(s.amount_total).toBe(o.totalPence);
    });

    it('£10 off with a code', async () => {
      const ten = await mkCode({ kind: 'FIXED', value: 1000, minSpendPence: 6000 });
      const r = await resolvePromo(db, ten.code);
      if (!r.ok) throw new Error('code should resolve');
      const { o, s } = await charged({ items: [{ productKey: 'framedPrint', qty: 1 }], account: null, joinProvenance: null, promo: r.rule });
      expect(o.promoSavingPence).toBe(1000);
      expect(s.amount_total).toBe(o.totalPence);
    });

    it('a christmas bundle for 4 + a sack: the bundle is one Stripe line at £145, the sack takes £3 off', async () => {
      const art = await mkAsset();
      const bundle = { placemat: { assetId: art.id }, ornaments: [0, 1, 2, 3].map(() => ({ assetId: art.id })) };
      const { o, s } = await charged({ items: [{ productKey: 'christmasBundle-for4', qty: 1, bundle }, { productKey: 'sack', qty: 1 }], account: { id: ids.samId }, joinProvenance: null });
      expect(o.subtotalPence).toBe(14500 + catalogue['sack']!.pricePence);
      expect(o.parcelSavingPence).toBe(300);
      expect(s.amount_total).toBe(o.totalPence);
      const items = await stripe().checkout.sessions.listLineItems(s.id);
      expect(items.data.map((l) => [l.quantity, l.price?.unit_amount])).toContainEqual([1, 14500]);
      // …and the ORDER RECORD carries the bundle as its Prodigi pieces, which add up to £145 to the penny
      const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id));
      const bundleLines = lines.filter((l) => l.productKey !== 'sack');
      expect(bundleLines.reduce((n, l) => n + l.linePence, 0)).toBe(14500);
    });

    it('a joined member’s 5% reaches Stripe', async () => {
      const now = Date.now();
      const { o, s } = await charged({
        items: [{ productKey: 'blanket', qty: 1 }],
        account: null,
        joinProvenance: {
          invite: { id: 'inv', familyId: ids.hartleyId, verified: true, revoked: false, expiresAt: now + 60_000 },
          membership: { familyId: ids.hartleyId, status: 'ACTIVE', inviteId: 'inv', isOwner: false, savingConsumed: false },
          now,
        },
      });
      expect(o.joinSavingPence).toBeGreaterThan(0);
      expect(s.amount_total).toBe(o.totalPence);
    });
  });

  // ── the webhook ─────────────────────────────────────────────────────────────────────────────
  const completedEvent = (sessionId: string, extra: Record<string, unknown> = {}) =>
    ({
      id: `evt_sw5_${ids.nonce}_${webhookIds.length}`,
      type: 'checkout.session.completed',
      data: { object: { id: sessionId, payment_status: 'paid', customer_details: { email: 'Guest@Example.test' }, collected_information: { shipping_details: { name: 'Test Person', address: { line1: '1 Test Street', line2: null, city: 'London', postal_code: 'SW1A 1AA', country: 'GB' } } }, ...extra } },
    }) as unknown as Stripe.Event;
  const pendingOrder = async (sessionId: string) => {
    const [o] = await db.insert(orders).values({ ref: `SNK-T5${String(Math.floor(Math.random() * 1e4)).padStart(4, '0')}`, status: 'PENDING', subtotalPence: 1800, deliveryPence: 0, joinSavingPence: 0, totalPence: 1800, stripeSessionId: sessionId }).returning();
    orderIds.push(o!.id);
    return o!;
  };

  it('webhook: a paid session marks its order PAID once (replay = no-op), captures the address + payer email', async () => {
    const o = await pendingOrder(`cs_test_sw5_${ids.nonce}_a`);
    const ev = completedEvent(o.stripeSessionId!);
    webhookIds.push(ev.id);
    expect(await handleStripeEvent(db, ev)).toEqual({ handled: true, duplicate: false });
    expect(await handleStripeEvent(db, ev)).toEqual({ handled: false, duplicate: true });
    const [after] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(after!.status).toBe('PAID');
    expect(after!.shippingAddress).toMatchObject({ line1: '1 Test Street', postcode: 'SW1A 1AA', countryCode: 'GB' });
    expect(after!.buyerEmail).toBe('guest@example.test');
  });

  it('webhook: an event for a session we never made changes nothing (recorded, not handled)', async () => {
    const ev = completedEvent('cs_test_does_not_exist');
    webhookIds.push(ev.id);
    expect(await handleStripeEvent(db, ev)).toEqual({ handled: false, duplicate: false });
  });

  // 05-B2: checkout.session.completed fires for delayed payment methods with payment_status
  // 'unpaid' — the handler marks the order PAID (= queued for print) without checking.
  it('05-B2: a completed session whose payment is still UNPAID does not mark the order paid', async () => {
    const o = await pendingOrder(`cs_test_sw5_${ids.nonce}_unpaid`);
    const ev = completedEvent(o.stripeSessionId!, { payment_status: 'unpaid' });
    webhookIds.push(ev.id);
    await handleStripeEvent(db, ev);
    const [after] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(after!.status).toBe('PENDING');
    expect(after!.shippingAddress).toMatchObject({ postcode: 'SW1A 1AA' }); // the address is still kept

    // the money lands later: async_payment_succeeded (a paid session) → PAID, once
    const paid = { ...completedEvent(o.stripeSessionId!), id: `${ev.id}_async`, type: 'checkout.session.async_payment_succeeded' } as typeof ev;
    webhookIds.push(paid.id);
    expect(await handleStripeEvent(db, paid)).toEqual({ handled: true, duplicate: false });
    const [later] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(later!.status).toBe('PAID');
  });

  it('05-B2: a delayed payment that FAILS leaves the order unpaid (never printed)', async () => {
    const o = await pendingOrder(`cs_test_sw5_${ids.nonce}_failed`);
    const ev = { ...completedEvent(o.stripeSessionId!, { payment_status: 'unpaid' }), type: 'checkout.session.async_payment_failed' } as ReturnType<typeof completedEvent>;
    webhookIds.push(ev.id);
    expect(await handleStripeEvent(db, ev)).toEqual({ handled: false, duplicate: false });
    const [after] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(after!.status).toBe('PENDING');
  });

  // 05-B9: a hand-made basket line for a printed product with no drawing used to become a paid
  // "blank" order. The basket's order action now refuses it (basketHasPrintWithoutDrawing).
  it('05-B9: a printed item without its drawing is refused; a line with one (or a pack / bundle) is fine', async () => {
    const tf = { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 };
    expect(await basketHasPrintWithoutDrawing(db, [{ productKey: 'mug', qty: 1 }])).toBe(true);
    expect(await basketHasPrintWithoutDrawing(db, [{ productKey: 'mug', qty: 1, artwork: { assetId: '00000000-0000-0000-0000-000000000001', transform: tf } }, { productKey: 'card', qty: 1 }])).toBe(true);
    expect(await basketHasPrintWithoutDrawing(db, [{ productKey: 'mug', qty: 1, artwork: { assetId: '00000000-0000-0000-0000-000000000001', transform: tf } }])).toBe(false);
    expect(await basketHasPrintWithoutDrawing(db, [{ productKey: 'christmasBundle', qty: 1, bundle: { placemat: { assetId: '00000000-0000-0000-0000-000000000001' } } }])).toBe(false);
    expect(await basketHasPrintWithoutDrawing(db, [{ productKey: 'giftWrap', qty: 1 }])).toBe(false); // an artless add-on
    expect(await basketHasPrintWithoutDrawing(db, [{ productKey: 'totally-fake', qty: 1 }])).toBe(false); // ignored anyway
  });

  // ── the content-safety hold at fulfilment ───────────────────────────────────────────────────
  describe.skipIf(!S3)('a held drawing never reaches the printer', () => {
    const fake = () => {
      const created: CreateOrderRequest[] = [];
      const t: ProdigiOrderTransport & { created: CreateOrderRequest[] } = {
        created,
        async createOrder(req) {
          created.push(req);
          return { outcome: 'created', order: { id: `ord_sw5_${created.length}`, status: { stage: 'InProgress' } } };
        },
        async getOrder(id) {
          return { id, status: { stage: 'InProgress' } };
        },
      };
      return t;
    };
    const paidMug = async () => {
      const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
      const buf = await sharp({ create: { width: 3000, height: 3000, channels: 3, background: { r: 200, g: 90, b: 60 } } }).png().toBuffer();
      const ing = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: buf, keptInHome: true });
      keys.push(ing.key);
      assetIds.push(ing.assetId);
      await db.update(assets).set({ isBrandSafeFixture: true, moderationStatus: 'CLEAR' }).where(eq(assets.id, ing.assetId)); // brand-safe test art
      const res = await placeOrder(db, { items: [{ productKey: 'mug', qty: 1, artwork: { assetId: ing.assetId, transform: { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 } } }], account: { id: ids.samId }, joinProvenance: null });
      const o = (await track(res.ref))!;
      expect(o.status).toBe('PAID');
      return { o, assetId: ing.assetId };
    };

    it('an un-cleared drawing (IWF not connected → held) is refused BEFORE an order or a charge exists', async () => {
      const a = await mkAsset();
      await db.update(assets).set({ moderationStatus: 'FLAGGED', moderationDetail: { labels: ['hash check unavailable'] } }).where(eq(assets.id, a.id));
      const before = (await db.select({ id: orders.id }).from(orders)).length;
      await expect(
        placeOrder(db, { items: [{ productKey: 'mug', qty: 1, artwork: { assetId: a.id, transform: {} } }], account: { id: ids.samId }, joinProvenance: null }),
      ).rejects.toThrow(/not cleared/);
      expect((await db.select({ id: orders.id }).from(orders)).length).toBe(before);
    });

    // 05-B1: moderation is checked only when the order is PLACED. A drawing REPORTED after payment
    // (held: FLAGGED + an open report — "so nothing prints", contentReports.ts) still renders, passes
    // the egress gate and is sent to Prodigi: neither the worker nor the submitter reads moderation.
    it('05-B1: a drawing reported after payment is held back from Prodigi', async () => {
      const { o, assetId } = await paidMug();
      const jo = await resolveViewerContext(db, ids.joId, ids.hartleyId);
      expect(await reportKeepsake(db, jo, { assetId, reason: 'inappropriate' })).toEqual({ ok: true });
      const [held] = await db.select({ s: assets.moderationStatus }).from(assets).where(eq(assets.id, assetId));
      expect(held!.s).toBe('FLAGGED');
      const t0 = Date.now();
      for (;;) {
        await processFulfilment(db, { env: SANDBOX, onlyOrderIds: [o.id] });
        const [oi] = await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, o.id));
        const [a] = await db.select({ s: schema.orderItemArtwork.status }).from(schema.orderItemArtwork).where(eq(schema.orderItemArtwork.orderItemId, oi!.id));
        if (a!.s !== 'PENDING' && a!.s !== 'RENDERING') break;
        if (Date.now() - t0 > 60_000) throw new Error(`still ${a!.s}`);
        await new Promise((r) => setTimeout(r, 250));
      }
      const t = fake();
      await submitReadyOrders(db, { env: SANDBOX, transport: t, onlyOrderIds: [o.id] });
      expect(t.created).toHaveLength(0); // held: the worker re-checks moderation (gate.ts assertClearedForPrint)
    }, 90_000);
  });
});
