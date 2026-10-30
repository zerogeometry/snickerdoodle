import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import * as schema from '@/db/schema';
import { assets, auditRecords, orderItemArtwork, orderItems, orders, productVariants, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { purgeExpiredAssets, RETENTION_DAYS, startRetentionClockForOrder } from '@/server/retention';
import { seedCatalogue } from '@/server/catalogue';
import { derivativeKey, putObject } from '@/storage';
import { getS3 } from '@/storage/client';
import type { DbHandle } from '@/server/db';

/**
 * Test sweep 2026-10-29 (tester 08): the retention promise end to end against real Postgres +
 * MinIO — "delete the source upload after fulfilment + 30d UNLESS kept". Checks the bucket itself
 * (every key under the asset, derivatives included), not just the DB rows.
 */
const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const DAY = 86_400_000;

const png = () => sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 9, g: 8, b: 7 } } }).png().toBuffer();

async function keysUnder(assetId: string): Promise<string[]> {
  const { client, bucket } = getS3();
  const out = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `assets/${assetId}/` }));
  return (out.Contents ?? []).map((o) => o.Key!);
}

describe.skipIf(!DB || !S3)('sweep 08 — retention purge, DB + bucket', () => {
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

  async function upload(kept: boolean) {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: kept });
    // a derivative the Studio / print pipeline would have made, registered like theirs are
    const key = derivativeKey(a.assetId, 'cutout');
    await putObject(key, await png(), 'image/png');
    const { bucket } = getS3();
    await db.insert(storageObjects).values({ assetId: a.assetId, objectClass: 'DERIVATIVE', bucket, key, contentType: 'image/png', byteSize: 1, sha256: 'x', exifStripped: true, writeOnce: true });
    return a.assetId;
  }

  async function orderFor(assetId: string, status: 'PENDING' | 'PAID' | 'SHIPPED', createdAt = new Date()) {
    const [variant] = await db.select().from(productVariants).where(eq(productVariants.sku, 'framedPrint'));
    const [order] = await db
      .insert(orders)
      .values({ ref: `SNK-t8-${status}-${Math.random().toString(36).slice(2, 8)}`, accountId: ids.samId, status, subtotalPence: 100, deliveryPence: 0, totalPence: 100, createdAt })
      .returning();
    orderIds.push(order!.id);
    const [item] = await db.insert(orderItems).values({ orderId: order!.id, productKey: 'framedPrint', variantId: variant!.id, qty: 1, unitPricePence: 100, linePence: 100 }).returning();
    await db.insert(orderItemArtwork).values({ orderItemId: item!.id, assetId, variantId: variant!.id, controllerAccountId: ids.samId, templateSnapshot: {}, transform: {} });
    return order!.id;
  }

  it('an unkept upload past its window: original AND derivatives leave the bucket, rows go, purge audited', async () => {
    const id = await upload(false);
    expect((await keysUnder(id)).sort()).toEqual([`assets/${id}/derivatives/cutout`, `assets/${id}/original`]);
    await db.update(assets).set({ purgeAfter: new Date(Date.now() - 1000) }).where(eq(assets.id, id));

    const run = await purgeExpiredAssets(db);
    expect(run.purgedAssetIds).toContain(id);
    expect(await keysUnder(id)).toEqual([]);
    expect(await db.select().from(assets).where(eq(assets.id, id))).toHaveLength(0);
    expect(await db.select().from(storageObjects).where(eq(storageObjects.assetId, id))).toHaveLength(0);
    expect((await db.select().from(auditRecords).where(eq(auditRecords.targetId, id))).map((r) => r.event)).toContain('PURGE_EXECUTED');
  });

  it('a kept keepsake survives however old its order is; an unkept one still inside its window survives', async () => {
    const kept = await upload(true);
    await db.update(assets).set({ fulfilledAt: new Date(Date.now() - 400 * DAY) }).where(eq(assets.id, kept));
    const young = await upload(false); // purgeAfter = upload + 30d
    const run = await purgeExpiredAssets(db, { now: new Date(Date.now() + 29 * DAY) });
    expect(run.purgedAssetIds).not.toContain(kept);
    expect(run.purgedAssetIds).not.toContain(young);
    expect((await keysUnder(kept)).length).toBe(2);
    expect((await keysUnder(young)).length).toBe(2);
  });

  it('held while a PAID order needs it; after fulfilment the clock is fulfilment + 30d, then it goes', async () => {
    const id = await upload(false);
    await db.update(assets).set({ purgeAfter: new Date(Date.now() - DAY) }).where(eq(assets.id, id));
    const orderId = await orderFor(id, 'PAID');
    expect((await purgeExpiredAssets(db)).purgedAssetIds).not.toContain(id); // a paid order still needs it

    const shipped = new Date();
    await db.update(orders).set({ status: 'SHIPPED' }).where(eq(orders.id, orderId));
    await startRetentionClockForOrder(db, orderId, shipped);
    const [a] = await db.select().from(assets).where(eq(assets.id, id));
    expect(a!.fulfilledAt!.getTime()).toBe(shipped.getTime());
    expect(a!.purgeAfter!.getTime()).toBe(shipped.getTime() + RETENTION_DAYS * DAY);

    expect((await purgeExpiredAssets(db, { now: new Date(shipped.getTime() + 29 * DAY) })).purgedAssetIds).not.toContain(id);
    expect((await purgeExpiredAssets(db, { now: new Date(shipped.getTime() + 31 * DAY) })).purgedAssetIds).toContain(id);
    expect(await keysUnder(id)).toEqual([]);
  });

  // 08-B2: an order that never got paid (checkout abandoned at Stripe) stays PENDING for ever, and
  // purgeExpiredAssets treats PENDING as "in flight" — so the unkept upload on it is never purged.
  // Nothing expires PENDING orders (grep: no job moves PENDING → anything but PAID).
  it.skip('08-B2: an unkept upload on a checkout abandoned 60 days ago is still purged', async () => {
    const id = await upload(false);
    await db.update(assets).set({ purgeAfter: new Date(Date.now() - 30 * DAY) }).where(eq(assets.id, id));
    await orderFor(id, 'PENDING', new Date(Date.now() - 60 * DAY));
    expect((await purgeExpiredAssets(db)).purgedAssetIds).toContain(id);
    expect(await keysUnder(id)).toEqual([]);
  });
});

