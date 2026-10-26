import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { eraseAsset, resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { keepsakeThumbUrls } from '@/server/keepsakeThumbs';
import { deleteObject, derivativeKey, getObjectBytes } from '@/storage';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;

describe.skipIf(!DB || !S3)('keepsake grid thumbnails (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const keys: string[] = [];

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
  });

  afterAll(async () => {
    for (const k of keys) await deleteObject(k).catch(() => {});
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  it('a small DERIVATIVE under the asset, made once, reused — and erased with the keepsake', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const big = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: { r: 240, g: 200, b: 90 } } }).jpeg().toBuffer();
    const asset = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: big, keptInHome: true });
    const thumbKey = derivativeKey(asset.assetId, 'picker-thumb');
    keys.push(asset.key, thumbKey);

    const first = await keepsakeThumbUrls(db, [asset.assetId], 60);
    expect(first.get(asset.assetId)).toBeTruthy();
    const rows = await db.select().from(storageObjects).where(eq(storageObjects.key, thumbKey));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.objectClass).toBe('DERIVATIVE');
    expect(rows[0]!.assetId).toBe(asset.assetId);
    const meta = await sharp(Buffer.from(await getObjectBytes(thumbKey))).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(400);

    // a second visit reuses it (no second row, same object)
    await keepsakeThumbUrls(db, [asset.assetId], 60);
    expect(await db.select().from(storageObjects).where(eq(storageObjects.key, thumbKey))).toHaveLength(1);

    // erasing the keepsake takes its thumbnail with it (bytes + row)
    await eraseAsset(db, { id: asset.assetId, familyId: ids.hartleyId }, { accountId: ids.samId, actorType: 'MEMBER' }, undefined, { skipLedger: true });
    expect(await db.select().from(storageObjects).where(eq(storageObjects.key, thumbKey))).toHaveLength(0);
    await expect(getObjectBytes(thumbKey)).rejects.toBeTruthy();
  });

  it('nothing asked, nothing made', async () => {
    expect((await keepsakeThumbUrls(db, [], 60)).size).toBe(0);
  });
});
