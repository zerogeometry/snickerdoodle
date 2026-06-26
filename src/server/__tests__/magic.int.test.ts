import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { mlOperations, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError } from '@/authz';
import { resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { assertMlBudget, removeBackgroundForAsset } from '@/server/magic';
import { deleteObject, derivativeKey } from '@/storage';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
// a small drawing on a white background, so the cutout has something to key out
const png = () =>
  sharp({ create: { width: 60, height: 60, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{ input: { create: { width: 20, height: 20, channels: 3, background: { r: 30, g: 120, b: 200 } } }, left: 20, top: 20 }])
    .png()
    .toBuffer();

describe.skipIf(!DB || !S3)('magic edits — self-hosted, gated, budget-capped (integration)', () => {
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
    await db.delete(mlOperations).where(inArray(mlOperations.accountId, [ids.samId, ids.blakeId]));
    for (const k of keys) await deleteObject(k).catch(() => {});
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  it('remove background: stores an EXIF-stripped cutout DERIVATIVE + records the op against the budget', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const asset = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: true });
    keys.push(asset.key);

    const res = await removeBackgroundForAsset(db, sam, asset.assetId);
    keys.push(res.key);
    expect(res.key).toBe(derivativeKey(asset.assetId, 'cutout'));

    const [obj] = await db.select().from(storageObjects).where(eq(storageObjects.id, res.objectId));
    expect(obj!.objectClass).toBe('DERIVATIVE');
    expect(obj!.exifStripped).toBe(true);
    expect(obj!.assetId).toBe(asset.assetId);

    const ops = await db
      .select()
      .from(mlOperations)
      .where(and(eq(mlOperations.assetId, asset.assetId), eq(mlOperations.op, 'BG_REMOVE')));
    expect(ops).toHaveLength(1); // recorded once, against the budget
  });

  it('refuses a magic edit on a keepsake outside the actor’s family', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const asset = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: true });
    keys.push(asset.key);

    const blake = await resolveViewerContext(db, ids.blakeId, ids.bloomId); // a different family
    await expect(removeBackgroundForAsset(db, blake, asset.assetId)).rejects.toBeInstanceOf(AuthzError);
  });

  it('enforces the per-creation budget cap', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const asset = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: true });
    keys.push(asset.key);

    await assertMlBudget(db, ids.samId, asset.assetId); // under cap → fine
    // fill the per-creation budget (default 20)
    await db.insert(mlOperations).values(Array.from({ length: 20 }, () => ({ accountId: ids.samId, op: 'BG_REMOVE' as const, assetId: asset.assetId })));
    await expect(assertMlBudget(db, ids.samId, asset.assetId)).rejects.toThrow(/budget/);
  });
});
