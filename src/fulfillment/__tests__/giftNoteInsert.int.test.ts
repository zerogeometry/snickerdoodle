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
import { seedCatalogue } from '@/server/catalogue';
import { placeOrder } from '@/server/orders';
import { processFulfilment } from '@/fulfillment/worker';
import { submitReadyOrders, syncSubmittedOrders } from '@/fulfillment/submit';
import { giftNoteInsertKey } from '@/fulfillment/giftNoteInsert';
import { ProdigiError } from '@/server/prodigi/client';
import type { CreateOrderRequest, InsertQuoteRequest, InsertQuoteShipment, ProdigiOrderTransport } from '@/server/prodigi/orders';
import { deleteObject, getObjectBytes } from '@/storage';
import type { GateEnv } from '@/fulfillment/gate';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const SANDBOX: GateEnv = { podMode: 'SANDBOX', lg3SignedOff: false };
const NOTE = 'happy christmas Nana, love from all of us';

/** A fake Prodigi: records every order + quote; can say which labs print inserts, or refuse branding. */
function fakeTransport(opts: { labs?: InsertQuoteShipment[]; refuseBranding?: boolean } = {}) {
  const created: CreateOrderRequest[] = [];
  const quoted: InsertQuoteRequest[] = [];
  const t: ProdigiOrderTransport & { created: CreateOrderRequest[]; quoted: InsertQuoteRequest[] } = {
    created,
    quoted,
    async createOrder(req) {
      created.push(req);
      if (opts.refuseBranding && req.branding) throw new ProdigiError('Prodigi createOrder failed: HTTP 400 outcome=ValidationFailed branding.postcard', 400);
      return { outcome: 'created', order: { id: `ord_fake_${created.length}`, status: { stage: 'InProgress' } } };
    },
    async getOrder(id) {
      return { id, status: { stage: 'Complete' }, shipments: [{ id: 'shp_1', carrier: { name: 'Royal Mail' }, tracking: { number: 'TRK1', url: null } }] };
    },
    async quoteInserts(req) {
      quoted.push(req);
      return opts.labs ?? [{ lab: 'prodigi_gb3', brandingItems: req.inserts }];
    },
  };
  return t;
}

