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
import { IDENTITY_GEOMETRY, saveStudio, StudioTextError, studioStateForAsset } from '@/server/studio-doc';
import { derivativeKey, getObjectBytes } from '@/storage';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const drawing = () =>
  sharp({ create: { width: 200, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{ input: { create: { width: 40, height: 40, channels: 3, background: { r: 30, g: 90, b: 200 } } }, left: 20, top: 30 }])
    .png()
    .toBuffer();

/** The Studio saves a recipe + a full-resolution design; the original is never changed. */
describe.skipIf(!DB || !S3)('studio save — non-destructive design', () => {
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

  it('rotating + masking makes a rotated, see-through design; the original is untouched; it reopens as left', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await drawing(), keptInHome: true });
    const originalBefore = await getObjectBytes(a.key);

    // mask: keep only the left half
    const mask = await sharp({ create: { width: 200, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .composite([{ input: { create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } } }, left: 0, top: 0 }])
      .png()
      .toBuffer();
    const res = await saveStudio(db, sam, a.assetId, { mask, geometry: { ...IDENTITY_GEOMETRY, rotate: 90 } });
    expect(res.sourceObjectId).not.toBeNull();
    expect(res.aspect).toBeCloseTo(100 / 200, 2); // rotated: tall now

    const design = await getObjectBytes(derivativeKey(a.assetId, 'design'));
    const meta = await sharp(design).metadata();
    expect([meta.width, meta.height]).toEqual([100, 200]);
    expect(meta.hasAlpha).toBe(true);
    expect(Buffer.compare(await getObjectBytes(a.key), originalBefore)).toBe(0); // original untouched

    const st = await studioStateForAsset(db, sam, a.assetId);
    expect(st.geometry.rotate).toBe(90);
    expect(st.mask).not.toBeNull();

    // start again → back to the plain original, no stale cutout or design left
    const back = await saveStudio(db, sam, a.assetId, { mask: null, geometry: IDENTITY_GEOMETRY, clearCutout: true });
    expect(back.sourceObjectId).toBeNull();
    const derivs = await db.select().from(storageObjects).where(eq(storageObjects.assetId, a.assetId));
    expect(derivs.map((d) => d.objectClass)).toEqual(['ORIGINAL']);
    const [row] = await db.select({ doc: assets.studioDoc }).from(assets).where(eq(assets.id, a.assetId));
    expect(row!.doc).toMatchObject({ rotate: 0 });
  });

  it('someone outside the family can’t save or read the studio', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await drawing(), keptInHome: true });
    const blake = await resolveViewerContext(db, ids.blakeId, ids.hartleyId);
    await expect(saveStudio(db, blake, a.assetId, { mask: null, geometry: IDENTITY_GEOMETRY })).rejects.toBeInstanceOf(AuthzError);
    await expect(studioStateForAsset(db, blake, a.assetId)).rejects.toBeInstanceOf(AuthzError);
  });

  it('a filled background turns the see-through parts that colour, at full resolution', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await drawing(), keptInHome: true });
    const mask = await sharp({ create: { width: 200, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .composite([{ input: { create: { width: 40, height: 40, channels: 3, background: { r: 255, g: 255, b: 255 } } }, left: 20, top: 30 }])
      .png()
      .toBuffer();
    const res = await saveStudio(db, sam, a.assetId, { mask, geometry: { ...IDENTITY_GEOMETRY, background: '#2f5da8' } });
    expect(res.sourceObjectId).not.toBeNull();
    const { data, info } = await sharp(await getObjectBytes(derivativeKey(a.assetId, 'design'))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];
    expect(at(150, 50)).toEqual([47, 93, 168, 255]); // was see-through → now the chosen blue
    expect(at(40, 50)[3]).toBe(255);
    const st = await studioStateForAsset(db, sam, a.assetId);
    expect(st.geometry.background).toBe('#2f5da8');
  });

  it('added words + shapes are drawn into the design at full size and reopen as editable objects', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await drawing(), keptInHome: true });
    const objects = [
      { id: 's', type: 'shape', shape: 'square', fill: '#d7352c', outline: false, x: 0.75, y: 0.5, w: 0.3, h: 0.3, rotation: 0 },
      { id: 't', type: 'text', text: 'Mia', font: 'baloo', colour: '#2b2118', size: 0.2, x: 0.5, y: 0.2, rotation: 0 },
    ];
    const res = await saveStudio(db, sam, a.assetId, { mask: null, geometry: IDENTITY_GEOMETRY, objects });
    expect(res.sourceObjectId).not.toBeNull();
    const { data, info } = await sharp(await getObjectBytes(derivativeKey(a.assetId, 'design'))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBeGreaterThanOrEqual(600); // small designs are upscaled so overlays print crisp
    const at = (fx: number, fy: number) => {
      const i = (Math.round(fy * info.height) * info.width + Math.round(fx * info.width)) * 4;
      return [...data.subarray(i, i + 3)];
    };
    expect(at(0.75, 0.5)).toEqual([215, 53, 44]); // the red square
    const st = await studioStateForAsset(db, sam, a.assetId);
    expect(st.objects.map((o) => o.type)).toEqual(['shape', 'text']);
  });

  it('abusive words never reach a design', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await drawing(), keptInHome: true });
    const objects = [{ id: 't', type: 'text', text: 'a shit message', font: 'caveat', colour: '#2b2118', size: 0.1, x: 0.5, y: 0.5, rotation: 0 }];
    await expect(saveStudio(db, sam, a.assetId, { mask: null, geometry: IDENTITY_GEOMETRY, objects })).rejects.toBeInstanceOf(StudioTextError);
    const derivs = await db.select().from(storageObjects).where(eq(storageObjects.assetId, a.assetId));
    expect(derivs.map((d) => d.objectClass)).toEqual(['ORIGINAL']);
  });
});
