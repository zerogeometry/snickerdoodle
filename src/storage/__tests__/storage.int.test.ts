import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError } from '@/authz';
import { getAssetDownloadGrant, resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { deleteObject, ensureBucket, hasExif } from '@/storage';
import type { DbHandle } from '@/server/db';

/**
 * Storage end-to-end against real MinIO + Postgres: ingest strips EXIF and stores
 * privately; a signed URL is minted ONLY after authz allows; a denied viewer gets
 * no URL. Skipped unless both DATABASE_URL and S3_ENDPOINT are set.
 * Run: DATABASE_URL=… S3_ENDPOINT=… npx vitest run src/storage
 */
const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;

async function jpegWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 24, height: 24, channels: 3, background: { r: 120, g: 180, b: 90 } } })
    .jpeg()
    .withExif({ IFD0: { Copyright: 'x', Make: 'TestCam' } })
    .toBuffer();
}

describe.skipIf(!DB || !S3)('storage ingest + signed-url grant — integration', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const ingestedKeys: string[] = [];

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await ensureBucket();
  });

  afterAll(async () => {
    for (const key of ingestedKeys) await deleteObject(key).catch(() => {});
    if (ids) await cleanupDemoFamilies(db, ids); // cascades the storage_objects rows
    await client.end();
  });

  it('ingest: authz-gated, EXIF stripped, ORIGINAL recorded write-once', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const result = await ingestOriginalAsset(db, sam, {
      familyId: ids.hartleyId,
      kind: 'PHOTO',
      childSubjectId: ids.oliviaId,
      buffer: await jpegWithExif(),
    });
    ingestedKeys.push(result.key);

    const [obj] = await db
      .select()
      .from(storageObjects)
      .where(and(eq(storageObjects.assetId, result.assetId), eq(storageObjects.objectClass, 'ORIGINAL')));
    expect(obj).toBeTruthy();
    expect(obj!.exifStripped).toBe(true);
    expect(obj!.writeOnce).toBe(true);
    expect(obj!.sha256).toBe(result.sha256);
  });

  it('mints a working signed URL for an allowed viewer; the bytes carry no EXIF', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const result = await ingestOriginalAsset(db, sam, {
      familyId: ids.hartleyId,
      kind: 'DRAWING',
      buffer: await jpegWithExif(),
    });
    ingestedKeys.push(result.key);

    const grant = await getAssetDownloadGrant(db, result.assetId, sam);
    expect(grant.url).toBeTruthy();

    const res = await fetch(grant.url!);
    expect(res.status).toBe(200);
    const fetched = Buffer.from(await res.arrayBuffer());
    expect(fetched.byteLength).toBe(result.byteSize);
    expect(await hasExif(fetched)).toBe(false);
  });

  it('denies a signed URL to an Extended-circle viewer for a FAMILY asset', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const { assetId, key } = await ingestOriginalAsset(db, sam, {
      familyId: ids.hartleyId,
      kind: 'DRAWING',
      buffer: await jpegWithExif(),
    });
    ingestedKeys.push(key);
    const rosie = await resolveViewerContext(db, ids.rosieId, ids.hartleyId);
    await expect(getAssetDownloadGrant(db, assetId, rosie)).rejects.toBeInstanceOf(AuthzError);
  });

  it('refuses ingest from a non-contributor, a removed member, and across families', async () => {
    const buf = await jpegWithExif();
    const rosie = await resolveViewerContext(db, ids.rosieId, ids.hartleyId); // VIEW_BUY, not CONTRIBUTE
    await expect(ingestOriginalAsset(db, rosie, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: buf })).rejects.toBeInstanceOf(AuthzError);

    const mallory = await resolveViewerContext(db, ids.malloryId, ids.hartleyId); // REMOVED
    await expect(ingestOriginalAsset(db, mallory, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: buf })).rejects.toBeInstanceOf(AuthzError);

    const samInBloom = await resolveViewerContext(db, ids.samId, ids.bloomId); // no membership there
    await expect(ingestOriginalAsset(db, samInBloom, { familyId: ids.bloomId, kind: 'DRAWING', buffer: buf })).rejects.toBeInstanceOf(AuthzError);
  });
});
