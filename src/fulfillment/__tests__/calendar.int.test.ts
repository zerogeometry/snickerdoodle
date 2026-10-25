import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { assets, orderItemArtwork, orderItems, orders, productVariantProviders, productVariants, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { seedCatalogue } from '@/server/catalogue';
import { placeOrder } from '@/server/orders';
import { processFulfilment } from '@/fulfillment/worker';
import { submitReadyOrders } from '@/fulfillment/submit';
import { CALENDAR_PAGES } from '@/lib/calendar';
import type { CreateOrderRequest, ProdigiOrderTransport } from '@/server/prodigi/orders';
import { deleteObject } from '@/storage';
import type { GateEnv } from '@/fulfillment/gate';
import type { DbHandle } from '@/server/db';

// The dated 2027 wall calendar, end to end: basket pages → placeOrder (server price, 13 frozen
// pages, the per-page DPI gate) → the worker renders each page → ONE Prodigi item with 13 assets.
const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const SANDBOX: GateEnv = { podMode: 'SANDBOX', lg3SignedOff: false };
const T = { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 };
const png = (w: number, h: number, r: number) => sharp({ create: { width: w, height: h, channels: 3, background: { r, g: 160, b: 200 } } }).png().toBuffer();

function fakeTransport() {
  const created: CreateOrderRequest[] = [];
  const transport: ProdigiOrderTransport & { created: CreateOrderRequest[] } = {
    created,
    async createOrder(req) {
      created.push(req);
      return { outcome: 'created', order: { id: `ord_cal_${created.length}`, status: { stage: 'InProgress' } } };
    },
    async getOrder(id) {
      return { id, status: { stage: 'InProgress' } };
    },
  };
  return transport;
}

describe.skipIf(!DB || !S3)('the 2027 calendar — 13 pages, one Prodigi item (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const orderIds: string[] = [];
  const assetIds: string[] = [];
  const keys: string[] = [];
  const prevStripeKey = process.env.STRIPE_SECRET_KEY;

  beforeAll(async () => {
    delete process.env.STRIPE_SECRET_KEY; // dev mark-paid fallback → PAID orders to claim
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
  });

  afterAll(async () => {
    if (orderIds.length) await db.delete(orders).where(inArray(orders.id, orderIds));
    if (assetIds.length) {
      const objs = await db.select().from(storageObjects).where(inArray(storageObjects.assetId, assetIds));
      for (const o of objs) await deleteObject(o.key).catch(() => {});
    }
    for (const k of keys) await deleteObject(k).catch(() => {});
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
    if (prevStripeKey !== undefined) process.env.STRIPE_SECRET_KEY = prevStripeKey;
  });

  async function drawing(w = 3000, h = 2200, shade = 90) {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const ing = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(w, h, shade), keptInHome: true });
    await db.update(assets).set({ isBrandSafeFixture: true }).where(eq(assets.id, ing.assetId)); // brand-safe test art (G11)
    keys.push(ing.key);
    assetIds.push(ing.assetId);
    return ing.assetId;
  }

  async function order(productKey: string, pages: Array<{ assetId: string; transform: typeof T } | null>, qty = 1) {
    const res = await placeOrder(db, { items: [{ productKey, qty, pages }], account: { id: ids.samId }, joinProvenance: null });
    if (res.ok) {
      const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.ref, res.ref!));
      orderIds.push(o!.id);
      return { res, orderId: o!.id };
    }
    return { res, orderId: null };
  }

  it('seeds the DATED SKUs with all 13 print areas to fill', async () => {
    const rows = await db
      .select({ sku: productVariants.sku, providerSku: productVariantProviders.providerSku, cfg: productVariantProviders.providerConfig, price: productVariants.pricePence })
      .from(productVariants)
      .innerJoin(productVariantProviders, eq(productVariantProviders.variantId, productVariants.id))
      .where(inArray(productVariants.sku, ['calendar', 'calendar-a4']));
    expect(rows.map((r) => [r.sku, r.providerSku, r.price]).sort()).toEqual([
      ['calendar', 'CALENDAR-A5-L-DATED', 2200],
      ['calendar-a4', 'CALENDAR-A4-L-DATED', 2400],
    ]);
    for (const r of rows) expect((r.cfg as { printTo: string[] }).printTo).toEqual([...CALENDAR_PAGES]);
  });

  it('ONE drawing makes a whole calendar: 13 pages frozen, priced server-side, sent as ONE item with 13 assets', async () => {
    const a = await drawing();
    const { res, orderId } = await order('calendar-a4', [{ assetId: a, transform: T }], 2);
    expect(res.ok).toBe(true);

    const [line] = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId!));
    expect([line!.qty, line!.unitPricePence, line!.linePence]).toEqual([2, 2400, 4800]); // the SERVER's price
    const pages = await db.select().from(orderItemArtwork).where(eq(orderItemArtwork.orderItemId, line!.id));
    expect(pages.map((p) => p.printArea).sort()).toEqual([...CALENDAR_PAGES].sort());
    expect(pages.every((p) => p.assetId === a)).toBe(true);

    const f = await processFulfilment(db, { env: SANDBOX, onlyOrderIds: [orderId!] });
    expect(f.ready).toBe(13);
    const rendered = await db.select().from(orderItemArtwork).where(eq(orderItemArtwork.orderItemId, line!.id));
    expect(new Set(rendered.map((p) => p.printObjectId)).size).toBe(1); // rendered once, reused by its twins

    const transport = fakeTransport();
    const s = await submitReadyOrders(db, { env: SANDBOX, transport, onlyOrderIds: [orderId!] });
    expect(s.submitted).toBe(1);
    const req = transport.created[0]!;
    expect(req.items).toHaveLength(1);
    const item = req.items[0]!;
    expect(item.sku).toBe('CALENDAR-A4-L-DATED');
    expect(item.copies).toBe(2);
    expect(item.assets.map((x) => x.printArea)).toEqual([...CALENDAR_PAGES]);
    expect(item.assets).toHaveLength(13);
  });

  it('different drawings → a DIFFERENT file per page, each to its own area', async () => {
    const cover = await drawing(3000, 2200, 40);
    const jan = await drawing(3000, 2200, 140);
    const { res, orderId } = await order('calendar', [{ assetId: cover, transform: T }, { assetId: jan, transform: T }]);
    expect(res.ok).toBe(true);
    await processFulfilment(db, { env: SANDBOX, onlyOrderIds: [orderId!] });
    const transport = fakeTransport();
    await submitReadyOrders(db, { env: SANDBOX, transport, onlyOrderIds: [orderId!] });
    const item = transport.created[0]!.items[0]!;
    expect(item.sku).toBe('CALENDAR-A5-L-DATED');
    const url = (area: string) => item.assets.find((x) => x.printArea === area)!.url;
    expect(url('cover')).not.toBe(url('january'));
    expect(url('february')).toBe(url('cover')); // the gaps repeat: cover, january, cover, january…
    expect(url('march')).toBe(url('january'));
    expect(new Set(item.assets.map((x) => x.url)).size).toBe(2);
  });

  it('the DPI gate runs per page: one too-small drawing on any page refuses the order before money moves', async () => {
    const good = await drawing();
    const tiny = await drawing(160, 120);
    const pages = Array.from({ length: 13 }, (_, i) => ({ assetId: i === 6 ? tiny : good, transform: T }));
    const { res, orderId } = await order('calendar-a4', pages);
    expect(res).toMatchObject({ ok: false, reason: 'too-small', productKey: 'calendar-a4' });
    expect(orderId).toBeNull();
  });

  it('a page whose drawing the buyer may not see is refused (authz on every page)', async () => {
    const mine = await drawing();
    // a keepsake from ANOTHER family
    const other = await resolveViewerContext(db, ids.blakeId, ids.bloomId);
    const ing = await ingestOriginalAsset(db, other, { familyId: ids.bloomId, kind: 'DRAWING', buffer: await png(3000, 2200, 200), keptInHome: true });
    keys.push(ing.key);
    assetIds.push(ing.assetId);
    await expect(order('calendar', [{ assetId: mine, transform: T }, { assetId: ing.assetId, transform: T }])).rejects.toThrow();
  });
});
