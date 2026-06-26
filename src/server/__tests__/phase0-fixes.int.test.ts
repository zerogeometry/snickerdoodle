import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { assets, orderItemArtwork, orderItems, orders, productVariants, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError } from '@/authz';
import { getStorageObjectGrant, resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { purgeExpiredAssets } from '@/server/retention';
import { seedCatalogue } from '@/server/catalogue';
import { deleteObject, derivativeKey, getS3, putObject } from '@/storage';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const png = () => sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 5, g: 5, b: 5 } } }).png().toBuffer();

describe.skipIf(!DB || !S3)('phase 0 fixes — derivative grant + purge guard (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const keys: string[] = [];
  const orderIds: string[] = [];

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
  });

  afterAll(async () => {
    if (orderIds.length) await db.delete(orders).where(inArray(orders.id, orderIds)); // cascades items + artwork
    for (const k of keys) await deleteObject(k).catch(() => {});
    if (ids) await cleanupDemoFamilies(db, ids); // catalogue (shared reference data) is left seeded
    await client.end();
  });

  it('a derivative is addressable ONLY through the authz-gated grant', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const asset = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: true });
    keys.push(asset.key);

    // write a print-file DERIVATIVE for it
    const dkey = derivativeKey(asset.assetId, 'printfile');
    await putObject(dkey, await png(), 'image/png');
    keys.push(dkey);
    const [deriv] = await db
      .insert(storageObjects)
      .values({ assetId: asset.assetId, objectClass: 'DERIVATIVE', bucket: getS3().bucket, key: dkey, contentType: 'image/png', exifStripped: true })
      .returning();

    // controller can mint it; the bytes fetch
    const grant = await getStorageObjectGrant(db, deriv!.id, sam);
    expect((await fetch(grant.url)).status).toBe(200);

    // a FAMILY asset's derivative is denied to an Extended member and a removed member
    const rosie = await resolveViewerContext(db, ids.rosieId, ids.hartleyId);
    await expect(getStorageObjectGrant(db, deriv!.id, rosie)).rejects.toBeInstanceOf(AuthzError);
    const mallory = await resolveViewerContext(db, ids.malloryId, ids.hartleyId);
    await expect(getStorageObjectGrant(db, deriv!.id, mallory)).rejects.toBeInstanceOf(AuthzError);
  });

  it('retention will not purge an asset referenced by an in-flight order', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const asset = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: false });
    keys.push(asset.key);
    await db.update(assets).set({ purgeAfter: new Date(Date.now() - 1000) }).where(eq(assets.id, asset.assetId)); // window elapsed

    const [variant] = await db.select().from(productVariants).where(eq(productVariants.sku, 'framedPrint'));
    const [order] = await db
      .insert(orders)
      .values({ ref: `SNK-guard-${ids.nonce}`, accountId: ids.samId, status: 'PAID', subtotalPence: 2200, deliveryPence: 399, totalPence: 2599 })
      .returning();
    orderIds.push(order!.id);
    const [item] = await db
      .insert(orderItems)
      .values({ orderId: order!.id, productKey: 'framedPrint', variantId: variant!.id, qty: 1, unitPricePence: 2200, linePence: 2200 })
      .returning();
    await db.insert(orderItemArtwork).values({
      orderItemId: item!.id,
      assetId: asset.assetId,
      variantId: variant!.id,
      controllerAccountId: ids.samId,
      templateSnapshot: {},
      transform: {},
    });

    // in-flight (PAID) → protected
    const first = await purgeExpiredAssets(db);
    expect(first.purgedAssetIds).not.toContain(asset.assetId);
    expect(await db.select().from(assets).where(eq(assets.id, asset.assetId))).toHaveLength(1);

    // once the order is terminal, the source follows normal retention
    await db.update(orders).set({ status: 'CANCELLED' }).where(eq(orders.id, order!.id));
    const second = await purgeExpiredAssets(db);
    expect(second.purgedAssetIds).toContain(asset.assetId);
    expect(await db.select().from(assets).where(eq(assets.id, asset.assetId))).toHaveLength(0);

    // the artwork row survives with its assetId nulled (frozen spec kept)
    const [artwork] = await db.select().from(orderItemArtwork).where(eq(orderItemArtwork.orderItemId, item!.id));
    expect(artwork!.assetId).toBeNull();
  });
});
