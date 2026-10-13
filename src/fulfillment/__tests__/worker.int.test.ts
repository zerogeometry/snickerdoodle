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
import { deleteObject } from '@/storage';
import type { GateEnv } from '@/fulfillment/gate';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const SANDBOX: GateEnv = { podMode: 'SANDBOX', lg3SignedOff: false };
const src = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 120, b: 60 } } }).png().toBuffer();

describe.skipIf(!DB || !S3)('fulfilment worker — claim → render → gate (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const orderIds: string[] = [];
  const assetIds: string[] = [];
  const keys: string[] = [];
  // The dev "mark-paid" fallback pays orders inline so the worker has PAID work to claim,
  // with no real Stripe call (a key in .env would otherwise divert to Checkout → PENDING).
  const prevStripeKey = process.env.STRIPE_SECRET_KEY;

  beforeAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
  });

  afterAll(async () => {
    if (orderIds.length) await db.delete(orders).where(inArray(orders.id, orderIds)); // cascades items + artwork
    if (assetIds.length) {
      const objs = await db.select().from(storageObjects).where(inArray(storageObjects.assetId, assetIds));
      for (const o of objs) await deleteObject(o.key).catch(() => {});
    }
    for (const k of keys) await deleteObject(k).catch(() => {});
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
    if (prevStripeKey !== undefined) process.env.STRIPE_SECRET_KEY = prevStripeKey;
  });

  async function paidOrder(kind: 'DRAWING' | 'PHOTO') {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const ing = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind, buffer: await src(3000, 4200), keptInHome: true });
    // Test art: under G11 only an explicitly brand-safe fixture may reach the POD sandbox;
    // these suites use DRAWING = brand-safe test art and PHOTO = a child's image.
    if (kind === 'DRAWING') await db.update(schema.assets).set({ isBrandSafeFixture: true }).where(eq(schema.assets.id, ing.assetId));
    keys.push(ing.key);
    assetIds.push(ing.assetId);
    const res = await placeOrder(db, {
      items: [{ productKey: 'framedPrint', qty: 1, artwork: { assetId: ing.assetId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } } }],
      account: { id: ids.samId },
      joinProvenance: null,
    });
    const [o] = await db.select({ id: orders.id, status: orders.status }).from(orders).where(eq(orders.ref, res.ref!));
    orderIds.push(o!.id);
    return o!.id;
  }

  async function artworkOf(orderId: string) {
    const [oi] = await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, orderId));
    const [a] = await db.select().from(orderItemArtwork).where(eq(orderItemArtwork.orderItemId, oi!.id));
    return a!;
  }

  it('renders a non-child drawing in-VPC and clears the gate → READY (idempotent re-run)', async () => {
    const orderId = await paidOrder('DRAWING');
    const summary = await processFulfilment(db, { env: SANDBOX });
    expect(summary.ready).toBeGreaterThanOrEqual(1);

    const a = await artworkOf(orderId);
    expect(a.status).toBe('READY');
    expect(a.printObjectId).not.toBeNull(); // a real print file was rendered
    expect(a.renderedDpi).toBe(300);

    // A second tick must NOT re-claim a READY item (the claim only takes PENDING).
    const again = await processFulfilment(db, { env: SANDBOX });
    expect(again.items.some((i) => i.artworkId === a.id)).toBe(false);
    expect((await artworkOf(orderId)).status).toBe('READY');
  });

  it('renders a child image but the GATE refuses egress (sandbox) → BLOCKED_GATE', async () => {
    const orderId = await paidOrder('PHOTO'); // a PHOTO is treated as a child image (conservative)
    const summary = await processFulfilment(db, { env: SANDBOX });
    expect(summary.blocked).toBeGreaterThanOrEqual(1);

    const a = await artworkOf(orderId);
    expect(a.status).toBe('BLOCKED_GATE');
    expect(a.printObjectId).not.toBeNull(); // rendered locally — but egress was blocked, not the render
  });

  it('does not claim an UNPAID order’s artwork', async () => {
    const orderId = await paidOrder('DRAWING');
    await db.update(orders).set({ status: 'PENDING' }).where(eq(orders.id, orderId)); // unpay it
    const before = await artworkOf(orderId);

    const summary = await processFulfilment(db, { env: SANDBOX });
    expect(summary.items.some((i) => i.artworkId === before.id)).toBe(false);
    expect((await artworkOf(orderId)).status).toBe('PENDING'); // untouched
  });
});
