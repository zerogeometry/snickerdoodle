import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { assets, orderItemArtwork, orderItems, orders, productVariantProviders, productVariants, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError } from '@/authz';
import { deleteAsset, keepsakesNeededByOrders, KeepsakeInUseError, resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { seedCatalogue } from '@/server/catalogue';
import { placeOrder } from '@/server/orders';
import { processFulfilment } from '@/fulfillment/worker';
import { submitReadyOrders, syncSubmittedOrders } from '@/fulfillment/submit';
import { frameGridKey } from '@/fulfillment/frameGridKey';
import { FRAME_GRIDS, frameGridOf, frameSlotRects, prodigiPx, type FrameGrid } from '@/lib/multi-photo-frame';
import type { CreateOrderRequest, ProdigiOrderTransport } from '@/server/prodigi/orders';
import { deleteObject, getObjectBytes } from '@/storage';
import type { GateEnv } from '@/fulfillment/gate';
import type { DbHandle } from '@/server/db';

// The multi photo frame, end to end: basket squares → placeOrder (server price, an artwork row per
// square, every square through authz + moderation + the DPI gate) → the worker renders each square's
// tile → submit composes ONE print file at Prodigi's exact px → ONE Prodigi item, 'default' area.
const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const SANDBOX: GateEnv = { podMode: 'SANDBOX', lg3SignedOff: false };
const T = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 };
const png = (w: number, h: number, r: number) => sharp({ create: { width: w, height: h, channels: 3, background: { r, g: 160, b: 200 } } }).png().toBuffer();

function fakeTransport(stage: 'InProgress' | 'Complete' = 'InProgress') {
  const created: CreateOrderRequest[] = [];
  const transport: ProdigiOrderTransport & { created: CreateOrderRequest[] } = {
    created,
    async createOrder(req) {
      created.push(req);
      return { outcome: 'created', order: { id: `ord_mpf_${created.length}_${Date.now()}`, status: { stage: 'InProgress' } } };
    },
    async getOrder(id) {
      return { id, status: { stage }, shipments: [] };
    },
  };
  return transport;
}

/** The red channel at the centre of every square of a composed frame file (read the way it hangs). */
async function squareShades(file: Buffer, grid: FrameGrid): Promise<number[]> {
  const { data, info } = await (grid.turned ? sharp(file).rotate(-90) : sharp(file)).raw().toBuffer({ resolveWithObject: true });
  return frameSlotRects(grid).map((r) => data[(Math.round(r.y + r.size / 2) * info.width + Math.round(r.x + r.size / 2)) * info.channels]!);
}

