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
import { DESIGN_MAX_ENLARGE, IDENTITY_GEOMETRY, saveStudio, autosaveStudioDoc, type DesignPx } from '@/server/studio-doc';
import { assessResolution } from '@/server/print/geometry';
import { getObjectBytes } from '@/storage';
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
const sticker = [{ id: 's', type: 'sticker', sticker: 'happyStar', x: 0.7, y: 0.5, size: 0.3, rotation: 0, flip: false }];
const recordOf = async (db: DbHandle, assetId: string) => {
  const [row] = await db.select({ doc: assets.studioDoc }).from(assets).where(eq(assets.id, assetId));
  return (row?.doc as { designPx?: DesignPx } | null)?.designPx ?? null;
};

/**
 * REGRESSION: a design with stickers/words is stored enlarged (up to 4×) so they print crisp. The
 * print-quality gate must judge the DRAWING's real pixels — adding a sticker must never lift a
 * too-small drawing over the print floor. The Studio's half of that: saveStudio records the real
 * pixel size WITH the design's content hash, as `studioDoc.designPx` = { width, height, sha256 } —
 * the record printSourceDims (src/server/print/upscale.ts) reads for every gate; no matching record
 * there means "judge it at the most it could have been enlarged" (÷ DESIGN_MAX_ENLARGE).
 */
describe.skipIf(!DB || !S3)('studio design → the real drawing is recorded for the DPI gate', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  let variantId = '';

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
    const [v] = await db.select().from(productVariants).where(eq(productVariants.sku, 'framedPrint'));
    variantId = v!.id;
  });
  afterAll(async () => {
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  it('a sticker on a too-small drawing: the file is enlarged, but the record is the drawing (bound to THIS design’s bytes)', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await tiny(), keptInHome: true });
    const res = await saveStudio(db, sam, a.assetId, { mask: null, geometry: IDENTITY_GEOMETRY, objects: sticker }, { moderation: clean });
    expect(res.realPx).toEqual({ width: 400, height: 266 });

    const [design] = await db.select().from(storageObjects).where(eq(storageObjects.id, res.sourceObjectId!));
    const file = await sharp(await getObjectBytes(design!.key)).metadata();
    expect(file.width).toBeGreaterThanOrEqual(1600); // enlarged for crisp overlays
    expect(file.width! / 400).toBeLessThanOrEqual(DESIGN_MAX_ENLARGE);
    expect(await recordOf(db, a.assetId)).toEqual({ width: 400, height: 266, sha256: design!.sha256 }); // …recorded as the drawing

    // why it matters: judged on the drawing it can't print; judged on the enlarged file it "could"
    const [tpl] = await db.select().from(printTemplates).where(eq(printTemplates.variantId, variantId));
    const geom = { printWidthPx: tpl!.printWidthPx, printHeightPx: tpl!.printHeightPx, bleedMm: tpl!.bleedMm, requiredDpi: tpl!.requiredDpi };
    const cover = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 as const };
    expect(assessResolution(geom, { width: 400, height: 266 }, cover).decision).toBe('BLOCK');
    expect(assessResolution(geom, { width: file.width!, height: file.height! }, cover).decision).not.toBe('BLOCK');
  });

  it('autosave keeps the record (the last saved design is still what prints); a plain save leaves none', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await tiny(), keptInHome: true });
    await saveStudio(db, sam, a.assetId, { mask: null, geometry: IDENTITY_GEOMETRY, objects: sticker }, { moderation: clean });
    const before = await recordOf(db, a.assetId);
    expect(before).not.toBeNull();

    await autosaveStudioDoc(db, sam, a.assetId, { mask: null, geometry: { ...IDENTITY_GEOMETRY, rotate: 90 }, objects: sticker });
    expect(await recordOf(db, a.assetId)).toEqual(before);

    // back to the plain original: no design, so no record vouching for one
    await saveStudio(db, sam, a.assetId, { mask: null, geometry: IDENTITY_GEOMETRY, objects: [] }, { moderation: clean });
    expect(await recordOf(db, a.assetId)).toBeNull();
  });

  it('a drawing scaled up inside its frame spreads its pixels thinner — recorded that way too', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await tiny(), keptInHome: true });
    const res = await saveStudio(db, sam, a.assetId, { mask: null, geometry: { ...IDENTITY_GEOMETRY, place: { x: 0.5, y: 0.5, scale: 2, angle: 0 } } }, { moderation: clean });
    expect(res.realPx).toEqual({ width: 200, height: 133 });
    expect(await recordOf(db, a.assetId)).toMatchObject({ width: 200, height: 133 });
  });
});
