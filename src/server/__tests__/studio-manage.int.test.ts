import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { assets, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError } from '@/authz';
import { resolveViewerContext } from '@/server/assets';
import { ingestEphemeralUpload, ingestOriginalAsset } from '@/server/ingest';
import { deleteStudioCreation, duplicateCreation, studioKeepsakeInfo } from '@/server/studio-manage';
import { autosaveStudioDoc, IDENTITY_GEOMETRY, studioStateForAsset } from '@/server/studio-doc';
import { derivativeKey, getObjectBytes, putObject } from '@/storage';
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

  const gone = async (assetId: string, keys: string[]) => {
    expect((await db.select().from(assets).where(eq(assets.id, assetId))).length).toBe(0);
    expect((await db.select().from(storageObjects).where(eq(storageObjects.assetId, assetId))).length).toBe(0);
    for (const k of keys) await expect(getObjectBytes(k)).rejects.toBeTruthy(); // the bytes too
  };

  it('delete from the studio: a draft by its claim holder — row, storage rows and bytes all gone', async () => {
    const d = await ingestEphemeralUpload(db, { buffer: await png(), kind: 'DRAWING', termsVersion: 'test' });
    const keys = (await db.select().from(storageObjects).where(eq(storageObjects.assetId, d.assetId))).map((o) => o.key);
    await expect(deleteStudioCreation(db, { accountId: null, membership: null, uploadClaim: 'not-mine' }, d.assetId)).rejects.toBeInstanceOf(AuthzError);
    await deleteStudioCreation(db, { accountId: null, membership: null, uploadClaim: d.claimId }, d.assetId);
    await gone(d.assetId, keys);
  });

  it('delete from the studio: a kept keepsake only by its controlling parent', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: true });
    const jo = await resolveViewerContext(db, ids.joId, ids.hartleyId);
    await expect(deleteStudioCreation(db, jo, a.assetId)).rejects.toBeInstanceOf(AuthzError); // a family member, not the controller
    const blake = await resolveViewerContext(db, ids.blakeId, ids.hartleyId);
    await expect(deleteStudioCreation(db, blake, a.assetId)).rejects.toBeInstanceOf(AuthzError); // outside the family
    await deleteStudioCreation(db, sam, a.assetId);
    await gone(a.assetId, [a.key]);
  });

  it('duplicate: a new keepsake with the same recipe, its OWN copy of the original, same child/circle/keep status', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: true, childSubjectId: ids.oliviaId });
    await db.update(assets).set({ visibility: 'EXTENDED', moderationStatus: 'CLEAR' }).where(eq(assets.id, a.assetId));
    await autosaveStudioDoc(db, sam, a.assetId, { mask: null, geometry: { ...IDENTITY_GEOMETRY, rotate: 90 }, objects: [{ id: 's', type: 'sticker', sticker: 'heart', x: 0.5, y: 0.5, size: 0.2, rotation: 0, flip: false }] });
    const before = await getObjectBytes(a.key);

    const { assetId: copyId } = await duplicateCreation(db, sam, a.assetId);
    expect(copyId).not.toBe(a.assetId);
    const [src] = await db.select().from(assets).where(eq(assets.id, a.assetId));
    const [cp] = await db.select().from(assets).where(eq(assets.id, copyId));
    expect(cp).toMatchObject({ familyId: src!.familyId, childSubjectId: ids.oliviaId, controllerAccountId: src!.controllerAccountId, visibility: 'EXTENDED', keptInHome: true, moderationStatus: 'CLEAR' });
    const st = await studioStateForAsset(db, sam, copyId);
    expect(st.geometry.rotate).toBe(90);
    expect(st.objects).toMatchObject([{ type: 'sticker', sticker: 'heart' }]);
    const [orig] = await db.select().from(storageObjects).where(eq(storageObjects.assetId, copyId));
    expect(orig!.key).not.toBe(a.key); // its own bytes, so each can be deleted for real
    expect(Buffer.compare(await getObjectBytes(orig!.key), before)).toBe(0);
    expect(Buffer.compare(await getObjectBytes(a.key), before)).toBe(0); // the first is untouched

    // a table-trimmed upload: the trimmed drawing (what every edit works from) is copied too — its own bytes
    const trimKey = derivativeKey(a.assetId, 'trimmed');
    const trimBytes = await png();
    await putObject(trimKey, trimBytes, 'image/png');
    await db.insert(storageObjects).values({ assetId: a.assetId, objectClass: 'DERIVATIVE', bucket: orig!.bucket, key: trimKey, contentType: 'image/png', byteSize: trimBytes.byteLength, exifStripped: true, writeOnce: false });
    const second = await duplicateCreation(db, sam, a.assetId);
    expect(second.trimmedObjectId).toBeTruthy();
    const [trimCopy] = await db.select().from(storageObjects).where(eq(storageObjects.id, second.trimmedObjectId!));
    expect(trimCopy).toMatchObject({ assetId: second.assetId, key: derivativeKey(second.assetId, 'trimmed') });
    expect(Buffer.compare(await getObjectBytes(trimCopy!.key), trimBytes)).toBe(0);
    await deleteStudioCreation(db, sam, second.assetId);

    // deleting one never touches the other
    await deleteStudioCreation(db, sam, a.assetId);
    expect(Buffer.compare(await getObjectBytes(orig!.key), before)).toBe(0);
    await deleteStudioCreation(db, sam, copyId);
    await gone(copyId, [orig!.key]);
  });

  it('duplicate is for the controlling parent of a kept, cleared keepsake only', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: true });
    await db.update(assets).set({ moderationStatus: 'CLEAR' }).where(eq(assets.id, a.assetId));
    const jo = await resolveViewerContext(db, ids.joId, ids.hartleyId);
    await expect(duplicateCreation(db, jo, a.assetId)).rejects.toBeInstanceOf(AuthzError);
    const blake = await resolveViewerContext(db, ids.blakeId, ids.hartleyId);
    await expect(duplicateCreation(db, blake, a.assetId)).rejects.toBeInstanceOf(AuthzError);
    await db.update(assets).set({ moderationStatus: 'FLAGGED' }).where(eq(assets.id, a.assetId));
    await expect(duplicateCreation(db, sam, a.assetId)).rejects.toBeInstanceOf(AuthzError); // held back for review
    const d = await ingestEphemeralUpload(db, { buffer: await png(), kind: 'DRAWING', termsVersion: 'test' });
    await expect(duplicateCreation(db, { accountId: null, membership: null, uploadClaim: d.claimId }, d.assetId)).rejects.toBeInstanceOf(AuthzError); // a draft
  });
});
