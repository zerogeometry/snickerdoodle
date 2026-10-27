import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { assets, orderItemArtwork, orderItems, orders } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError } from '@/authz';
import { placeOrder } from '@/server/orders';
import { checkBundle } from '@/server/bundle';
import { getCatalogue, loadCatalogue, seedCatalogue } from '@/server/catalogue';
import { BUNDLE_ONLY_SKUS } from '@/lib/christmas-bundle';
import type { DbHandle } from '@/server/db';

const URL = process.env.DATABASE_URL;

// The CHRISTMAS FAMILY BUNDLE end to end against Postgres: the server counts, prices and splits it
// into its Prodigi pieces, and every drawing passes the same authz + moderation gates as any print.
describe.skipIf(!URL)('christmas family bundle — integration', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const orderIds: string[] = [];
  const assetIds: string[] = [];
  const prevStripeKey = process.env.STRIPE_SECRET_KEY;

  beforeAll(async () => {
    delete process.env.STRIPE_SECRET_KEY; // the dev mark-paid path
    client = postgres(URL!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
  });
  afterAll(async () => {
    if (orderIds.length) await db.delete(orders).where(inArray(orders.id, orderIds));
    if (assetIds.length) await db.delete(assets).where(inArray(assets.id, assetIds));
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
    if (prevStripeKey !== undefined) process.env.STRIPE_SECRET_KEY = prevStripeKey;
  });

  const mk = async (o: Partial<typeof assets.$inferInsert> = {}) => {
    const [a] = await db
      .insert(assets)
      .values({ familyId: ids.hartleyId, kind: 'DRAWING', uploaderAccountId: ids.samId, controllerAccountId: ids.samId, visibility: 'FAMILY', keptInHome: true, moderationStatus: 'CLEAR', ...o })
      .returning();
    assetIds.push(a!.id);
    return a!;
  };
  const track = async (ref?: string) => {
    if (!ref) return;
    const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.ref, ref));
    if (o) orderIds.push(o.id);
  };

  it('the biggest example: £385, split into one Prodigi item per pack / design, to the penny', async () => {
    const [table, b, c] = [await mk(), await mk(), await mk()];
    const bundle = {
      table: { assetId: table.id },
      ornaments: [b, b, c, c, c, table].map((x) => ({ assetId: x.id })),
      sacks: [b, c, b, c, b, c].map((x) => ({ assetId: x.id })),
      extraPlacemats: 2,
      extraCoasters: 2,
      pricePence: 1, // smuggled — ignored
    };
    // a smuggled qty buys one bundle, never three
    const res = await placeOrder(db, { items: [{ productKey: 'christmasBundle', qty: 3, bundle }], account: { id: ids.samId }, joinProvenance: null });
    await track(res.ref);
    expect(res.ok).toBe(true);
    const [order] = await db.select().from(orders).where(eq(orders.ref, res.ref!));
    expect(order!.subtotalPence).toBe(38500);
    expect(order!.totalPence).toBe(38500);

    const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, order!.id));
    expect(lines.reduce((s, l) => s + l.linePence, 0)).toBe(38500);
    expect(lines.every((l) => l.linePence === l.unitPricePence * l.qty)).toBe(true);
    const bySku = (sku: string) => lines.filter((l) => l.spec?.providerSku === sku);
    expect(bySku('H-PLACE-6PK').map((l) => l.qty)).toEqual([1]); // 6 placemats = one 6-pack
    expect(bySku('H-COAST-6PK').map((l) => l.qty)).toEqual([1]); // 8 coasters = a 6-pack + a 2-pack
    expect(bySku('H-COAST-2PK').map((l) => l.qty)).toEqual([1]);
    expect(bySku('XMAS-PORC-BAUB').map((l) => l.qty).sort()).toEqual([1, 2, 3]); // grouped by design
    expect(bySku('XMAS-SACK').map((l) => l.qty).sort()).toEqual([3, 3]);
    expect(lines.reduce((s, l) => s + l.qty, 0)).toBe(15); // 15 Prodigi items, one parcel (all uk9)
    expect(lines.every((l) => l.variantId && l.spec?.provider === 'PRODIGI')).toBe(true);

    const arts = await db.select().from(orderItemArtwork).where(inArray(orderItemArtwork.orderItemId, lines.map((l) => l.id)));
    expect(arts).toHaveLength(lines.length); // one print file per item
    const artOf = (sku: string) => arts.filter((a) => bySku(sku).some((l) => l.id === a.orderItemId));
    // the table drawing on every placemat + coaster pack
    expect([...artOf('H-PLACE-6PK'), ...artOf('H-COAST-6PK'), ...artOf('H-COAST-2PK')].every((a) => a.assetId === table.id)).toBe(true);
    // each piece frozen with its OWN template: the ornament at Prodigi's exact 885 px, no bleed
    expect(artOf('XMAS-PORC-BAUB').every((a) => (a.templateSnapshot as { printWidthPx: number; bleedMm: number }).printWidthPx === 885 && (a.templateSnapshot as { bleedMm: number }).bleedMm === 0)).toBe(true);
    expect(artOf('H-PLACE-6PK').every((a) => (a.templateSnapshot as { printWidthPx: number }).printWidthPx === 3425)).toBe(true);
  });

  it('no table drawing → refused before anything is written', async () => {
    const mineNow = async () => (await db.select({ id: orders.id }).from(orders).where(eq(orders.accountId, ids.samId))).length;
    const before = await mineNow();
    await expect(placeOrder(db, { items: [{ productKey: 'christmasBundle', qty: 1, bundle: { ornaments: [] } }], account: { id: ids.samId }, joinProvenance: null })).rejects.toThrow(/table/);
    await expect(placeOrder(db, { items: [{ productKey: 'christmasBundle', qty: 1 }], account: { id: ids.samId }, joinProvenance: null })).rejects.toThrow(/table/);
    expect(await mineNow()).toBe(before);
  });

  it('every drawing passes the authz gate at ORDER — a stranger’s, even on one sack, is denied', async () => {
    const mine = await mk();
    await expect(
      placeOrder(db, { items: [{ productKey: 'christmasBundle', qty: 1, bundle: { table: { assetId: mine.id }, sacks: [{ assetId: ids.assetBloomFamily }] } }], account: { id: ids.samId }, joinProvenance: null }),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it('a drawing screening hasn’t cleared can’t reach a print order (D8)', async () => {
    const mine = await mk();
    const flagged = await mk({ moderationStatus: 'FLAGGED' });
    await expect(
      placeOrder(db, { items: [{ productKey: 'christmasBundle', qty: 1, bundle: { table: { assetId: mine.id }, ornaments: [{ assetId: flagged.id }] } }], account: { id: ids.samId }, joinProvenance: null }),
    ).rejects.toThrow(/cleared for printing/);
  });

  it('a guest can’t order one (a personalised order needs the controlling parent)', async () => {
    const mine = await mk();
    await expect(placeOrder(db, { items: [{ productKey: 'christmasBundle', qty: 1, bundle: { table: { assetId: mine.id } } }], account: null, joinProvenance: null })).rejects.toThrow(/signed in/);
  });

  it('add-to-basket: buying access is enough to build from existing art; a stranger’s drawing is not', async () => {
    const mine = await mk();
    // Rosie: Extended circle, VIEW_BUY — sees the family's EXTENDED keepsake, may build from it
    const ext = await mk({ visibility: 'EXTENDED' });
    const ok = await checkBundle(db, { accountId: ids.rosieId, uploadClaims: [], bundle: { table: { assetId: ext.id }, ornaments: [{ assetId: ext.id }] } });
    expect(ok).toMatchObject({ ok: true, pricePence: 10500 });
    // …but not a FAMILY-only one (circle), nor the Blooms’ (another family), nor as a guest
    expect(await checkBundle(db, { accountId: ids.rosieId, uploadClaims: [], bundle: { table: { assetId: mine.id } } })).toEqual({ ok: false, reason: 'not-allowed' });
    expect(await checkBundle(db, { accountId: ids.samId, uploadClaims: [], bundle: { table: { assetId: mine.id }, sacks: [{ assetId: ids.assetBloomFamily }] } })).toEqual({ ok: false, reason: 'not-allowed' });
    expect(await checkBundle(db, { accountId: null, uploadClaims: [], bundle: { table: { assetId: mine.id } } })).toEqual({ ok: false, reason: 'not-allowed' });
    // a removed member sees nothing
    expect(await checkBundle(db, { accountId: ids.malloryId, uploadClaims: [], bundle: { table: { assetId: ext.id } } })).toEqual({ ok: false, reason: 'not-allowed' });
    // no table drawing = no bundle
    expect(await checkBundle(db, { accountId: ids.samId, uploadClaims: [], bundle: { ornaments: [{ assetId: mine.id }] } })).toEqual({ ok: false, reason: 'invalid' });
    // the server's price, whatever the client says
    expect(await checkBundle(db, { accountId: ids.samId, uploadClaims: [], bundle: { table: { assetId: mine.id }, extraCoasters: 2, pricePence: 1 } })).toMatchObject({ ok: true, pricePence: 10100 });
  });

  it('the bundle-only packs are seeded for fulfilment but never priced or shown on their own', async () => {
    const catalogue = await getCatalogue(db);
    for (const sku of BUNDLE_ONLY_SKUS) expect(catalogue[sku], sku).toBeUndefined();
    expect(catalogue.placemat?.pricePence).toBe(6000);
    expect(catalogue.coaster?.pricePence).toBe(3200);
    expect(catalogue.christmasBundle?.pricePence).toBe(9000);
    const all = await loadCatalogue(db, { includeHidden: true });
    const skus = all.flatMap((p) => p.variants.map((v) => v.sku));
    for (const sku of BUNDLE_ONLY_SKUS) expect(skus).not.toContain(sku);
    expect(all.find((p) => p.key === 'placemat')?.variants.map((v) => v.sku)).toEqual(['placemat']);
    // a hand-crafted order for a bundle-only pack is dropped — nothing to charge
    const res = await placeOrder(db, { items: [{ productKey: 'placemat-packof1', qty: 5 }], account: { id: ids.samId }, joinProvenance: null });
    expect(res).toEqual({ ok: false, reason: 'empty' });
  });
});
