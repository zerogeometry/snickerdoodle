import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { assets, auditRecords, giftLinks, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError } from '@/authz';
import { deleteAsset, resolveViewerContext } from '@/server/assets';
import { createGiftLink, getGiftLink } from '@/server/giftLinks';
import { ingestOriginalAsset } from '@/server/ingest';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;

const png = () => sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 5, g: 5, b: 5 } } }).png().toBuffer();

/**
 * On-demand cascading deletion (NN8 + children's-data rules): real + cascading —
 * bytes (confirmed gone) + DB row + storage rows + audit, controller-gated. Needs a
 * real asset with storage, so it requires Postgres + S3.
 */
describe.skipIf(!DB || !S3)('deleteAsset — cascading on-demand deletion (NN8)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
  });

  afterAll(async () => {
    if (ids) {
      await db.delete(giftLinks).where(eq(giftLinks.familyId, ids.hartleyId));
      await cleanupDemoFamilies(db, ids);
    }
    await client.end();
  });

  async function keptAsset(): Promise<string> {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const r = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: true });
    return r.assetId;
  }

  it('the controller deletes: DB row + storage rows gone, ASSET_DELETED audited', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const assetId = await keptAsset();
    expect((await db.select().from(storageObjects).where(eq(storageObjects.assetId, assetId))).length).toBeGreaterThan(0);

    await deleteAsset(db, assetId, sam);

    expect((await db.select().from(assets).where(eq(assets.id, assetId))).length).toBe(0); // row gone
    expect((await db.select().from(storageObjects).where(eq(storageObjects.assetId, assetId))).length).toBe(0); // cascaded
    const audits = await db.select().from(auditRecords).where(eq(auditRecords.event, 'ASSET_DELETED'));
    expect(audits.some((a) => a.targetId === assetId)).toBe(true); // append-only audit
  });

  it('a non-controller member cannot delete (authz denies; the keepsake survives)', async () => {
    const assetId = await keptAsset(); // controller is Sam
    const rosie = await resolveViewerContext(db, ids.rosieId, ids.hartleyId); // active member, NOT controller
    await expect(deleteAsset(db, assetId, rosie)).rejects.toBeInstanceOf(AuthzError);
    expect((await db.select().from(assets).where(eq(assets.id, assetId))).length).toBe(1); // still there

    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    await deleteAsset(db, assetId, sam); // cleanup
  });

  it('a gift link to a deleted keepsake serves "gone" (never missing bytes)', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const assetId = await keptAsset();
    const { token } = await createGiftLink(db, sam, { familyId: ids.hartleyId, assetIds: [assetId] });
    expect((await getGiftLink(db, token)).state).toBe('active');

    await deleteAsset(db, assetId, sam);
    expect((await getGiftLink(db, token)).state).toBe('gone');
  });
});