describe.skipIf(!DB || !S3)('sweep 08 — a mockup finishing after its keepsake is erased', () => {
  // 08-B8: persistDerivative (src/server/print/compositor.ts) writes the bytes FIRST, then the
  // storage_objects row. A mockup render that is in flight when its keepsake is erased (retention
  // purge, "delete", account closure, review "remove") lands its picture in the bucket after the
  // erase listed the rows — the row insert then fails (asset gone) and the bytes stay, untracked,
  // for ever. Seen for real in the e2e run: 5 mockup thumbnails left under a purged asset.
  it.skip('08-B8: no picture of an erased keepsake is left in the bucket by a late mockup', async () => {
    const client = postgres(DB!, { prepare: false });
    const db = drizzle(client, { schema });
    const ids = await seedDemoFamilies(db);
    try {
      const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
      const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: true });
      const { deleteAsset } = await import('@/server/assets');
      const { persistDerivative } = await import('@/server/print/compositor');
      await deleteAsset(db, a.assetId, sam); // the erase…
      await persistDerivative(db, a.assetId, derivativeKey(a.assetId, 'mockup-late'), await png()).catch(() => {}); // …then the in-flight mockup lands
      expect(await keysUnder(a.assetId)).toEqual([]);
    } finally {
      await cleanupDemoFamilies(db, ids);
      await client.end();
    }
  });
});
