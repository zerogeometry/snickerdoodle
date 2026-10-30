import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { orderItemArtwork, orderItems, orders, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { definedPrintSpecs, seedCatalogue } from '@/server/catalogue';
import { placeOrder } from '@/server/orders';
import { processFulfilment } from '@/fulfillment/worker';
import { submitReadyOrders } from '@/fulfillment/submit';
import { CALENDAR_PAGES } from '@/lib/calendar';
import type { CreateOrderRequest, ProdigiOrderTransport } from '@/server/prodigi/orders';
import { deleteObject } from '@/storage';
import type { GateEnv } from '@/fulfillment/gate';
import type { DbHandle } from '@/server/db';

/**
 * TEST SWEEP 03 (29 Oct 2026) — the Prodigi ORDER the app builds, end to end on a local DB + MinIO:
 * placeOrder → the render worker → submitReadyOrders, into a FAKE transport that records the payload
 * (nothing leaves the machine). Brand-safe synthetic art only (flagged isBrandSafeFixture, as the
 * other fulfilment suites do), SANDBOX gate env.
 */
const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const SANDBOX: GateEnv = { podMode: 'SANDBOX', lg3SignedOff: false };
const art = (rgb: [number, number, number], w = 3000, h = 3000) => sharp({ create: { width: w, height: h, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }).png().toBuffer();

function fakeTransport() {
  const created: CreateOrderRequest[] = [];
  const t: ProdigiOrderTransport & { created: CreateOrderRequest[] } = {
    created,
    async createOrder(req) {
      created.push(req);
      return { outcome: 'created', order: { id: `ord_sweep03_${created.length}`, status: { stage: 'InProgress' } } };
    },
    async getOrder(id) {
      return { id, status: { stage: 'InProgress' } };
    },
  };
  return t;
}

const specBySku = new Map(definedPrintSpecs().map((s) => [s.sku, s]));
/** the object key a presigned provider-ingest URL points at */
const keyOfUrl = (u: string) => decodeURIComponent(new URL(u).pathname).replace(/^\/[^/]+\//, '');

describe.skipIf(!DB || !S3)('sweep 03 — the Prodigi order payload (integration, fake transport)', () => {
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
  }, 120_000);

  afterAll(async () => {
    if (orderIds.length) await db.delete(orders).where(inArray(orders.id, orderIds));
    if (assetIds.length) {
      const objs = await db.select().from(storageObjects).where(inArray(storageObjects.assetId, assetIds));
      for (const o of objs) await deleteObject(o.key).catch(() => {});
    }
    for (const k of keys) await deleteObject(k).catch(() => {});
    if (ids) await cleanupDemoFamilies(db, ids);
    await client?.end();
    if (prevStripeKey !== undefined) process.env.STRIPE_SECRET_KEY = prevStripeKey;
  });

  async function drawing(rgb: [number, number, number], w?: number, h?: number) {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const ing = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await art(rgb, w, h), keptInHome: true });
    await db.update(schema.assets).set({ isBrandSafeFixture: true }).where(eq(schema.assets.id, ing.assetId));
    keys.push(ing.key);
    assetIds.push(ing.assetId);
    return ing.assetId;
  }

  async function placeAndSubmit(items: Parameters<typeof placeOrder>[1]['items']) {
    const res = await placeOrder(db, { items, account: { id: ids.samId }, joinProvenance: null });
    expect(res.ok, JSON.stringify(res)).toBe(true);
    const [o] = await db.select({ id: orders.id, ref: orders.ref }).from(orders).where(eq(orders.ref, res.ref!));
    orderIds.push(o!.id);
    // render every line (the worker takes 50 artwork rows a tick)
    for (let i = 0; i < 4; i++) await processFulfilment(db, { env: SANDBOX, onlyOrderIds: [o!.id] });
    const transport = fakeTransport();
    const sum = await submitReadyOrders(db, { env: SANDBOX, transport, onlyOrderIds: [o!.id] });
    expect(sum.submitted, JSON.stringify(sum.orders)).toBe(1);
    const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, o!.id));
    return { payload: transport.created[0]!, lines, orderId: o!.id };
  }

  it('a mixed order: every item has its SKU, copies, fillPrintArea, attributes and one asset per print area', async () => {
    const a = await drawing([200, 80, 60]);
    const b = await drawing([60, 140, 200], 2400, 3200);
    const fit = { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 };
    const { payload, lines } = await placeAndSubmit([
      { productKey: 'christmasBundle-for4', qty: 1, bundle: { placemat: { assetId: a }, coaster: { assetId: b }, ornaments: [{ assetId: a }, { assetId: b }, { assetId: b }] } },
      { productKey: 'calendar', qty: 1, pages: [{ assetId: a, transform: fit }, { assetId: b, transform: fit }] },
      { productKey: 'jigsaw-30pieces', qty: 1, artwork: { assetId: b, transform: fit } },
      { productKey: 'kidsTee', qty: 2, artwork: { assetId: a, transform: fit } },
      { productKey: 'cushion-22square-double', qty: 1, artwork: { assetId: a, transform: fit, back: 'both' } },
    ]);

    expect(payload.shippingMethod).toBe('Standard');
    expect(payload.idempotencyKey).toBeTruthy();
    expect(payload.recipient.address.countryCode).toBe('GB');
    for (const item of payload.items) {
      expect(item.sizing).toBe('fillPrintArea');
      expect(item.assets.length).toBeGreaterThan(0);
      for (const as of item.assets) expect(as.url).toMatch(/^https?:\/\//);
    }
    const byRef = new Map(payload.items.map((i) => [i.merchantReference, i]));
    expect(byRef.size).toBe(lines.length);
    for (const l of lines) {
      const item = byRef.get(l.id)!;
      const spec = specBySku.get(l.productKey) ?? [...specBySku.values()].find((s) => s.sku === (l.spec as { sku: string }).sku)!;
      expect(item.sku, l.productKey).toBe(spec.prodigiSku);
      expect(item.copies, l.productKey).toBe(l.qty);
      expect(item.attributes ?? null, l.productKey).toEqual(spec.prodigiAttrs);
      expect(item.assets.map((x) => x.printArea), l.productKey).toEqual(spec.printTo);
    }

    // the CHRISTMAS BUNDLE for 4: one 4-pack of placemats, one of coasters, four ornaments (grouped by
    // drawing) — each its own Prodigi line — and the lines add up to its £145 to the penny
    const bundle = lines.filter((l) => ['placemat', 'coaster-packof4', 'ceramicOrnament'].includes(l.productKey));
    const skuOf = (k: string) => payload.items.filter((i) => bundle.some((l) => l.id === i.merchantReference && l.productKey === k));
    expect(skuOf('placemat').map((i) => [i.sku, i.copies])).toEqual([['H-PLACE-4PK', 1]]);
    expect(skuOf('coaster-packof4').map((i) => [i.sku, i.copies])).toEqual([['H-COAST-4PK', 1]]);
    expect(skuOf('ceramicOrnament').every((i) => i.sku === 'XMAS-PORC-BAUB')).toBe(true);
    expect(skuOf('ceramicOrnament').reduce((n, i) => n + i.copies, 0)).toBe(4);
    expect(bundle.reduce((n, l) => n + l.linePence, 0)).toBe(14500);
    // the coasters carry the coaster drawing (b), the placemats the placemat drawing (a)
    const artOf = async (productKey: string) => {
      const l = bundle.find((x) => x.productKey === productKey)!;
      return (await db.select({ assetId: orderItemArtwork.assetId }).from(orderItemArtwork).where(eq(orderItemArtwork.orderItemId, l.id)))[0]!.assetId;
    };
    expect(await artOf('placemat')).toBe(a);
    expect(await artOf('coaster-packof4')).toBe(b);

    // the CALENDAR: one item, 13 assets — the cover + every month, each its own area
    const cal = payload.items.find((i) => i.sku.startsWith('CALENDAR-'))!;
    expect(cal.assets.map((x) => x.printArea)).toEqual([...CALENDAR_PAGES]);
    // the JIGSAW: the same file on the board and the tin lid
    const jig = payload.items.find((i) => i.sku.startsWith('JIGSAW-'))!;
    expect(jig.assets.map((x) => x.printArea)).toEqual(['jigsaw', 'lid']);
    expect(jig.assets[0]!.url).toBe(jig.assets[1]!.url);
    // the TEE: 'front' only, size + colour as Prodigi's attributes
    const tee = payload.items.find((i) => i.sku === 'TEE-SS-STTK909')!;
    expect(tee.assets.map((x) => x.printArea)).toEqual(['front']);
    expect(tee.copies).toBe(2);
  }, 900_000);

  it('a phone case sends the whole order Express (its tracked service); a bundle alone goes Standard', async () => {
    const a = await drawing([90, 160, 90]);
    const fill = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 };
    const withCase = await placeAndSubmit([
      { productKey: 'phoneCase', qty: 1, artwork: { assetId: a, transform: fill } },
      { productKey: 'mug', qty: 1, artwork: { assetId: a, transform: fill } },
    ]);
    expect(withCase.payload.shippingMethod).toBe('Express');
    const bundleOnly = await placeAndSubmit([{ productKey: 'christmasBundle', qty: 1, bundle: { placemat: { assetId: a } } }]);
    expect(bundleOnly.payload.shippingMethod).toBe('Standard');
    expect(bundleOnly.payload.items.map((i) => [i.sku, i.copies]).sort()).toEqual([['H-COAST-2PK', 1], ['H-PLACE-2PK', 1], ['XMAS-PORC-BAUB', 2]]);
    expect(bundleOnly.lines.reduce((n, l) => n + l.linePence, 0)).toBe(7800);
  }, 900_000);

  it('a card pack of 5: one Prodigi card line per design, copies = how many, blank inside, lines add up to the pack', async () => {
    const a = await drawing([200, 60, 120], 2000, 2800);
    const b = await drawing([60, 200, 120], 2000, 2800);
    const tf = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 };
    const { payload, lines } = await placeAndSubmit([
      { productKey: 'cardPack', qty: 1, cards: [{ assetId: a, transform: tf }, { assetId: a, transform: tf }, { assetId: b, transform: tf }, { assetId: b, transform: tf }, { assetId: b, transform: tf }] },
    ]);
    expect(payload.items.map((i) => [i.sku, i.copies, i.assets.map((x) => x.printArea).join()]).sort()).toEqual([
      ['CLASSIC-GRE-FEDR-7X5-BLA', 2, 'default'],
      ['CLASSIC-GRE-FEDR-7X5-BLA', 3, 'default'],
    ]);
    expect(lines.reduce((n, l) => n + l.linePence, 0)).toBe(1200);
    const msgs = await db.select({ message: orderItemArtwork.message }).from(orderItemArtwork).where(inArray(orderItemArtwork.orderItemId, lines.map((l) => l.id)));
    expect(msgs.every((m) => m.message === null)).toBe(true);
  }, 900_000);

  // BUG 03-B1 (P1, wrong print): the print file's storage key is drawing + variant only
  // (render.ts persistPrintFile: `printfile-${variantId}${ground}`) — NOT the placement, the Studio
  // design / cutout, the cushion back or the card message. Two lines of one drawing on one variant
  // that differ in any of those render to the SAME object; the second render overwrites the first,
  // and both Prodigi items are sent the one URL. `it.fails`: passes while the bug is there — when
  // it's fixed this flips, so turn it into a plain `it`.
  it.fails('03-B1: two lines, same drawing + variant, different placement → two different print files', async () => {
    const a = await drawing([220, 120, 40], 3000, 2000);
    const { payload } = await placeAndSubmit([
      { productKey: 'framedPrint', qty: 1, artwork: { assetId: a, transform: { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 } } },
      { productKey: 'framedPrint', qty: 1, artwork: { assetId: a, transform: { scale: 2, offsetX: 1, offsetY: 0, rotationDeg: 90 } } },
    ]);
    const [k1, k2] = payload.items.map((i) => keyOfUrl(i.assets[0]!.url));
    expect(k1).not.toBe(k2);
  }, 900_000);

  it.fails('03-B1: two greetings cards of one drawing with different inside messages → two different print files', async () => {
    const a = await drawing([40, 120, 220], 2000, 2800);
    const tf = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 };
    const { payload } = await placeAndSubmit([
      { productKey: 'card', qty: 1, artwork: { assetId: a, transform: tf, message: { greeting: 'dear gran', message: 'happy christmas', signature: 'love sam' } } },
      { productKey: 'card', qty: 1, artwork: { assetId: a, transform: tf, message: { greeting: 'dear grandad', message: 'merry christmas', signature: 'love sam' } } },
    ]);
    const [k1, k2] = payload.items.map((i) => keyOfUrl(i.assets[0]!.url));
    expect(k1).not.toBe(k2);
  }, 900_000);
});
