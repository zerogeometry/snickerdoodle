import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { appTokens, assets, orderItemArtwork, orderItems, orders, productVariants, products, savedDesigns } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError, type Reviewer } from '@/authz';
import { seedCatalogue } from '@/server/catalogue';
import { weekInsights, type WeekDb } from '@/server/admin/week';

const DB = process.env.DATABASE_URL;

/**
 * The admin app's "this week" screen (src/server/admin/week.ts) against a real Postgres: admins with two-step login
 * only, and the week's aggregates add up on seeded rows. Everything is seeded into a week of March 2031 so the rest
 * of the database (other suites' orders) can't move the numbers: Mon 10 – Sun 16 Mar 2031 (GMT), against 3–9 Mar.
 */
describe.skipIf(!DB)('admin · this week (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: WeekDb;
  let ids: SeededIds;
  let admin: Reviewer;
  const nonce = randomUUID().slice(0, 8);
  const orderIds: string[] = [];
  const assetIds: string[] = [];
  const tokenIds: string[] = [];
  let mugLabel = 'mug';
  let frameLabel = 'framedPrint';
  let bundleLabel = 'christmasBundle';

  const t = (iso: string) => new Date(iso);

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
    admin = { accountId: ids.samId, isAdmin: true, mfaVerified: true };
    const label = async (key: string) => (await db.select({ label: products.label }).from(products).where(eq(products.key, key)))[0]?.label ?? key;
    [mugLabel, frameLabel, bundleLabel] = [await label('mug'), await label('framedPrint'), await label('christmasBundle')];
    const [variant] = await db.select({ id: productVariants.id }).from(productVariants).limit(1);

    // pictures: 2 on the website + 2 from Draw this week, 1 on the website the week before
    const asset = async (createdAt: Date, source: 'web' | 'app-screen' | 'app-paper') => {
      const [a] = await db.insert(assets).values({ familyId: ids.hartleyId, kind: 'DRAWING', uploaderAccountId: ids.samId, controllerAccountId: ids.samId, source, createdAt }).returning({ id: assets.id });
      assetIds.push(a!.id);
      return a!.id;
    };
    const web1 = await asset(t('2031-03-10T09:00:00Z'), 'web');
    await asset(t('2031-03-11T09:00:00Z'), 'web');
    const drawn = await asset(t('2031-03-11T10:00:00Z'), 'app-screen');
    await asset(t('2031-03-12T10:00:00Z'), 'app-paper');
    await asset(t('2031-03-04T10:00:00Z'), 'web');

    // two designs this week
    await db.insert(savedDesigns).values([
      { familyId: ids.hartleyId, createdByAccountId: ids.samId, assetId: web1, variantSku: 'mug', createdAt: t('2031-03-10T10:00:00Z') },
      { familyId: ids.hartleyId, createdByAccountId: ids.samId, assetId: drawn, variantSku: 'framedPrint', createdAt: t('2031-03-11T11:00:00Z') },
    ]);

    // a phone linked this week
    const [tok] = await db
      .insert(appTokens)
      .values({ tokenHash: `test-${nonce}`, accountId: ids.samId, familyId: ids.hartleyId, deviceLabel: 'an android phone', createdAt: t('2031-03-11T08:00:00Z'), lastUsedAt: t('2031-03-12T08:00:00Z') })
      .returning({ id: appTokens.id });
    tokenIds.push(tok!.id);

    let n = 0;
    const order = async (o: { at: Date; status: 'PENDING' | 'PAID' | 'FULFILLING' | 'SHIPPED' | 'CANCELLED'; totalPence: number; accountId?: string; buyerEmail?: string }, lines: { productKey: string; qty: number; bundleKey?: string; assetId?: string }[]) => {
      const paid = o.status !== 'PENDING' && o.status !== 'CANCELLED';
      const [row] = await db
        .insert(orders)
        .values({ ref: `wk-${nonce}-${++n}`, status: o.status, subtotalPence: o.totalPence, deliveryPence: 0, totalPence: o.totalPence, accountId: o.accountId ?? null, buyerEmail: o.buyerEmail ?? null, paidAt: paid ? o.at : null, createdAt: o.at })
        .returning({ id: orders.id });
      orderIds.push(row!.id);
      for (const l of lines) {
        const [item] = await db.insert(orderItems).values({ orderId: row!.id, productKey: l.productKey, bundleKey: l.bundleKey ?? null, qty: l.qty, unitPricePence: 100, linePence: 100 * l.qty }).returning({ id: orderItems.id });
        if (l.assetId) await db.insert(orderItemArtwork).values({ orderItemId: item!.id, assetId: l.assetId, variantId: variant!.id, controllerAccountId: ids.samId, templateSnapshot: {}, transform: {} });
      }
    };
    // this week, by Thursday noon: Sam's first order (a Draw drawing), a guest's bundle, Sam again (2 mugs);
    // one checkout left unpaid and one cancelled. Saturday: another guest's framed print.
    await order({ at: t('2031-03-10T12:00:00Z'), status: 'PAID', totalPence: 3600, accountId: ids.samId }, [{ productKey: 'framedPrint', qty: 1, assetId: drawn }]);
    await order({ at: t('2031-03-11T12:00:00Z'), status: 'SHIPPED', totalPence: 14500, buyerEmail: `gran-${nonce}@example.test` }, [
      { productKey: 'placemat-test', qty: 4, bundleKey: 'christmasBundle' },
      { productKey: 'coaster-test', qty: 4, bundleKey: 'christmasBundle' },
    ]);
    await order({ at: t('2031-03-12T12:00:00Z'), status: 'FULFILLING', totalPence: 2400, accountId: ids.samId }, [{ productKey: 'mug', qty: 2 }]);
    await order({ at: t('2031-03-12T13:00:00Z'), status: 'PENDING', totalPence: 3600, accountId: ids.joId }, [{ productKey: 'mug', qty: 1 }]);
    await order({ at: t('2031-03-12T14:00:00Z'), status: 'CANCELLED', totalPence: 3600, accountId: ids.joId }, [{ productKey: 'mug', qty: 1 }]);
    await order({ at: t('2031-03-15T12:00:00Z'), status: 'PAID', totalPence: 1000, buyerEmail: `aunt-${nonce}@example.test` }, [{ productKey: 'framedPrint', qty: 1 }]);
    // the week before (Tuesday): Jo's first order
    await order({ at: t('2031-03-04T12:00:00Z'), status: 'PAID', totalPence: 5000, accountId: ids.joId }, [{ productKey: 'mug', qty: 1 }]);
  }, 120_000);

  afterAll(async () => {
    if (orderIds.length) await db.delete(orders).where(inArray(orders.id, orderIds));
    if (assetIds.length) {
      await db.delete(savedDesigns).where(inArray(savedDesigns.assetId, assetIds));
      await db.delete(assets).where(inArray(assets.id, assetIds));
    }
    if (tokenIds.length) await db.delete(appTokens).where(inArray(appTokens.id, tokenIds));
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  it('refuses anyone but an admin who has passed two-step login', async () => {
    const now = t('2031-03-13T12:00:00Z');
    await expect(weekInsights(db, { accountId: ids.joId, isAdmin: false, mfaVerified: true }, { which: 'this', now })).rejects.toBeInstanceOf(AuthzError);
    await expect(weekInsights(db, { accountId: ids.samId, isAdmin: true, mfaVerified: false }, { which: 'this', now })).rejects.toBeInstanceOf(AuthzError);
    await expect(weekInsights(db, { accountId: null, isAdmin: false, mfaVerified: false }, { which: 'last', now })).rejects.toBeInstanceOf(AuthzError);
  });

  it('this week so far (Thursday noon) against the same stretch of last week', async () => {
    const w = await weekInsights(db, admin, { which: 'this', now: t('2031-03-13T12:00:00Z') });
    expect(w.pair.current.start).toEqual(t('2031-03-10T00:00:00Z'));
    expect(w.pair.previous.end).toEqual(t('2031-03-06T12:00:00Z'));

    expect(w.current.sales).toEqual({ orders: 3, takingsPence: 20500, takingsExVatPence: 3000 + 12083 + 2000, averagePence: 6833 });
    expect(w.previous.sales.orders).toBe(1);
    expect(w.current.summary.bundles).toBe(1);
    expect(w.current.summary.multiItemRate).toBeCloseTo(2 / 3);
    expect(w.current.summary.firstOrders).toBe(2);
    expect(w.repeat.returningOrders).toBe(1);
    expect(w.repeat.returningOrdersBefore).toBe(0);

    expect(w.products).toEqual(
      expect.arrayContaining([
        { label: mugLabel, units: 2 },
        { label: frameLabel, units: 1 },
        { label: bundleLabel, units: 1 }, // one bundle, not 8 pieces
      ]),
    );
    expect(w.products).toHaveLength(3);
    expect(w.products[0]).toEqual({ label: mugLabel, units: 2 });

    expect(w.funnel.map((s) => [s.key, s.count])).toEqual([
      ['uploads', 4],
      ['designs', 2],
      ['checkouts', 5],
      ['paid', 3],
    ]);
    expect(w.current.funnel.uploadsWeb).toBe(2);
    expect(w.current.funnel.uploadsDraw).toBe(2);
    expect(w.previous.funnel.uploads).toBe(1);
    expect(w.funnel[3]!.ofPrevious).toBeCloseTo(3 / 5);

    expect(w.current.draw).toEqual({ phonesLinked: 1, drawingsSent: 2, drawOrders: 1 });
    expect(w.phonesLinkedNow).toBe(1);
    expect(w.hasData).toBe(true);

    expect(w.channels.withSpend).toBe(false);
    const direct = w.channels.rows.find((r) => r.label === 'direct');
    expect(direct).toMatchObject({ orders: 3, first: 2, costPerFirstPence: null, flag: '' });
  });

  it('last week counts the whole week; typed spend gives cost per first order and flags over £15', async () => {
    const w = await weekInsights(db, admin, { which: 'last', now: t('2031-03-18T12:00:00Z'), spend: [{ channel: 'direct', pence: 4500 }] });
    expect(w.pair.current.from).toBe('2031-03-10');
    expect(w.pair.current.to).toBe('2031-03-16');
    expect(w.current.sales.orders).toBe(4);
    expect(w.current.sales.takingsPence).toBe(21500);
    expect(w.current.funnel.checkouts).toBe(6);
    expect(w.previous.sales).toMatchObject({ orders: 1, takingsPence: 5000 });

    const direct = w.channels.rows.find((r) => r.label === 'direct')!;
    expect(direct).toMatchObject({ orders: 4, first: 3, spendPence: 4500, costPerFirstPence: 1500, flag: '' });
    const pricier = await weekInsights(db, admin, { which: 'last', now: t('2031-03-18T12:00:00Z'), spend: [{ channel: 'direct', pence: 6000 }] });
    expect(pricier.channels.rows.find((r) => r.label === 'direct')).toMatchObject({ costPerFirstPence: 2000, flag: 'over £15' });
    expect(pricier.channels.total).toMatchObject({ orders: 4, spendPence: 6000 });
  });

  it('carries counts and totals only — no emails, refs or ids', async () => {
    const w = await weekInsights(db, admin, { which: 'last', now: t('2031-03-18T12:00:00Z') });
    const text = JSON.stringify(w);
    expect(text).not.toContain(nonce);
    expect(text).not.toContain('@');
    for (const id of [...assetIds, ...orderIds, ids.samId, ids.joId, ids.hartleyId]) expect(text).not.toContain(id);
  });

  it('an empty week says so', async () => {
    const w = await weekInsights(db, admin, { which: 'this', now: t('2031-05-07T12:00:00Z') });
    expect(w.hasData).toBe(false);
    expect(w.current.sales.orders).toBe(0);
    expect(w.products).toEqual([]);
  });
});
