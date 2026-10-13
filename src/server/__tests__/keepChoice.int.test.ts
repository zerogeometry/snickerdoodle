import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { assets, orderItemArtwork, orderItems, orders, productVariants } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { listUndecidedCreations, setKeepChoice } from '@/server/keepChoice';
import { startRetentionClockForOrder, RETENTION_DAYS } from '@/server/retention';
import { seedCatalogue } from '@/server/catalogue';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;

/** After a purchase the parent chooses: keep the drawing in their box, or hold it only as long
 * as the order needs it. Nothing is kept without a yes. */
describe.skipIf(!DB)('post-purchase keep choice', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const orderIds: string[] = [];

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
  });
  afterAll(async () => {
    if (orderIds.length) await db.delete(orders).where(inArray(orders.id, orderIds));
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  async function orderWithUnkeptDrawing(tag: string) {
    const [asset] = await db
      .insert(assets)
      .values({ familyId: ids.hartleyId, kind: 'DRAWING', uploaderAccountId: ids.samId, controllerAccountId: ids.samId, keptInHome: false, moderationStatus: 'CLEAR', purgeAfter: new Date(Date.now() + 86_400_000) })
      .returning();
    const [variant] = await db.select().from(productVariants).where(eq(productVariants.sku, 'framedPrint'));
    const [order] = await db
      .insert(orders)
      .values({ ref: `SNK-keep-${tag}-${ids.nonce}`, accountId: ids.samId, status: 'PAID', subtotalPence: 100, deliveryPence: 0, totalPence: 100 })
      .returning();
    orderIds.push(order!.id);
    const [item] = await db.insert(orderItems).values({ orderId: order!.id, productKey: 'framedPrint', variantId: variant!.id, qty: 1, unitPricePence: 100, linePence: 100 }).returning();
    await db.insert(orderItemArtwork).values({ orderItemId: item!.id, assetId: asset!.id, variantId: variant!.id, controllerAccountId: ids.samId, templateSnapshot: {}, transform: {} });
    return { assetId: asset!.id, ref: order!.ref, orderId: order!.id };
  }

  it('asks only the buyer, about their own unkept drawings', async () => {
    const o = await orderWithUnkeptDrawing('ask');
    expect((await listUndecidedCreations(db, ids.samId, o.ref)).map((c) => c.assetId)).toEqual([o.assetId]);
    expect(await listUndecidedCreations(db, ids.joId, o.ref)).toEqual([]); // not Jo's order
    expect((await setKeepChoice(db, ids.joId, o.ref, true)).ok).toBe(false);
  });

  it('yes → kept in the box, off the retention clock, and not asked again', async () => {
    const o = await orderWithUnkeptDrawing('yes');
    expect(await setKeepChoice(db, ids.samId, o.ref, true)).toEqual({ ok: true, decided: 1 });
    const [a] = await db.select().from(assets).where(eq(assets.id, o.assetId));
    expect(a).toMatchObject({ keptInHome: true, purgeAfter: null });
    expect(await listUndecidedCreations(db, ids.samId, o.ref)).toEqual([]);
  });

  it('no → not kept; held while the order needs it, then on the normal fulfilment + 30d clock', async () => {
    const o = await orderWithUnkeptDrawing('no');
    expect(await setKeepChoice(db, ids.samId, o.ref, false)).toEqual({ ok: true, decided: 1 });
    const [a] = await db.select().from(assets).where(eq(assets.id, o.assetId));
    expect(a!.keptInHome).toBe(false);
    expect(a!.keepDeclinedAt).not.toBeNull();
    expect(await listUndecidedCreations(db, ids.samId, o.ref)).toEqual([]); // not asked again

    const shipped = new Date();
    await startRetentionClockForOrder(db, o.orderId, shipped);
    const [after] = await db.select().from(assets).where(eq(assets.id, o.assetId));
    expect(after!.purgeAfter!.getTime()).toBe(shipped.getTime() + RETENTION_DAYS * 86_400_000);
  });
});
