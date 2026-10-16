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
import { applyGeometry, cleanGeometry, IDENTITY_GEOMETRY, saveStudio, StudioTextError, studioStateForAsset } from '@/server/studio-doc';
import { rotatedSize } from '@/lib/studio-geometry';
import { derivativeKey, getObjectBytes } from '@/storage';
import type { DbHandle } from '@/server/db';
import type { ModerationProviders } from '@/server/moderation';

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
      { id: 's', type: 'shape', shape: 'square', fill: '#d7352c', stroke: '#2b2118', strokeWidth: 0, texture: 'smooth', x: 0.75, y: 0.5, w: 0.3, h: 0.3, rotation: 0 },
      { id: 't', type: 'text', text: 'Mia', font: 'baloo', colour: '#2b2118', size: 0.2, x: 0.5, y: 0.2, rotation: 0, texture: 'crayon' },
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

  describe('anything drawn or added is screened before it can be printed', () => {
    const pen = [{ id: 'p', type: 'stroke', colour: '#111111', width: 0.03, points: [0.2, 0.5, 0.5, 0.8, 0.5, 0.5], texture: 'smooth' }];
    const providers = (o: { flag?: boolean; words?: string[] | 'fail' }): ModerationProviders & { seen: number } => {
      const p = {
        seen: 0,
        hash: { isKnownIllegal: async () => false },
        classifier: {
          classify: async () => {
            p.seen++;
            return { flagged: !!o.flag, labels: o.flag ? ['Illustrated Explicit Nudity'] : [] };
          },
        },
        textReader: {
          read: async () => {
            if (o.words === 'fail') throw new Error('ocr down');
            return o.words ?? [];
          },
        },
      };
      return p;
    };
    const status = async (id: string) => (await db.select({ s: assets.moderationStatus, d: assets.moderationDetail }).from(assets).where(eq(assets.id, id)))[0]!;

    it('a flagged drawing holds the keepsake back for review (never deleted); removing it clears it again', async () => {
      const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
      const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await drawing(), keptInHome: true });
      expect((await status(a.assetId)).s).toBe('CLEAR');

      const flagging = providers({ flag: true });
      await saveStudio(db, sam, a.assetId, { mask: null, geometry: IDENTITY_GEOMETRY, objects: pen }, { moderation: flagging });
      expect(flagging.seen).toBe(1);
      const held = await status(a.assetId);
      expect(held.s).toBe('FLAGGED');
      expect(held.d).toMatchObject({ original: { status: 'CLEAR' }, design: { status: 'FLAGGED', labels: ['Illustrated Explicit Nudity'] } });
      expect(await getObjectBytes(derivativeKey(a.assetId, 'design'))).toBeTruthy(); // preserved for review, not binned

      // the parent removes what they drew → just the (clean) upload again
      await saveStudio(db, sam, a.assetId, { mask: null, geometry: IDENTITY_GEOMETRY, objects: [] }, { moderation: providers({}) });
      expect((await status(a.assetId)).s).toBe('CLEAR');
    });

    it('words drawn by hand get the same abuse screen as typed words; an unreadable design goes to review', async () => {
      const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
      const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await drawing(), keptInHome: true });
      await saveStudio(db, sam, a.assetId, { mask: null, geometry: IDENTITY_GEOMETRY, objects: pen }, { moderation: providers({ words: ['SHIT'] }) });
      expect((await status(a.assetId)).s).toBe('FLAGGED');
      await saveStudio(db, sam, a.assetId, { mask: null, geometry: IDENTITY_GEOMETRY, objects: pen }, { moderation: providers({ words: ['MUM', 'I', 'LOVE', 'YOU'] }) });
      expect((await status(a.assetId)).s).toBe('CLEAR');
      await saveStudio(db, sam, a.assetId, { mask: null, geometry: IDENTITY_GEOMETRY, objects: pen }, { moderation: providers({ words: 'fail' }) });
      expect((await status(a.assetId)).s).toBe('FLAGGED');
    });

    it('a clean design can never clear a flagged upload', async () => {
      const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
      const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await drawing(), keptInHome: true });
      await db.update(assets).set({ moderationStatus: 'FLAGGED', moderationDetail: { labels: ['x'], original: { status: 'FLAGGED', labels: ['x'] } } }).where(eq(assets.id, a.assetId));
      await saveStudio(db, sam, a.assetId, { mask: null, geometry: IDENTITY_GEOMETRY, objects: pen }, { moderation: providers({}) });
      expect((await status(a.assetId)).s).toBe('FLAGGED');
      await saveStudio(db, sam, a.assetId, { mask: null, geometry: IDENTITY_GEOMETRY, objects: [] }, { moderation: providers({}) });
      expect((await status(a.assetId)).s).toBe('FLAGGED');
    });

    it('rotating or cropping alone adds nothing new, so it isn’t re-screened', async () => {
      const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
      const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await drawing(), keptInHome: true });
      const p = providers({ flag: true });
      await saveStudio(db, sam, a.assetId, { mask: null, geometry: { ...IDENTITY_GEOMETRY, rotate: 90 } }, { moderation: p });
      expect(p.seen).toBe(0);
      expect((await status(a.assetId)).s).toBe('CLEAR');
    });
  });

  describe('free turns and an unlocked drawing — the print matches the shared maths', () => {
    const alphaAt = async (buf: Buffer) => {
      const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      return { w: info.width, h: info.height, a: (x: number, y: number) => data[(Math.round(y) * info.width + Math.round(x)) * 4 + 3]! };
    };
    const solid = () => sharp({ create: { width: 400, height: 200, channels: 4, background: { r: 30, g: 90, b: 200, alpha: 1 } } }).png().toBuffer();

    it('a 30 degree turn: the frame is the turned box, corners see-through, middle solid', async () => {
      const g = cleanGeometry({ ...IDENTITY_GEOMETRY, rotate: 30 });
      const out = await applyGeometry(await solid(), g);
      const [fw, fh] = rotatedSize(400, 200, 30);
      expect([out.width, out.height]).toEqual([Math.round(fw), Math.round(fh)]);
      const px = await alphaAt(out.buffer);
      expect(px.a(2, 2)).toBe(0);
      expect(px.a(out.width / 2, out.height / 2)).toBe(255);
    });

    it('an unlocked drawing at half size, moved left: the frame stays, the drawing sits where placed', async () => {
      const g = cleanGeometry({ ...IDENTITY_GEOMETRY, place: { x: 0.3, y: 0.5, scale: 0.5, angle: 0 } });
      const out = await applyGeometry(await solid(), g);
      expect([out.width, out.height]).toEqual([400, 200]); // same frame
      const px = await alphaAt(out.buffer);
      expect(px.a(120, 100)).toBe(255); // centre of the drawing: 0.3 x 400
      expect(px.a(10, 100)).toBe(0); // left of it (it spans 20-220)
      expect(px.a(300, 100)).toBe(0); // right of it
      expect(px.a(120, 20)).toBe(0); // above it (it spans 50-150)
    });

    it('cleans whatever the browser sends: any angle to 0.1 degree, junk dropped', () => {
      expect(cleanGeometry({ rotate: 37.46 }).rotate).toBe(37.5);
      expect(cleanGeometry({ rotate: -90 }).rotate).toBe(270);
      expect(cleanGeometry({ rotate: 'sideways' }).rotate).toBe(0);
      expect(cleanGeometry({ rotate: 0, place: { x: 0.5, y: 0.5, scale: 1, angle: 0 } }).place).toBeNull();
    });

    it('a turned design saves, prints the turned frame, and reopens at that angle', async () => {
      const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
      const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await drawing(), keptInHome: true });
      const res = await saveStudio(db, sam, a.assetId, { mask: null, geometry: { ...IDENTITY_GEOMETRY, rotate: 12.5, place: { x: 0.45, y: 0.5, scale: 0.8, angle: 5 } } });
      expect(res.sourceObjectId).not.toBeNull();
      const [fw, fh] = rotatedSize(200, 100, 12.5);
      const meta = await sharp(await getObjectBytes(derivativeKey(a.assetId, 'design'))).metadata();
      expect([meta.width, meta.height]).toEqual([Math.round(fw), Math.round(fh)]);
      const st = await studioStateForAsset(db, sam, a.assetId);
      expect(st.geometry.rotate).toBe(12.5);
      expect(st.geometry.place).toMatchObject({ x: 0.45, scale: 0.8, angle: 5 });
    });
  });
});
