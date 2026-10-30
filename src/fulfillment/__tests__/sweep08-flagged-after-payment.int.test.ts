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
import { releaseBlockedArtwork, submitReadyOrders } from '@/fulfillment/submit';
import type { CreateOrderRequest, ProdigiOrderTransport } from '@/server/prodigi/orders';
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
  it('08-B3: a keepsake flagged after payment is held back from print, not rendered READY', async () => {
    const assetId = await keepsake('CLEAR');
    const res = await order(assetId);
    const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.ref, res.ref!));
    orderIds.push(o!.id);
    await db.update(assets).set({ moderationStatus: 'FLAGGED' }).where(eq(assets.id, assetId)); // the report lands
    await processFulfilment(db, { env: SANDBOX, onlyOrderIds: [o!.id] });
    const [oi] = await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, o!.id));
    const [a] = await db.select().from(orderItemArtwork).where(eq(orderItemArtwork.orderItemId, oi!.id));
    expect(a!.status).not.toBe('READY');
    expect(a!.status).toBe('BLOCKED_GATE'); // held, not failed — the order is never lost
    expect(a!.printObjectId).toBeNull(); // and not even rendered
    expect(a!.renderError).toMatch(/safety check/);
  }, 120_000);

  // …and the other way round: rendered READY while CLEAR, flagged before the submit tick → the
  // submitter re-checks and holds it; the release sweep keeps it held until a reviewer clears it,
  // then it goes on to the printer as normal.
  it('a keepsake flagged between render and submit is held at submit, and released only once CLEAR again', async () => {
    const created: CreateOrderRequest[] = [];
    const transport: ProdigiOrderTransport = {
      async createOrder(req) {
        created.push(req);
        return { outcome: 'created', order: { id: `ord_sw8_${created.length}`, status: { stage: 'InProgress' } } };
      },
      async getOrder(id) {
        return { id, status: { stage: 'InProgress' } };
      },
    };
    const assetId = await keepsake('CLEAR');
    const res = await order(assetId);
    const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.ref, res.ref!));
    orderIds.push(o!.id);
    await processFulfilment(db, { env: SANDBOX, onlyOrderIds: [o!.id] });
    const [oi] = await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, o!.id));
    const line = async () => (await db.select().from(orderItemArtwork).where(eq(orderItemArtwork.orderItemId, oi!.id)))[0]!;
    expect((await line()).status).toBe('READY');

    await db.update(assets).set({ moderationStatus: 'FLAGGED' }).where(eq(assets.id, assetId)); // reported now
    await submitReadyOrders(db, { env: SANDBOX, transport, onlyOrderIds: [o!.id] });
    expect(created).toHaveLength(0);
    expect((await line()).status).toBe('BLOCKED_GATE');
    const [held] = await db.select({ status: orders.status, submitError: orders.submitError }).from(orders).where(eq(orders.id, o!.id));
    expect(held).toMatchObject({ status: 'PAID' });
    expect(held!.submitError).toMatch(/safety check/);

    // the release sweep never lets a held keepsake go…
    await releaseBlockedArtwork(db, { env: SANDBOX, onlyOrderIds: [o!.id] });
    expect((await line()).status).toBe('BLOCKED_GATE');
    // …until a reviewer clears it
    await db.update(assets).set({ moderationStatus: 'CLEAR' }).where(eq(assets.id, assetId));
    await releaseBlockedArtwork(db, { env: SANDBOX, onlyOrderIds: [o!.id] });
    expect((await line()).status).toBe('READY');
    await submitReadyOrders(db, { env: SANDBOX, transport, onlyOrderIds: [o!.id] });
    expect(created).toHaveLength(1);
  }, 120_000);

  // 08-B5: "delete" (one keepsake, or "delete all your keepsakes") on a PAID order that isn't made
  // yet goes straight through — no warning, no refusal (account closure DOES wait for these) — so the
  // paid order's artwork becomes RENDER_FAILED "no source asset (purged?)" and the order sits PAID.
  it('08-B5: deleting a keepsake that a paid, unmade order needs is refused (or the order is dealt with)', async () => {
    const assetId = await keepsake('CLEAR');
    const res = await order(assetId);
    const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.ref, res.ref!));
    orderIds.push(o!.id);
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const { deleteAsset, KeepsakeInUseError } = await import('@/server/assets');
    await expect(deleteAsset(db, assetId, sam)).rejects.toBeInstanceOf(KeepsakeInUseError);
    expect(await db.select({ id: assets.id }).from(assets).where(eq(assets.id, assetId))).toHaveLength(1); // still there

    // once the order is on its way, the keepsake is the parent's to delete again
    await db.update(orders).set({ status: 'SHIPPED' }).where(eq(orders.id, o!.id));
    await deleteAsset(db, assetId, sam);
    expect(await db.select({ id: assets.id }).from(assets).where(eq(assets.id, assetId))).toHaveLength(0);
  }, 120_000);

  it('08-B5: removing a child with "delete their keepsakes" refuses BEFORE deleting any, while an order needs one', async () => {
    const { children: childrenTable } = schema;
    const [kid] = await db.insert(childrenTable).values({ familyId: ids.hartleyId, firstName: 'Pip', controllerAccountId: ids.samId }).returning();
    const a1 = await keepsake('CLEAR');
    const a2 = await keepsake('CLEAR');
    await db.update(assets).set({ childSubjectId: kid!.id }).where(inArray(assets.id, [a1, a2]));
    const res = await order(a1);
    const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.ref, res.ref!));
    orderIds.push(o!.id);
    const owner = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const { deleteChild } = await import('@/server/children');
    expect(await deleteChild(db, owner, { familyId: ids.hartleyId, childId: kid!.id, alsoDeleteKeepsakes: true })).toEqual({ ok: false, keepsakesDeleted: 0, reason: 'in-order' });
    expect(await db.select({ id: assets.id }).from(assets).where(inArray(assets.id, [a1, a2]))).toHaveLength(2); // nothing half-done
    await db.update(assets).set({ childSubjectId: null }).where(inArray(assets.id, [a1, a2]));
    await db.delete(childrenTable).where(eq(childrenTable.id, kid!.id));
  }, 120_000);
});
