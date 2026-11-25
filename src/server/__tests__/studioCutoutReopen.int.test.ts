import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { assets, mlOperations, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { copyKeepsake, copyWithoutBackground, editedLook } from '@/server/keepsakeCopy';
import { cutoutAlphaForAsset, removeBackgroundForAsset } from '@/server/magic';
import { IDENTITY_GEOMETRY, saveStudio, studioStateForAsset } from '@/server/studio-doc';
import { deleteObject, derivativeKey, getObjectBytes } from '@/storage';
import type { DbHandle } from '@/server/db';
import type { ModerationProviders } from '@/server/moderation';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const clean: ModerationProviders = { hash: { isKnownIllegal: async () => false }, classifier: { classify: async () => ({ flagged: false, labels: [] }) }, textReader: { read: async () => [] } };
// a drawing on plain white paper, so "remove background" has something to lift
const drawing = () =>
  sharp({ create: { width: 120, height: 120, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{ input: { create: { width: 50, height: 50, channels: 3, background: { r: 30, g: 120, b: 200 } } }, left: 35, top: 35 }])
    .png()
    .toBuffer();
const words = [{ id: 't', type: 'text', text: 'merry christmas', font: 'caveat', colour: '#2b2118', texture: 'smooth', x: 0.5, y: 0.85, w: 0.6, h: 0.1, rotation: 0 }];

/**
 * Founder, 25 Nov: making a card pack, a picture's background was removed in the Studio and saved as a
 * new keepsake — reopened, the Studio treated it as never cut out, and its next save threw the cut-out
 * away. A keepsake opened again now says which EDIT it looks like (editedLook → keepsakeForStudioAction
 * `look`), the Studio puts that cut-out back over the untouched drawing, and re-saving keeps it.
 */
describe.skipIf(!DB || !S3)('a lifted background survives saving and reopening', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const made: string[] = [];

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
  });
  afterAll(async () => {
    const objs = made.length ? await db.select({ key: storageObjects.key }).from(storageObjects).where(inArray(storageObjects.assetId, made)) : [];
    for (const o of objs) await deleteObject(o.key).catch(() => {});
    if (made.length) await db.delete(mlOperations).where(inArray(mlOperations.assetId, made));
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  const sam = () => resolveViewerContext(db, ids.samId, ids.hartleyId);
  async function keepsake() {
    const a = await ingestOriginalAsset(db, await sam(), { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await drawing(), childSubjectId: ids.oliviaId, keptInHome: true });
    made.push(a.assetId);
    return a.assetId;
  }
  const objectsOf = (id: string) => db.select().from(storageObjects).where(eq(storageObjects.assetId, id));
  const original = async (id: string) => (await db.select().from(storageObjects).where(and(eq(storageObjects.assetId, id), eq(storageObjects.objectClass, 'ORIGINAL'))))[0]!;
  /** the Studio's "remove background", then save — as the Studio sends it (the cut-out's mask) */
  async function cutOutInStudio(id: string, objects: unknown[] = []) {
    const v = await sam();
    await removeBackgroundForAsset(db, v, id, { keepEnclosedPaper: true });
    const mask = await cutoutAlphaForAsset(db, v, id);
    expect(mask).not.toBeNull();
    return saveStudio(db, v, id, { mask, geometry: IDENTITY_GEOMETRY, objects }, { moderation: clean });
  }

  it('cut out and saved: the keepsake reopens on its cut-out — and so does the new keepsake made from it', async () => {
    const src = await keepsake();
    const saved = await cutOutInStudio(src);
    expect(saved.sourceObjectId).not.toBeNull();
    const look = await editedLook(db, src);
    expect(look).toMatchObject({ id: saved.sourceObjectId, key: derivativeKey(src, 'cutout') });

    // "edit in studio" from the card-pack picker: a copy, opened in the Studio
    const { assetId: copy } = await copyKeepsake(db, await sam(), src);
    made.push(copy);
    const copyLook = await editedLook(db, copy);
    expect(copyLook?.key).toBe(derivativeKey(copy, 'cutout')); // its own cut-out, never the source's object
    expect((await studioStateForAsset(db, await sam(), copy)).mask).not.toBeNull(); // what the Studio lays back on
  });

  it('reopened and saved again (words added): the cut-out is kept, and the original is untouched', async () => {
    const src = await keepsake();
    const before = await original(src);
    await cutOutInStudio(src);
    const { assetId: copy } = await copyKeepsake(db, await sam(), src);
    made.push(copy);

    // the reopened Studio has the cut-out on the drawing again, so its save sends that mask (not "clear it")
    const st = await studioStateForAsset(db, await sam(), copy);
    const res = await saveStudio(db, await sam(), copy, { mask: st.mask, geometry: st.geometry, objects: words }, { moderation: clean });
    const keys = (await objectsOf(copy)).map((o) => o.key);
    expect(keys).toContain(derivativeKey(copy, 'cutout'));
    expect(keys).toContain(derivativeKey(copy, 'design'));
    const look = await editedLook(db, copy);
    expect(look).toMatchObject({ id: res.sourceObjectId, key: derivativeKey(copy, 'design') });
    expect(look?.px).toBeDefined(); // a design's real size goes with it (print quality)
    // see-through where the paper was: the design is the cut-out, not the drawing on its paper
    expect((await sharp(await getObjectBytes(look!.key)).metadata()).hasAlpha).toBe(true);

    // originals are sacred: the keepsake it came from, and its untouched drawing, are as they were
    const after = await original(src);
    expect(after.sha256).toBe(before.sha256);
    expect(await editedLook(db, src)).toMatchObject({ key: derivativeKey(src, 'cutout') });
  });

  it('the picker’s own "remove background" (a new keepsake) reopens on its cut-out too', async () => {
    const src = await keepsake();
    const r = await copyWithoutBackground(db, await sam(), src, { keepEnclosedPaper: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    made.push(r.assetId);
    expect(await editedLook(db, r.assetId)).toMatchObject({ key: derivativeKey(r.assetId, 'cutout') });
    expect(await editedLook(db, src)).toBeNull(); // the keepsake it came from is still just the drawing
  });

  it('never cut out, or a cut-out made and never saved: it opens as the plain drawing', async () => {
    const plain = await keepsake();
    expect(await editedLook(db, plain)).toBeNull();
    const stale = await keepsake();
    await removeBackgroundForAsset(db, await sam(), stale, { keepEnclosedPaper: true }); // made… and never used
    expect(await editedLook(db, stale)).toBeNull();
    // and a Studio save that put the background back leaves no cut-out to reopen on
    const back = await keepsake();
    await cutOutInStudio(back);
    await saveStudio(db, await sam(), back, { mask: null, geometry: IDENTITY_GEOMETRY, objects: [], clearCutout: true }, { moderation: clean });
    expect(await editedLook(db, back)).toBeNull();
    const [row] = await db.select({ doc: assets.studioDoc }).from(assets).where(eq(assets.id, back));
    expect(row?.doc).toBeTruthy();
  });
});
