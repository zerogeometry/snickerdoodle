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

// The CHRISTMAS FAMILY BUNDLE (three sizes) end to end against Postgres: the server prices the size, splits it
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

  const order = async (productKey: string, bundle: unknown, qty = 1) => {
    const res = await placeOrder(db, { items: [{ productKey, qty, bundle }], account: { id: ids.samId }, joinProvenance: null });
    await track(res.ref);
    expect(res.ok).toBe(true);
    const [o] = await db.select().from(orders).where(eq(orders.ref, res.ref!));
    const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, o!.id));
    return { o: o!, lines, bySku: (sku: string) => lines.filter((l) => l.spec?.providerSku === sku) };
  };

  it('a set for 8 (£279): two 4-packs of each + 8 ornaments, one Prodigi item per pack / design, to the penny', async () => {
    const [table, b, c] = [await mk(), await mk(), await mk()];
    const bundle = {
      placemat: { assetId: table.id },
      coaster: { assetId: b.id },
      ornaments: [b, b, c, c, c, table, b, c].map((x) => ({ assetId: x.id })),
      pricePence: 1, // smuggled — ignored
      sacks: [{ assetId: b.id }], // an add-on that no longer exists — ignored
    };
    // a smuggled qty buys one set, never three
    const { o, lines, bySku } = await order('christmasBundle-for8', bundle, 3);
    expect(o.subtotalPence).toBe(27900);
    expect(o.totalPence).toBe(27900);
    expect(lines.reduce((s, l) => s + l.linePence, 0)).toBe(27900);
    expect(lines.every((l) => l.linePence === l.unitPricePence * l.qty)).toBe(true);
    const qty = (sku: string) => bySku(sku).reduce((n, l) => n + l.qty, 0);
    expect([qty('H-PLACE-4PK'), qty('H-COAST-4PK'), qty('XMAS-PORC-BAUB')]).toEqual([2, 2, 8]);
    expect(bySku('XMAS-SACK')).toEqual([]);
    expect(lines.every((l) => l.variantId && l.spec?.provider === 'PRODIGI')).toBe(true);

    const arts = await db.select().from(orderItemArtwork).where(inArray(orderItemArtwork.orderItemId, lines.map((l) => l.id)));
    expect(arts).toHaveLength(lines.length); // one print file per line
    const artOf = (sku: string) => arts.filter((a) => bySku(sku).some((l) => l.id === a.orderItemId));
    expect(artOf('H-PLACE-4PK').every((a) => a.assetId === table.id)).toBe(true); // the placemats' drawing
    expect(artOf('H-COAST-4PK').every((a) => a.assetId === b.id)).toBe(true); // the coasters' own
    // each ornament its own drawing: 3 × b, 4 × c, 1 × the table's — grouped by design
    const ornBy = new Map<string, number>();
    for (const l of bySku('XMAS-PORC-BAUB')) {
      const a = arts.find((x) => x.orderItemId === l.id)!;
      ornBy.set(a.assetId!, (ornBy.get(a.assetId!) ?? 0) + l.qty);
    }
    expect(Object.fromEntries(ornBy)).toEqual({ [b.id]: 3, [c.id]: 4, [table.id]: 1 });
    // each piece frozen with its OWN template: the ornament at Prodigi's exact 885 px, no bleed
    expect(artOf('XMAS-PORC-BAUB').every((a) => (a.templateSnapshot as { printWidthPx: number; bleedMm: number }).printWidthPx === 885 && (a.templateSnapshot as { bleedMm: number }).bleedMm === 0)).toBe(true);
    expect(artOf('H-PLACE-4PK').every((a) => (a.templateSnapshot as { printWidthPx: number }).printWidthPx === 3425)).toBe(true);
  });

  it('a set for 2 (£78): the 2-packs; the coasters + ornaments wear the placemats’ drawing by default', async () => {
    const table = await mk();
    const { o, lines, bySku } = await order('christmasBundle', { placemat: { assetId: table.id } });
    expect(o.subtotalPence).toBe(7800);
    expect(lines.reduce((s, l) => s + l.linePence, 0)).toBe(7800);
    expect([bySku('H-PLACE-2PK').length, bySku('H-COAST-2PK').length, bySku('XMAS-PORC-BAUB').reduce((n, l) => n + l.qty, 0)]).toEqual([1, 1, 2]);
    const arts = await db.select().from(orderItemArtwork).where(inArray(orderItemArtwork.orderItemId, lines.map((l) => l.id)));
    expect(arts.every((a) => a.assetId === table.id)).toBe(true);
  });

  it('a set for 4 (£145): the 4-packs', async () => {
    const table = await mk();
    const { o, bySku } = await order('christmasBundle-for4', { placemat: { assetId: table.id } });
    expect(o.subtotalPence).toBe(14500);
    expect([bySku('H-PLACE-4PK').length, bySku('H-COAST-4PK').length, bySku('XMAS-PORC-BAUB').reduce((n, l) => n + l.qty, 0)]).toEqual([1, 1, 4]);
  });

  it('no placemat drawing, or a size we don’t sell → refused before anything is written', async () => {
    const mineNow = async () => (await db.select({ id: orders.id }).from(orders).where(eq(orders.accountId, ids.samId))).length;
    const before = await mineNow();
    await expect(placeOrder(db, { items: [{ productKey: 'christmasBundle', qty: 1, bundle: { ornaments: [] } }], account: { id: ids.samId }, joinProvenance: null })).rejects.toThrow(/placemats/);
    await expect(placeOrder(db, { items: [{ productKey: 'christmasBundle-for4', qty: 1 }], account: { id: ids.samId }, joinProvenance: null })).rejects.toThrow(/placemats/);
    const mine = await mk();
    expect(await placeOrder(db, { items: [{ productKey: 'christmasBundle-for6', qty: 1, bundle: { placemat: { assetId: mine.id } } }], account: { id: ids.samId }, joinProvenance: null })).toEqual({ ok: false, reason: 'empty' });
    expect(await mineNow()).toBe(before);
  });

  it('every drawing passes the authz gate at ORDER — a stranger’s, even on one ornament or the coasters, is denied', async () => {
    const mine = await mk();
    await expect(
      placeOrder(db, { items: [{ productKey: 'christmasBundle', qty: 1, bundle: { placemat: { assetId: mine.id }, ornaments: [{ assetId: ids.assetBloomFamily }] } }], account: { id: ids.samId }, joinProvenance: null }),
    ).rejects.toBeInstanceOf(AuthzError);
    await expect(
      placeOrder(db, { items: [{ productKey: 'christmasBundle', qty: 1, bundle: { placemat: { assetId: mine.id }, coaster: { assetId: ids.assetBloomFamily } } }], account: { id: ids.samId }, joinProvenance: null }),
    ).rejects.toBeInstanceOf(AuthzError);
  });

  it('a drawing screening hasn’t cleared can’t reach a print order (D8)', async () => {
    const mine = await mk();
    const flagged = await mk({ moderationStatus: 'FLAGGED' });
    await expect(
      placeOrder(db, { items: [{ productKey: 'christmasBundle', qty: 1, bundle: { placemat: { assetId: mine.id }, ornaments: [{ assetId: flagged.id }] } }], account: { id: ids.samId }, joinProvenance: null }),
    ).rejects.toThrow(/cleared for printing/);
  });

  it('a guest can’t order one (a personalised order needs the controlling parent)', async () => {
    const mine = await mk();
    await expect(placeOrder(db, { items: [{ productKey: 'christmasBundle', qty: 1, bundle: { placemat: { assetId: mine.id } } }], account: null, joinProvenance: null })).rejects.toThrow(/signed in/);
  });

  it('add-to-basket: every drawing authz-checked; buying access is enough; the size priced by the server', async () => {
    const mine = await mk();
    // Rosie: Extended circle, VIEW_BUY — sees the family's EXTENDED keepsake, may build from it
    const ext = await mk({ visibility: 'EXTENDED' });
    const ok = await checkBundle(db, { accountId: ids.rosieId, uploadClaims: [], sku: 'christmasBundle-for4', bundle: { placemat: { assetId: ext.id }, ornaments: [{ assetId: ext.id }] } });
    expect(ok).toMatchObject({ ok: true, size: 4, pricePence: 14500 });
    // …but not a FAMILY-only one (circle), nor the Blooms’ (another family) anywhere, nor as a guest
    expect(await checkBundle(db, { accountId: ids.rosieId, uploadClaims: [], sku: 'christmasBundle', bundle: { placemat: { assetId: mine.id } } })).toEqual({ ok: false, reason: 'not-allowed' });
    expect(await checkBundle(db, { accountId: ids.samId, uploadClaims: [], sku: 'christmasBundle', bundle: { placemat: { assetId: mine.id }, coaster: { assetId: ids.assetBloomFamily } } })).toEqual({ ok: false, reason: 'not-allowed' });
    expect(await checkBundle(db, { accountId: ids.samId, uploadClaims: [], sku: 'christmasBundle-for8', bundle: { placemat: { assetId: mine.id }, ornaments: [{ assetId: ids.assetBloomFamily }] } })).toEqual({ ok: false, reason: 'not-allowed' });
    expect(await checkBundle(db, { accountId: null, uploadClaims: [], sku: 'christmasBundle', bundle: { placemat: { assetId: mine.id } } })).toEqual({ ok: false, reason: 'not-allowed' });
    // a removed member sees nothing
    expect(await checkBundle(db, { accountId: ids.malloryId, uploadClaims: [], sku: 'christmasBundle', bundle: { placemat: { assetId: ext.id } } })).toEqual({ ok: false, reason: 'not-allowed' });
    // no placemat drawing, or no such size = no bundle
    expect(await checkBundle(db, { accountId: ids.samId, uploadClaims: [], sku: 'christmasBundle', bundle: { ornaments: [{ assetId: mine.id }] } })).toEqual({ ok: false, reason: 'invalid' });
    expect(await checkBundle(db, { accountId: ids.samId, uploadClaims: [], sku: 'christmasBundle-for3', bundle: { placemat: { assetId: mine.id } } })).toEqual({ ok: false, reason: 'invalid' });
    // the server's price, whatever the client says
    expect(await checkBundle(db, { accountId: ids.samId, uploadClaims: [], sku: 'christmasBundle-for8', bundle: { placemat: { assetId: mine.id }, pricePence: 1 } })).toMatchObject({ ok: true, pricePence: 27900 });
  });

  it('the bundle-only packs are seeded for fulfilment but never priced or shown on their own', async () => {
    const catalogue = await getCatalogue(db);
    for (const sku of BUNDLE_ONLY_SKUS) expect(catalogue[sku], sku).toBeUndefined();
    expect(catalogue.placemat?.pricePence).toBe(6000);
    expect(catalogue.coaster?.pricePence).toBe(3200);
    expect([catalogue.christmasBundle?.pricePence, catalogue['christmasBundle-for4']?.pricePence, catalogue['christmasBundle-for8']?.pricePence]).toEqual([7800, 14500, 27900]);
    const all = await loadCatalogue(db, { includeHidden: true });
    const skus = all.flatMap((p) => p.variants.map((v) => v.sku));
    for (const sku of BUNDLE_ONLY_SKUS) expect(skus).not.toContain(sku);
    expect(all.find((p) => p.key === 'placemat')?.variants.map((v) => v.sku)).toEqual(['placemat']);
    // a hand-crafted order for a bundle-only pack is dropped — nothing to charge
    const res = await placeOrder(db, { items: [{ productKey: 'placemat-packof1', qty: 5 }], account: { id: ids.samId }, joinProvenance: null });
    expect(res).toEqual({ ok: false, reason: 'empty' });
  });

  it('the christmas eve bundle is retired: not in the shop, not priceable, not orderable', async () => {
    const catalogue = await getCatalogue(db);
    expect(catalogue.christmasEveBundle).toBeUndefined();
    const all = await loadCatalogue(db, { includeHidden: true });
    expect(all.some((p) => p.key === 'christmasEveBundle')).toBe(false);
    const res = await placeOrder(db, { items: [{ productKey: 'christmasEveBundle', qty: 1 }], account: { id: ids.samId }, joinProvenance: null });
    expect(res).toEqual({ ok: false, reason: 'empty' });
  });
});