describe.skipIf(!DB || !S3)('the printed gift-note insert through the real submitter (integration)', () => {
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
    for (const id of orderIds) await deleteObject(giftNoteInsertKey(id)).catch(() => {});
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

  /** A PAID gift order for a framed print (brand-safe test art), rendered and READY to submit. */
  async function readyGiftOrder(giftNote: string | undefined) {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const src = await sharp({ create: { width: 3000, height: 4200, channels: 3, background: { r: 90, g: 160, b: 200 } } }).png().toBuffer();
    const ing = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: src, keptInHome: true });
    await db.update(schema.assets).set({ isBrandSafeFixture: true }).where(eq(schema.assets.id, ing.assetId));
    keys.push(ing.key);
    assetIds.push(ing.assetId);
    const res = await placeOrder(db, {
      items: [{ productKey: 'framedPrint', qty: 1, artwork: { assetId: ing.assetId, transform: { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 } } }],
      account: { id: ids.samId },
      joinProvenance: null,
      gift: true,
      giftNote,
    });
    const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.ref, res.ref!));
    orderIds.push(o!.id);
    const t0 = Date.now();
    for (;;) {
      await processFulfilment(db, { env: SANDBOX, onlyOrderIds: [o!.id] });
      const [oi] = await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, o!.id));
      const [a] = await db.select().from(orderItemArtwork).where(eq(orderItemArtwork.orderItemId, oi!.id));
      if (a!.status === 'READY' && a!.printObjectId) break;
      if (a!.status === 'RENDER_FAILED') throw new Error(`render failed: ${a!.renderError}`);
      if (Date.now() - t0 > 20_000) throw new Error(`artwork not READY in time (${a!.status})`);
      await new Promise((r) => setTimeout(r, 150));
    }
    return o!.id;
  }

  const orderRow = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0]!;

  it('switch OFF (the default): the payload has NO branding, no quote, nothing recorded, no file', async () => {
    const orderId = await readyGiftOrder(NOTE);
    const t = fakeTransport();
    const s = await submitReadyOrders(db, { env: SANDBOX, transport: t, onlyOrderIds: [orderId], giftNoteSlot: null });
    expect(s.submitted).toBe(1);
    expect(t.created[0]!.branding).toBeUndefined();
    expect(t.quoted).toHaveLength(0);
    expect((await orderRow(orderId)).giftNoteInsert).toBeNull();
    await expect(getObjectBytes(giftNoteInsertKey(orderId))).rejects.toThrow();
  });

  it('switch ON: the note goes as branding.postcard (a real signed URL to the rendered card), recorded as sent; the file is deleted once it ships', async () => {
    const orderId = await readyGiftOrder(NOTE);
    const t = fakeTransport();
    const s = await submitReadyOrders(db, { env: SANDBOX, transport: t, onlyOrderIds: [orderId], giftNoteSlot: 'postcard' });
    expect(s.submitted).toBe(1);
    const payload = t.created[0]!;
    expect(Object.keys(payload.branding ?? {})).toEqual(['postcard']);
    expect(payload.branding!.postcard!.url).toMatch(/^https?:\/\/.*gift-note-insert\.png/);
    // the quote asked about the order's own lines + the insert by name, and nothing else
    expect(t.quoted).toEqual([{ shippingMethod: 'Standard', destinationCountryCode: 'GB', items: [{ sku: 'GLOBAL-CFP-11X14', copies: 1, attributes: expect.any(Object), printAreas: ['default'] }], inserts: ['postcard'] }]);
    // the note text travels only inside the image — never as text in the order
    expect(JSON.stringify(payload)).not.toContain('Nana');
    const png = await getObjectBytes(giftNoteInsertKey(orderId));
    expect((await sharp(png).metadata()).width).toBe(1240);
    const row = await orderRow(orderId);
    expect(row.giftNoteInsert).toMatchObject({ slot: 'postcard', status: 'sent', labs: [{ lab: 'prodigi_gb3', prints: true }] });
    expect(row.giftNote).toBe(NOTE); // still on the order for the receipt

    await syncSubmittedOrders(db, { transport: t, onlyOrderIds: [orderId] });
    expect((await orderRow(orderId)).status).toBe('SHIPPED');
    await expect(getObjectBytes(giftNoteInsertKey(orderId))).rejects.toThrow(); // its job is done
  });

  it('switch ON, the lab can’t print it: no branding, the order still goes, and why is recorded', async () => {
    const orderId = await readyGiftOrder(NOTE);
    const t = fakeTransport({ labs: [{ lab: 'uk9', brandingItems: [] }] });
    const s = await submitReadyOrders(db, { env: SANDBOX, transport: t, onlyOrderIds: [orderId], giftNoteSlot: 'postcard' });
    expect(s.submitted).toBe(1);
    expect(t.created[0]!.branding).toBeUndefined();
    expect((await orderRow(orderId)).giftNoteInsert).toMatchObject({ status: 'skipped', why: expect.stringContaining('uk9') });
    await expect(getObjectBytes(giftNoteInsertKey(orderId))).rejects.toThrow();
  });

  it('switch ON, Prodigi turns the order down WITH the insert: re-sent once without it — the parcel still goes', async () => {
    const orderId = await readyGiftOrder(NOTE);
    const t = fakeTransport({ refuseBranding: true });
    const s = await submitReadyOrders(db, { env: SANDBOX, transport: t, onlyOrderIds: [orderId], giftNoteSlot: 'postcard' });
    expect(s.submitted).toBe(1);
    expect(t.created).toHaveLength(2);
    expect(t.created[0]!.branding).toBeDefined();
    expect(t.created[1]!.branding).toBeUndefined();
    expect(t.created[1]!.idempotencyKey).toBe(orderId);
    const row = await orderRow(orderId);
    expect(row.prodigiOrderId).toBe('ord_fake_2');
    expect(row.giftNoteInsert).toMatchObject({ status: 'skipped', why: expect.stringMatching(/turned the order down/) });
    expect(JSON.stringify(row.giftNoteInsert)).not.toMatch(/https?:/);
    await expect(getObjectBytes(giftNoteInsertKey(orderId))).rejects.toThrow();
  });

  it('switch ON, a gift with no note: nothing sent, nothing recorded', async () => {
    const orderId = await readyGiftOrder(undefined);
    const t = fakeTransport();
    await submitReadyOrders(db, { env: SANDBOX, transport: t, onlyOrderIds: [orderId], giftNoteSlot: 'postcard' });
    expect(t.created[0]!.branding).toBeUndefined();
    expect(t.quoted).toHaveLength(0);
    expect((await orderRow(orderId)).giftNoteInsert).toBeNull();
  });
});
