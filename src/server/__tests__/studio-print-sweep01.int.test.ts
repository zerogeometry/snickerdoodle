import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { productVariants, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { seedCatalogue } from '@/server/catalogue';
import { IDENTITY_GEOMETRY, saveStudio } from '@/server/studio-doc';
import { renderPrintFile } from '@/server/print/render';
import { deleteObject, getObjectBytes } from '@/storage';
import type { DbHandle } from '@/server/db';
import type { ModerationProviders } from '@/server/moderation';

/**
 * Test sweep 29 Oct — tester 01: a Studio design reaches the PRINT FILE as it was designed. A lopsided
 * drawing (red top-left, blue bottom-right) is flipped sideways, given a black square in the middle
 * (an added shape) and saved; the framed print's print file (renderPrintFile — what Prodigi gets) must
 * carry the mirror image with the square, at the template's exact canvas, while the original stays
 * byte-for-byte what was uploaded.
 */
const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const clean: ModerationProviders = { hash: { isKnownIllegal: async () => false }, classifier: { classify: async () => ({ flagged: false, labels: [] }) }, textReader: { read: async () => [] } };

const lopsided = () =>
  sharp({ create: { width: 2400, height: 2400, channels: 3, background: { r: 251, g: 245, b: 233 } } })
    .composite([
      { input: { create: { width: 600, height: 600, channels: 3, background: { r: 200, g: 64, b: 42 } } }, left: 240, top: 240 },
      { input: { create: { width: 600, height: 600, channels: 3, background: { r: 47, g: 93, b: 168 } } }, left: 1560, top: 1560 },
    ])
    .png()
    .toBuffer();

describe.skipIf(!DB || !S3)('studio design → print file (sweep 01)', () => {
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

  it('flip + an added square: the print file is the mirror image with the square; the original is untouched', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const a = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await lopsided(), keptInHome: true });
    keys.push(a.key);
    const [orig0] = await db.select().from(storageObjects).where(and(eq(storageObjects.assetId, a.assetId), eq(storageObjects.objectClass, 'ORIGINAL')));

    const square = [{ id: 'sq', type: 'shape', shape: 'square', fill: '#000000', stroke: '#000000', strokeWidth: 0, texture: 'smooth', x: 0.5, y: 0.5, w: 0.16, h: 0.16, rotation: 0 }];
    const saved = await saveStudio(db, sam, a.assetId, { mask: null, geometry: { ...IDENTITY_GEOMETRY, flipH: true }, objects: square }, { moderation: clean });
    expect(saved.sourceObjectId).toBeTruthy();

    const res = await renderPrintFile(db, sam, { assetId: a.assetId, variantId, transform: { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 }, sourceObjectId: saved.sourceObjectId! });
    keys.push(res.key);
    const file = await getObjectBytes(res.key);
    const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([res.widthPx, res.heightPx]);
    // CONTAIN: the square design sits across the full width, centred top-to-bottom
    const side = Math.min(info.width, info.height);
    const left = (info.width - side) / 2, top = (info.height - side) / 2;
    const at = (fx: number, fy: number) => {
      const i = (Math.round(top + fy * side) * info.width + Math.round(left + fx * side)) * 3;
      return [data[i]!, data[i + 1]!, data[i + 2]!];
    };
    const near = (p: number[], q: number[]) => p.reduce((s, v, i) => s + Math.abs(v - q[i]!), 0) < 60;
    expect(near(at(0.77, 0.23), [200, 64, 42]), `red is top-RIGHT after the flip (${at(0.77, 0.23)})`).toBe(true);
    expect(near(at(0.23, 0.23), [251, 245, 233]), `paper top-left (${at(0.23, 0.23)})`).toBe(true);
    expect(near(at(0.23, 0.77), [47, 93, 168]), `blue bottom-LEFT (${at(0.23, 0.77)})`).toBe(true);
    expect(near(at(0.5, 0.5), [0, 0, 0]), `the added square in the middle (${at(0.5, 0.5)})`).toBe(true);

    // the original: same object, same bytes, still unflipped
    const [orig1] = await db.select().from(storageObjects).where(and(eq(storageObjects.assetId, a.assetId), eq(storageObjects.objectClass, 'ORIGINAL')));
    expect(orig1!.id).toBe(orig0!.id);
    expect(orig1!.sha256).toBe(orig0!.sha256);
    const o = await sharp(await getObjectBytes(orig1!.key)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const oi = (Math.round(0.23 * 2400) * 2400 + Math.round(0.23 * 2400)) * 3;
    expect([o.data[oi], o.data[oi + 1], o.data[oi + 2]]).toEqual([200, 64, 42]);
  });
});