describe.skipIf(!DB || !S3)('the multi photo frame — a drawing per square, ONE print file (integration)', () => {
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
    if (orderIds.length) {
      const lines = await db.select({ id: orderItems.id, orderId: orderItems.orderId }).from(orderItems).where(inArray(orderItems.orderId, orderIds));
      for (const l of lines) await deleteObject(frameGridKey(l.orderId, l.id)).catch(() => {});
      await db.delete(orders).where(inArray(orders.id, orderIds));
    }
    if (assetIds.length) {
      const objs = await db.select().from(storageObjects).where(inArray(storageObjects.assetId, assetIds));
      for (const o of objs) await deleteObject(o.key).catch(() => {});
    }
    for (const k of keys) await deleteObject(k).catch(() => {});
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
    if (prevStripeKey !== undefined) process.env.STRIPE_SECRET_KEY = prevStripeKey;
  });

  async function drawing(shade = 90, w = 1600, h = 1200) {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const ing = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(w, h, shade), keptInHome: true });
    await db.update(assets).set({ isBrandSafeFixture: true }).where(eq(assets.id, ing.assetId)); // brand-safe test art (G11)
    keys.push(ing.key);
    assetIds.push(ing.assetId);
    return ing.assetId;
  }

  async function sku(size: string, colour: string, orientation?: string) {
    const rows = await db.select({ sku: productVariants.sku, attrs: productVariants.attributes }).from(productVariants);
    const a = (r: (typeof rows)[number]) => r.attrs as Record<string, string>;
    return rows.find((r) => r.sku.startsWith('multiPhotoFrame') && a(r).size === size && a(r).colour === colour && a(r).orientation === orientation)!.sku;
  }

  async function order(productKey: string, slots: Array<{ assetId: string; transform: typeof T } | null>, qty = 1) {
    const res = await placeOrder(db, { items: [{ productKey, qty, slots }], account: { id: ids.samId }, joinProvenance: null });
    if (res.ok) {
      const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.ref, res.ref!));
      orderIds.push(o!.id);
      return { res, orderId: o!.id };
    }
    return { res, orderId: null };
  }

  it('seeds every Prodigi SKU, size × way up × colour, the frame colour as Prodigi’s `color` attribute, one print area to fill', async () => {
    const rows = await db
      .select({ sku: productVariants.sku, attrs: productVariants.attributes, providerSku: productVariantProviders.providerSku, cfg: productVariantProviders.providerConfig, price: productVariants.pricePence })
      .from(productVariants)
      .innerJoin(productVariantProviders, eq(productVariantProviders.variantId, productVariants.id));
    const frames = rows.filter((r) => r.sku === 'multiPhotoFrame' || r.sku.startsWith('multiPhotoFrame-'));
    expect(frames).toHaveLength(48);
    const PRICE: Record<string, number> = { '12×12″': 6200, '16×16″': 8000, '16×24″': 8700, '20×30″': 10200 };
    for (const r of frames) {
      const a = r.attrs as Record<string, string>;
      expect(r.providerSku).toBe(frameGridOf(a.size, a.orientation)!.sku);
      expect(r.price).toBe(PRICE[a.size!]);
      expect((r.cfg as { prodigiAttrs: Record<string, string> }).prodigiAttrs).toEqual({ color: a.colour });
      expect((r.cfg as { printTo?: string[] }).printTo ?? ['default']).toEqual(['default']);
    }
  });

  it('ONE drawing makes a whole frame: 9 squares frozen, priced server-side, rendered once, ONE file of 3543 px with it in every square', async () => {
    const a = await drawing(60);
    const key = await sku('12×12″', 'black');
    const { res, orderId } = await order(key, [{ assetId: a, transform: T }], 2);
    expect(res.ok).toBe(true);

    const [line] = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId!));
    expect([line!.qty, line!.unitPricePence, line!.linePence]).toEqual([2, 6200, 12400]); // the SERVER's price
    const rows = await db.select().from(orderItemArtwork).where(eq(orderItemArtwork.orderItemId, line!.id));
    expect(rows.map((p) => p.printArea).sort()).toEqual(Array.from({ length: 9 }, (_, i) => `slot-${i + 1}`).sort());
    expect(rows.every((p) => p.assetId === a)).toBe(true);

    const f = await processFulfilment(db, { env: SANDBOX, onlyOrderIds: [orderId!] });
    expect(f.ready).toBe(9);
    const rendered = await db.select().from(orderItemArtwork).where(eq(orderItemArtwork.orderItemId, line!.id));
    expect(new Set(rendered.map((p) => p.printObjectId)).size).toBe(1); // one tile, reused by its twins

    const transport = fakeTransport();
    const s = await submitReadyOrders(db, { env: SANDBOX, transport, onlyOrderIds: [orderId!] });
    expect(s.submitted).toBe(1);
    const item = transport.created[0]!.items[0]!;
    expect(transport.created[0]!.items).toHaveLength(1);
    expect([item.sku, item.copies, item.attributes]).toEqual(['GLOBAL-MPF-12X12', 2, { color: 'black' }]);
    expect(item.assets.map((x) => x.printArea)).toEqual(['default']);

    const file = await getObjectBytes(frameGridKey(orderId!, line!.id));
    const meta = await sharp(file).metadata();
    expect([meta.width, meta.height]).toEqual([3543, 3543]);
    expect((await squareShades(file, frameGridOf('12×12″')!)).every((r) => Math.abs(r - 60) <= 3)).toBe(true);
  });

  it('a drawing per square: every one is on the order, each lands in ITS square, the empties repeat the main one', async () => {
    const main = await drawing(30);
    const second = await drawing(130);
    const third = await drawing(220);
    const key = await sku('16×16″', 'gold');
    const slots = [{ assetId: main, transform: T }, { assetId: second, transform: T }, null, null, { assetId: third, transform: T }];
    const { res, orderId } = await order(key, slots);
    expect(res.ok).toBe(true);
    const [line] = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId!));
    const rows = await db.select().from(orderItemArtwork).where(eq(orderItemArtwork.orderItemId, line!.id));
    expect(rows).toHaveLength(16);
    const bySquare = new Map(rows.map((r) => [r.printArea, r.assetId]));
    expect([bySquare.get('slot-1'), bySquare.get('slot-2'), bySquare.get('slot-3'), bySquare.get('slot-5'), bySquare.get('slot-16')]).toEqual([main, second, main, third, main]);
    // every drawing in the frame belongs to this order — retention, deletion + the moderation hold see each
    expect(await keepsakesNeededByOrders(db, [main, second, third])).toEqual(new Set([main, second, third]));
    // …so the parent can't delete one while the frame is paid but not made (it would print with a hole)
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    await expect(deleteAsset(db, second, sam)).rejects.toBeInstanceOf(KeepsakeInUseError);

    await processFulfilment(db, { env: SANDBOX, onlyOrderIds: [orderId!] });
    const transport = fakeTransport('Complete');
    expect((await submitReadyOrders(db, { env: SANDBOX, transport, onlyOrderIds: [orderId!] })).submitted).toBe(1);
    const item = transport.created[0]!.items[0]!;
    expect([item.sku, item.attributes]).toEqual(['GLOBAL-MPFM-16X16', { color: 'gold' }]);
    const file = await getObjectBytes(frameGridKey(orderId!, line!.id));
    const meta = await sharp(file).metadata();
    expect([meta.width, meta.height]).toEqual([4724, 4724]);
    const shades = await squareShades(file, frameGridOf('16×16″')!);
    const want = [30, 130, 30, 30, 220, ...Array.from({ length: 11 }, () => 30)];
    shades.forEach((r, i) => expect(Math.abs(r - want[i]!), `square ${i + 1}`).toBeLessThanOrEqual(3));

    // shipped → the composed file (every drawing at once) is deleted, and the retention clock starts for
    // EVERY square's drawing that isn't kept (the second and third were never kept in the home)
    await db.update(assets).set({ keptInHome: false }).where(inArray(assets.id, [second, third]));
    const sync = await syncSubmittedOrders(db, { transport, onlyOrderIds: [orderId!] });
    expect(sync.shipped).toBe(1);
    await expect(getObjectBytes(frameGridKey(orderId!, line!.id))).rejects.toThrow();
    const after = new Map((await db.select({ id: assets.id, purgeAfter: assets.purgeAfter }).from(assets).where(inArray(assets.id, [main, second, third]))).map((a) => [a.id, a.purgeAfter]));
    expect(after.get(second)).toBeInstanceOf(Date);
    expect(after.get(third)).toBeInstanceOf(Date);
    expect(after.get(main)).toBeNull(); // kept in the home: the clock never touches it
  });

  it('a 20×30″ hung landscape: 40 squares, ONE file turned to Prodigi’s portrait 5905×8858, every square where it hangs', async () => {
    const main = await drawing(40);
    const other = await drawing(200);
    const key = await sku('20×30″', 'white', 'landscape');
    const slots = Array.from({ length: 40 }, (_, i) => (i === 0 ? { assetId: main, transform: T } : i === 9 ? { assetId: other, transform: T } : null));
    const { res, orderId } = await order(key, slots);
    expect(res.ok).toBe(true);
    const [line] = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId!));
    expect(line!.unitPricePence).toBe(10200);
    expect(await db.select().from(orderItemArtwork).where(eq(orderItemArtwork.orderItemId, line!.id))).toHaveLength(40);
    const f = await processFulfilment(db, { env: SANDBOX, onlyOrderIds: [orderId!], limit: 60 });
    expect(f.ready).toBe(40);
    const transport = fakeTransport();
    expect((await submitReadyOrders(db, { env: SANDBOX, transport, onlyOrderIds: [orderId!] })).submitted).toBe(1);
    const item = transport.created[0]!.items[0]!;
    expect([item.sku, item.attributes, item.assets.map((x) => x.printArea)]).toEqual(['GLOBAL-MPF-20X30', { color: 'white' }, ['default']]);
    const file = await getObjectBytes(frameGridKey(orderId!, line!.id));
    const meta = await sharp(file).metadata();
    const grid = FRAME_GRIDS.find((g) => g.size === '20×30″' && g.orientation === 'landscape')!;
    expect([meta.width, meta.height]).toEqual([prodigiPx(grid).w, prodigiPx(grid).h]); // 5905 × 8858
    const shades = await squareShades(file, grid);
    // square 10 = the second row's second square (8 across) holds its own drawing; the rest the main one
    shades.forEach((r, i) => expect(Math.abs(r - (i === 9 ? 200 : 40)), `square ${i + 1}`).toBeLessThanOrEqual(3));
  }, 180_000);

  it('a square holding a STRANGER’s keepsake is refused — authz on every square', async () => {
    const mine = await drawing();
    const other = await resolveViewerContext(db, ids.blakeId, ids.bloomId);
    const ing = await ingestOriginalAsset(db, other, { familyId: ids.bloomId, kind: 'DRAWING', buffer: await png(1600, 1200, 200), keptInHome: true });
    keys.push(ing.key);
    assetIds.push(ing.assetId);
    const key = await sku('12×12″', 'white');
    await expect(order(key, [{ assetId: mine, transform: T }, null, null, { assetId: ing.assetId, transform: T }])).rejects.toBeInstanceOf(AuthzError);
    // nothing was written for it
    const stray = await db.select({ id: orderItemArtwork.id }).from(orderItemArtwork).where(eq(orderItemArtwork.assetId, ing.assetId));
    expect(stray).toHaveLength(0);
  });

  it('the moderation hold covers every square: one square flagged after payment holds the whole frame, nothing is sent', async () => {
    const ok = await drawing(80);
    const later = await drawing(160);
    const key = await sku('12×12″', 'natural');
    const { res, orderId } = await order(key, [{ assetId: ok, transform: T }, { assetId: later, transform: T }]);
    expect(res.ok).toBe(true);
    await db.update(assets).set({ moderationStatus: 'FLAGGED' }).where(eq(assets.id, later)); // reported after payment
    await processFulfilment(db, { env: SANDBOX, onlyOrderIds: [orderId!] });
    const [line] = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId!));
    const held = await db.select().from(orderItemArtwork).where(and(eq(orderItemArtwork.orderItemId, line!.id), eq(orderItemArtwork.assetId, later)));
    expect(held.map((r) => r.status)).toEqual(['BLOCKED_GATE']);
    const transport = fakeTransport();
    const s = await submitReadyOrders(db, { env: SANDBOX, transport, onlyOrderIds: [orderId!] });
    expect(s.submitted).toBe(0);
    expect(transport.created).toHaveLength(0);
    await expect(getObjectBytes(frameGridKey(orderId!, line!.id))).rejects.toThrow(); // never composed
  });

  it('a square whose drawing isn’t cleared yet can’t be ordered at all', async () => {
    const ok = await drawing();
    const pending = await drawing(150);
    await db.update(assets).set({ moderationStatus: 'PENDING' }).where(eq(assets.id, pending));
    const key = await sku('12×12″', 'brown');
    await expect(order(key, [{ assetId: ok, transform: T }, { assetId: pending, transform: T }])).rejects.toThrow(/not cleared/);
  });

  it('the DPI gate runs per square: a too-small drawing in any square refuses the order before money moves', async () => {
    const good = await drawing();
    const tiny = await drawing(100, 40, 30);
    const key = await sku('16×16″', 'silver');
    const slots = Array.from({ length: 16 }, (_, i) => ({ assetId: i === 11 ? tiny : good, transform: T }));
    const { res, orderId } = await order(key, slots);
    expect(res).toMatchObject({ ok: false, reason: 'too-small', productKey: key });
    expect(orderId).toBeNull();
  });

  it('a frame can’t be bought through a gift link (its squares are the parent’s own choice)', async () => {
    const a = await drawing();
    const key = await sku('12×12″', 'gold');
    await expect(
      placeOrder(db, {
        items: [{ productKey: key, qty: 1, slots: [{ assetId: a, transform: T }] }],
        account: null,
        joinProvenance: null,
        giftLink: { linkId: 'x', familyId: ids.hartleyId, assetIds: [a], expiresAt: null, revokedAt: null } as never,
      }),
    ).rejects.toThrow(/gift link/);
  });
});
