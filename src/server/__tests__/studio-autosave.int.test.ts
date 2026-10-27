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
import { ingestOriginalAsset } from '@/server/ingest';
import { autosaveStudioDoc, IDENTITY_GEOMETRY, saveStudio, StudioTextError, studioStateForAsset } from '@/server/studio-doc';
import { applyLook, IDENTITY_LOOK } from '@/lib/studio-look';
import { derivativeKey, getObjectBytes } from '@/storage';
import type { ModerationProviders } from '@/server/moderation';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const drawing = () =>
  sharp({ create: { width: 200, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{ input: { create: { width: 40, height: 40, channels: 3, background: { r: 30, g: 90, b: 200 } } }, left: 20, top: 30 }])
    .png()
    .toBuffer();
const halfMask = () =>
  sharp({ create: { width: 200, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite([{ input: { create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } } }, left: 0, top: 0 }])
    .png()
    .toBuffer();

/** Autosave keeps the recipe (and the mask) as the parent works — cheap, gated, non-destructive. */
describe.skipIf(!DB || !S3)('studio autosave', () => {
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

  const classes = async (assetId: string) => (await db.select().from(storageObjects).where(eq(storageObjects.assetId, assetId))).map((o) => o.key.split('/').pop());

  it('stores the recipe + mask so the studio reopens as left; renders no design; the original is untouched', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await drawing(), keptInHome: true });
    const before = await getObjectBytes(a.key);
    const objects = [{ id: 't', type: 'text', text: 'Mia', font: 'baloo', colour: '#2b2118', size: 0.2, x: 0.5, y: 0.2, rotation: 0, texture: 'smooth' }];
    await autosaveStudioDoc(db, sam, a.assetId, { mask: await halfMask(), geometry: { ...IDENTITY_GEOMETRY, rotate: 90, flipH: true }, objects });

    const st = await studioStateForAsset(db, sam, a.assetId);
    expect(st.geometry).toMatchObject({ rotate: 90, flipH: true });
    expect(st.objects.map((o) => o.type)).toEqual(['text']);
    expect(st.mask).not.toBeNull();
    const keys = await classes(a.assetId);
    expect(keys.some((k) => k?.includes('cutout'))).toBe(true);
    expect(keys.some((k) => k?.includes('design'))).toBe(false); // nothing rendered until "done"
    expect(Buffer.compare(await getObjectBytes(a.key), before)).toBe(0);

    // everything brought back → the cutout goes, so it can't reopen stale
    await autosaveStudioDoc(db, sam, a.assetId, { mask: null, geometry: IDENTITY_GEOMETRY, objects: [], clearCutout: true });
    expect((await classes(a.assetId)).some((k) => k?.includes('cutout'))).toBe(false);
    const [row] = await db.select({ doc: assets.studioDoc }).from(assets).where(eq(assets.id, a.assetId));
    expect(row!.doc).toMatchObject({ rotate: 0, objects: [] });
  });

  it('never trusts the browser: junk is cleaned, abusive words aren’t saved, strangers are refused', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await drawing(), keptInHome: true });
    await autosaveStudioDoc(db, sam, a.assetId, { mask: null, geometry: { rotate: 'x', crop: { x: -4, y: 0, w: 9, h: 1 } } as never, objects: [{ type: 'nope' }] });
    const st = await studioStateForAsset(db, sam, a.assetId);
    expect(st.geometry).toMatchObject({ rotate: 0, crop: { x: 0, y: 0, w: 1, h: 1 } });
    expect(st.objects).toEqual([]);

    const rude = [{ id: 't', type: 'text', text: 'a shit message', font: 'caveat', colour: '#2b2118', size: 0.1, x: 0.5, y: 0.5, rotation: 0 }];
    await expect(autosaveStudioDoc(db, sam, a.assetId, { mask: null, geometry: IDENTITY_GEOMETRY, objects: rude })).rejects.toBeInstanceOf(StudioTextError);
    expect((await studioStateForAsset(db, sam, a.assetId)).objects).toEqual([]);

    const blake = await resolveViewerContext(db, ids.blakeId, ids.hartleyId);
    await expect(autosaveStudioDoc(db, blake, a.assetId, { mask: null, geometry: IDENTITY_GEOMETRY })).rejects.toBeInstanceOf(AuthzError);
  });

  it('a look is a recipe number: it reopens, renders into the design exactly as previewed, and the design is screened', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await drawing(), keptInHome: true });
    const before = await getObjectBytes(a.key);
    const look = { ...IDENTITY_LOOK, brightness: 30, warmth: 40, filter: 'pastel' as const, intensity: 60 };
    let seen = 0;
    const moderation: ModerationProviders = { hash: { isKnownIllegal: async () => false }, classifier: { classify: async () => (seen++, { flagged: false, labels: [] }) }, textReader: { read: async () => [] } };
    const res = await saveStudio(db, sam, a.assetId, { mask: null, geometry: IDENTITY_GEOMETRY, look }, { moderation });
    expect(res.sourceObjectId).not.toBeNull();
    expect(seen).toBe(1);
    expect((await studioStateForAsset(db, sam, a.assetId)).look).toEqual(look);

    const design = await sharp(await getObjectBytes(derivativeKey(a.assetId, 'design'))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const orig = await sharp(before).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([design.info.width, design.info.height]).toEqual([orig.info.width, orig.info.height]);
    const expected = new Uint8ClampedArray(orig.data);
    applyLook(expected, 4, look);
    expect(Buffer.compare(design.data, Buffer.from(expected))).toBe(0); // the browser's numbers, pixel for pixel
    expect(Buffer.compare(await getObjectBytes(a.key), before)).toBe(0); // original untouched

    // back to how it was → the plain original again, nothing stale left
    const back = await saveStudio(db, sam, a.assetId, { mask: null, geometry: IDENTITY_GEOMETRY, look: IDENTITY_LOOK }, { moderation });
    expect(back.sourceObjectId).toBeNull();
    expect((await studioStateForAsset(db, sam, a.assetId)).look).toBeNull();
  });

  it('the drawing’s own layer: faded or hidden in the design (on its background), reopened as left', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await drawing(), keptInHome: true });
    const at = async (x: number, y: number) => {
      const { data, info } = await sharp(await getObjectBytes(derivativeKey(a.assetId, 'design'))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      return [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];
    };
    await saveStudio(db, sam, a.assetId, { mask: null, geometry: IDENTITY_GEOMETRY, drawing: { opacity: 0.5 } });
    expect((await at(40, 50))[3]).toBe(128); // the blue square, half see-through
    expect((await studioStateForAsset(db, sam, a.assetId)).drawing).toEqual({ opacity: 0.5 });

    await saveStudio(db, sam, a.assetId, { mask: null, geometry: { ...IDENTITY_GEOMETRY, background: '#ffffff' }, drawing: { hidden: true } });
    expect(await at(40, 50)).toEqual([255, 255, 255, 255]); // hidden: just the background prints
    expect((await studioStateForAsset(db, sam, a.assetId)).drawing).toEqual({ hidden: true });
  });

  it('framed in gold: the frame prints round the cropped design and reopens; a sticker reopens as a sticker', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await drawing(), keptInHome: true });
    const moderation: ModerationProviders = { hash: { isKnownIllegal: async () => false }, classifier: { classify: async () => ({ flagged: false, labels: [] }) }, textReader: { read: async () => [] } };
    const objects = [{ id: 's', type: 'sticker', sticker: 'star', x: 0.7, y: 0.5, w: 0.3, h: 0.3, rotation: 0 }];
    await saveStudio(db, sam, a.assetId, { mask: null, geometry: { ...IDENTITY_GEOMETRY, crop: { x: 0.1, y: 0, w: 0.8, h: 1 } }, objects, frame: 'gold' }, { moderation });
    const { data, info } = await sharp(await getObjectBytes(derivativeKey(a.assetId, 'design'))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 3)];
    expect(at(0, Math.round(info.height / 2))).toEqual([43, 33, 24]); // ink edge of the frame
    expect(at(Math.round(info.width / 2), Math.round(info.height * 0.06 * 0.25))).toEqual([246, 196, 69]); // the honey band
    const st = await studioStateForAsset(db, sam, a.assetId);
    expect(st.frame).toBe('gold');
    expect(st.objects).toMatchObject([{ type: 'sticker', sticker: 'star' }]);
  });
});
