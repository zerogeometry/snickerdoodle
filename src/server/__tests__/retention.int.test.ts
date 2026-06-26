import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { assets, auditRecords, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { purgeExpiredAssets } from '@/server/retention';
import { deleteObject, presignDownload } from '@/storage';
import type { DbHandle } from '@/server/db';

/**
 * Retention purge against real MinIO + Postgres: an un-kept upload past its
 * window is gone from BOTH the DB and the provider; a kept keepsake survives; a
 * PURGE_EXECUTED audit row is written. Skipped without DATABASE_URL/S3_ENDPOINT.
 */
const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;

async function png(): Promise<Buffer> {
  return sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toBuffer();
}

describe.skipIf(!DB || !S3)('retention purge — integration', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  let keptKey = '';

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
  });

  afterAll(async () => {
    if (keptKey) await deleteObject(keptKey).catch(() => {});
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  it('purges an expired un-kept upload (DB + provider), keeps a kept keepsake, audits it', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);

    const kept = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: true });
    keptKey = kept.key;
    const unkept = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: false });

    // pretend its retention window has already elapsed
    await db.update(assets).set({ purgeAfter: new Date(Date.now() - 1000) }).where(eq(assets.id, unkept.assetId));

    const summary = await purgeExpiredAssets(db);
    expect(summary.purged).toBeGreaterThanOrEqual(1);
    expect(summary.purgedAssetIds).toContain(unkept.assetId);
    expect(summary.failed).toBe(0);

    // the un-kept asset is gone from the DB…
    const assetRow = await db.select().from(assets).where(eq(assets.id, unkept.assetId));
    expect(assetRow).toHaveLength(0);
    const objRows = await db.select().from(storageObjects).where(eq(storageObjects.assetId, unkept.assetId));
    expect(objRows).toHaveLength(0);

    // …and gone from the provider (its bytes no longer fetch)
    const res = await fetch(await presignDownload(unkept.key));
    expect(res.status).not.toBe(200);

    // the kept keepsake survives
    const keptRow = await db.select().from(assets).where(eq(assets.id, kept.assetId));
    expect(keptRow).toHaveLength(1);

    // and the purge is on the audit trail
    const audit = await db
      .select()
      .from(auditRecords)
      .where(and(eq(auditRecords.targetId, unkept.assetId), eq(auditRecords.event, 'PURGE_EXECUTED')));
    expect(audit.length).toBeGreaterThanOrEqual(1);
  });
});
