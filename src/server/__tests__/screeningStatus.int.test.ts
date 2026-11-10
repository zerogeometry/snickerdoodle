import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { assets, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { resolveViewerContext } from '@/server/assets';
import { ingestEphemeralUpload, ingestOriginalAsset } from '@/server/ingest';
import { screeningStatusOf, uploadScreeningStatus } from '@/server/screeningStatus';
import type { BackgroundTask } from '@/server/background';
import { deleteObject } from '@/storage';
import type { DbHandle } from '@/server/db';

/**
 * Founder, 10 Nov 2026: when the background check holds a picture, the shopper is told ("we've paused
 * this picture" with a "back to upload" button). The page asks for the status, so it must answer ONLY
 * someone who may see the picture, and say nothing about why.
 */

describe('screeningStatusOf: coarse, and the private answer when unsure', () => {
  it('maps each check result', () => {
    expect(screeningStatusOf('PENDING')).toBe('checking');
    expect(screeningStatusOf('CLEAR')).toBe('ok');
    expect(screeningStatusOf('FLAGGED')).toBe('held');
    expect(screeningStatusOf('BLOCKED')).toBe('held');
    expect(screeningStatusOf('something new')).toBe('held');
  });
});

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const png = () => sharp({ create: { width: 400, height: 400, channels: 3, background: { r: 250, g: 250, b: 245 } } }).png().toBuffer();

describe.skipIf(!DB || !S3)('uploadScreeningStatus: only for someone who may see the picture', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const assetIds: string[] = [];

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
  });
  afterAll(async () => {
    if (assetIds.length) {
      for (const o of await db.select().from(storageObjects).where(inArray(storageObjects.assetId, assetIds))) await deleteObject(o.key).catch(() => {});
      await db.delete(assets).where(inArray(assets.id, assetIds));
    }
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  const setStatus = (id: string, moderationStatus: 'PENDING' | 'CLEAR' | 'FLAGGED' | 'BLOCKED') => db.update(assets).set({ moderationStatus }).where(eq(assets.id, id));
  const queue = () => {
    const tasks: BackgroundTask[] = [];
    return { tasks, opts: { background: (t: BackgroundTask) => void tasks.push(t) } };
  };

  it('a guest holding the upload claim: checking → held; anyone without that claim gets nothing', async () => {
    const q = queue();
    const { assetId, claimId } = await ingestEphemeralUpload(db, { buffer: await png(), kind: 'DRAWING', termsVersion: 't' }, q.opts);
    assetIds.push(assetId);
    expect(await uploadScreeningStatus(db, assetId, null, [claimId])).toBe('checking');
    await setStatus(assetId, 'FLAGGED');
    expect(await uploadScreeningStatus(db, assetId, null, [claimId])).toBe('held');
    expect(await uploadScreeningStatus(db, assetId, null, [])).toBeNull();
    expect(await uploadScreeningStatus(db, assetId, null, [randomUUID()])).toBeNull();
    expect(await uploadScreeningStatus(db, assetId, ids.samId, [])).toBeNull(); // a signed-in stranger to the draft
  });

  it('a parent’s own upload: they’re told it’s held; a relative in the family isn’t told anything', async () => {
    const q = queue();
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const { assetId } = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: true }, q.opts);
    assetIds.push(assetId);
    await setStatus(assetId, 'FLAGGED');
    expect(await uploadScreeningStatus(db, assetId, ids.samId, [])).toBe('held');
    expect(await uploadScreeningStatus(db, assetId, ids.joId, [])).toBeNull();
    await setStatus(assetId, 'CLEAR');
    expect(await uploadScreeningStatus(db, assetId, ids.samId, [])).toBe('ok');
  });

  it('another family, a removed ex-member, or a picture that doesn’t exist: nothing', async () => {
    const q = queue();
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const { assetId } = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: true }, q.opts);
    assetIds.push(assetId);
    for (const status of ['PENDING', 'CLEAR', 'FLAGGED'] as const) {
      await setStatus(assetId, status);
      expect(await uploadScreeningStatus(db, assetId, ids.blakeId, [])).toBeNull(); // Bloom family
      expect(await uploadScreeningStatus(db, assetId, ids.malloryId, [])).toBeNull(); // removed
      expect(await uploadScreeningStatus(db, assetId, null, [])).toBeNull(); // anonymous
    }
    expect(await uploadScreeningStatus(db, randomUUID(), ids.samId, [])).toBeNull();
  });
});
