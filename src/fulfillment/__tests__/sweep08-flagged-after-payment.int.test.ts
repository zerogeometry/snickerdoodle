import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { assets, orderItemArtwork, orderItems, orders, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { seedCatalogue } from '@/server/catalogue';
import { placeOrder } from '@/server/orders';
import { processFulfilment } from '@/fulfillment/worker';
import { deleteObject } from '@/storage';
import type { GateEnv } from '@/fulfillment/gate';
import type { DbHandle } from '@/server/db';

/**
 * Test sweep 2026-10-29 (tester 08) — content safety at the print step. Placing an order refuses
 * anything not CLEAR (orders.ts); this pins that, and records the gap after it: a keepsake that is
 * FLAGGED once the order is already paid (a viewer's report, a re-screen) is not re-checked by the
 * fulfilment worker or by the submit step (src/fulfillment/submit.ts re-asserts only the egress gate).
 */
const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const SANDBOX: GateEnv = { podMode: 'SANDBOX', lg3SignedOff: false };
const src = () => sharp({ create: { width: 3000, height: 4200, channels: 3, background: { r: 200, g: 120, b: 60 } } }).png().toBuffer();

describe.skipIf(!DB || !S3)('sweep 08 — a flagged keepsake and the print pipeline', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const orderIds: string[] = [];
  const assetIds: string[] = [];
  const prevStripeKey = process.env.STRIPE_SECRET_KEY;

  beforeAll(async () => {
    delete process.env.STRIPE_SECRET_KEY; // the dev mark-paid fallback: no Stripe call
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
  });
  afterAll(async () => {
    if (orderIds.length) await db.delete(orders).where(inArray(orders.id, orderIds));
    if (assetIds.length) {
      for (const o of await db.select().from(storageObjects).where(inArray(storageObjects.assetId, assetIds))) await deleteObject(o.key).catch(() => {});
    }
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
    if (prevStripeKey !== undefined) process.env.STRIPE_SECRET_KEY = prevStripeKey;
  });

  async function keepsake(status: 'CLEAR' | 'FLAGGED' | 'PENDING') {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const ing = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await src(), keptInHome: true });
    assetIds.push(ing.assetId);
    await db.update(assets).set({ moderationStatus: status, isBrandSafeFixture: true }).where(eq(assets.id, ing.assetId));
    return ing.assetId;
  }
  const order = (assetId: string) =>
    placeOrder(db, {
      items: [{ productKey: 'framedPrint', qty: 1, artwork: { assetId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } } }],
      account: { id: ids.samId },
      joinProvenance: null,
    });

  it('a FLAGGED or still-PENDING (unscreened) keepsake cannot be ordered at all', async () => {
    await expect(order(await keepsake('FLAGGED'))).rejects.toThrow(/not cleared for printing/);
    await expect(order(await keepsake('PENDING'))).rejects.toThrow(/not cleared for printing/);
  });

  // 08-B3: flagged AFTER payment (e.g. reported from a gift link while the order waits) → it is
  // still rendered to READY, and submitReadyOrders would send it — nothing re-reads moderationStatus.
  it.skip('08-B3: a keepsake flagged after payment is held back from print, not rendered READY', async () => {
    const assetId = await keepsake('CLEAR');
    const res = await order(assetId);
    const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.ref, res.ref!));
    orderIds.push(o!.id);
    await db.update(assets).set({ moderationStatus: 'FLAGGED' }).where(eq(assets.id, assetId)); // the report lands
    await processFulfilment(db, { env: SANDBOX, onlyOrderIds: [o!.id] });
    const [oi] = await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, o!.id));
    const [a] = await db.select().from(orderItemArtwork).where(eq(orderItemArtwork.orderItemId, oi!.id));
    expect(a!.status).not.toBe('READY');
  });

  // 08-B5: "delete" (one keepsake, or "delete all your keepsakes") on a PAID order that isn't made
  // yet goes straight through — no warning, no refusal (account closure DOES wait for these) — so the
  // paid order's artwork becomes RENDER_FAILED "no source asset (purged?)" and the order sits PAID.
  it.skip('08-B5: deleting a keepsake that a paid, unmade order needs is refused (or the order is dealt with)', async () => {
    const assetId = await keepsake('CLEAR');
    const res = await order(assetId);
    const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.ref, res.ref!));
    orderIds.push(o!.id);
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const { deleteAsset } = await import('@/server/assets');
    await expect(deleteAsset(db, assetId, sam)).rejects.toThrow();
  });
});
