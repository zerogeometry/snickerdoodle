import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError } from '@/authz';
import { resolveViewerContext } from '@/server/assets';
import { ingestEphemeralUpload } from '@/server/ingest';
import { studioKeepsakeInfo } from '@/server/studio-manage';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const png = () => sharp({ create: { width: 60, height: 40, channels: 3, background: { r: 250, g: 250, b: 250 } } }).png().toBuffer();

/** The Studio's "this stays yours" pill: who-can-see is resolved on the server, through the gate. */
describe.skipIf(!DB || !S3)('studio keepsake info', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
  });
  afterAll(async () => {
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  it('the controlling parent sees the tier, can manage it, and sees the real people it reaches', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const info = await studioKeepsakeInfo(db, sam, ids.assetFamily);
    expect(info).toMatchObject({ draft: false, visibility: 'FAMILY', canManage: true });
    expect(info.people.length).toBeGreaterThan(0);
    expect(info.people.every((p) => p.initial !== 'S')).toBe(true); // never the viewer themself
  });

  it('another family member sees the tier but can’t manage it, and isn’t shown the member list', async () => {
    const jo = await resolveViewerContext(db, ids.joId, ids.hartleyId);
    const info = await studioKeepsakeInfo(db, jo, ids.assetFamily);
    expect(info).toMatchObject({ canManage: false, people: [] });
  });

  it('someone outside the family is refused (same as not found)', async () => {
    const blake = await resolveViewerContext(db, ids.blakeId, ids.hartleyId);
    await expect(studioKeepsakeInfo(db, blake, ids.assetFamily)).rejects.toBeInstanceOf(AuthzError);
  });

  it('a draft is just for its uploader: no tier to manage', async () => {
    const d = await ingestEphemeralUpload(db, { buffer: await png(), kind: 'DRAWING', termsVersion: 'test' });
    const info = await studioKeepsakeInfo(db, { accountId: null, membership: null, uploadClaim: d.claimId }, d.assetId);
    expect(info).toMatchObject({ draft: true, canManage: false, people: [] });
    await expect(studioKeepsakeInfo(db, { accountId: null, membership: null, uploadClaim: 'someone-else' }, d.assetId)).rejects.toBeInstanceOf(AuthzError);
  });
});
