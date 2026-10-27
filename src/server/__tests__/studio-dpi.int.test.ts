import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { assets, printTemplates, productVariants, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { seedCatalogue } from '@/server/catalogue';
import { IDENTITY_GEOMETRY, saveStudio } from '@/server/studio-doc';
import { assessResolution } from '@/server/print/geometry';
import { printSourceDims } from '@/server/print/sourceDims';
import { renderPrintFile } from '@/server/print/render';
import { deleteObject, getObjectBytes } from '@/storage';
import type { DbHandle } from '@/server/db';
import type { ModerationProviders } from '@/server/moderation';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const clean: ModerationProviders = { hash: { isKnownIllegal: async () => false }, classifier: { classify: async () => ({ flagged: false, labels: [] }) }, textReader: { read: async () => [] } };
const tiny = () =>
  sharp({ create: { width: 400, height: 266, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{ input: { create: { width: 80, height: 80, channels: 3, background: { r: 30, g: 90, b: 200 } } }, left: 40, top: 40 }])
    .png()
    .toBuffer();
const shape = [{ id: 's', type: 'shape', shape: 'square', fill: '#d7352c', stroke: '#2b2118', strokeWidth: 0, texture: 'smooth', x: 0.75, y: 0.5, w: 0.3, h: 0.3, rotation: 0 }];
const cover = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 };

/**
 * REGRESSION (gap audit, 27 Oct): a design with stickers / words is stored enlarged (up to 4×) so they
 * print crisp. The print-quality gate must judge the DRAWING's real pixels — adding a sticker must
 * never lift a too-small drawing over the print floor.
 */
describe.skipIf(!DB || !S3)('studio design → the print-quality gate judges the real drawing', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  let variantId = '';
  const keys: string[] = [];

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
    const [v] = await db.select().from(productVariants).where(eq(productVariants.sku, 'framedPrint'));
    variantId = v!.id;
  });
  afterAll(async () => {
    for (const k of keys) await deleteObject(k).catch(() => {});
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  async function designOf(sourceObjectId: string) {
    const [design] = await db.select().from(storageObjects).where(eq(storageObjects.id, sourceObjectId));
    keys.push(design!.key);
    const file = await sharp(await getObjectBytes(design!.key)).metadata();
    return { design: design!, file: { width: file.width!, height: file.height! } };
  }

  it('an added thing on a too-small drawing: the file is enlarged, the gate still sees the drawing — and blocks', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await tiny(), keptInHome: true });
    keys.push(a.key);
    const res = await saveStudio(db, sam, a.assetId, { mask: null, geometry: IDENTITY_GEOMETRY, objects: shape }, { moderation: clean });
    expect(res.realPx).toEqual({ width: 400, height: 266 });

    const { design, file } = await designOf(res.sourceObjectId!);
    expect(file.width).toBeGreaterThanOrEqual(1600); // enlarged for crisp overlays
    expect(await printSourceDims(db, a.assetId, design, file)).toEqual({ width: 400, height: 266 }); // …judged as the drawing

    const [tpl] = await db.select().from(printTemplates).where(eq(printTemplates.variantId, variantId));
    const geom = { printWidthPx: tpl!.printWidthPx, printHeightPx: tpl!.printHeightPx, bleedMm: tpl!.bleedMm, requiredDpi: tpl!.requiredDpi };
    expect(assessResolution(geom, { width: 400, height: 266 }, cover).decision).toBe('BLOCK'); // the drawing alone can't print
    expect(assessResolution(geom, file, cover).decision).not.toBe('BLOCK'); // the bug: the enlarged file "could"
    await expect(renderPrintFile(db, sam, { assetId: a.assetId, variantId, transform: cover, sourceObjectId: res.sourceObjectId! })).rejects.toThrow(/too low-res/);
  });

  it('a stale record (other bytes) or none, with added things: judged at the most it could have been enlarged', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await tiny(), keptInHome: true });
    keys.push(a.key);
    const res = await saveStudio(db, sam, a.assetId, { mask: null, geometry: IDENTITY_GEOMETRY, objects: shape }, { moderation: clean });
    const { design, file } = await designOf(res.sourceObjectId!);
    const careful = { width: Math.round(file.width / 4), height: Math.round(file.height / 4) };
    expect(await printSourceDims(db, a.assetId, { ...design, sha256: 'someone-elses-bytes' }, file)).toEqual(careful);
    // a design saved before the record existed (its doc has the added things, no designPx)
    await db.update(assets).set({ studioDoc: { ...IDENTITY_GEOMETRY, objects: shape } }).where(eq(assets.id, a.assetId));
    expect(await printSourceDims(db, a.assetId, design, file)).toEqual(careful);
    // …and one with nothing added was never enlarged: its file IS the drawing
    await db.update(assets).set({ studioDoc: { ...IDENTITY_GEOMETRY, objects: [] } }).where(eq(assets.id, a.assetId));
    expect(await printSourceDims(db, a.assetId, design, file)).toEqual(file);
  });

  it('an original / a trim / a cutout is judged on its own file', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await tiny(), keptInHome: true });
    keys.push(a.key);
    expect(await printSourceDims(db, a.assetId, { key: a.key, sha256: null }, { width: 400, height: 266 })).toEqual({ width: 400, height: 266 });
  });

  it('a drawing scaled up inside its frame spreads its pixels thinner — judged that way too', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await tiny(), keptInHome: true });
    keys.push(a.key);
    const res = await saveStudio(db, sam, a.assetId, { mask: null, geometry: { ...IDENTITY_GEOMETRY, place: { x: 0.5, y: 0.5, scale: 2, angle: 0 } } }, { moderation: clean });
    if (res.sourceObjectId) await designOf(res.sourceObjectId);
    expect(res.realPx).toEqual({ width: 200, height: 133 });
  });
});
