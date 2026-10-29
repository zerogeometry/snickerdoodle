import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { assets, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError } from '@/authz';
import { getS3, putObject } from '@/storage';
import { loadCatalogue, seedCatalogue } from '@/server/catalogue';
import { resolveAssetViewer } from '@/server/assets';
import { BundlePreviewDenied, renderBundlePreview } from '@/server/print/bundleCompose';
import { composeMockup } from '@/server/print/compositor';
import { seedBundleLayouts } from '@/server/print/seedMockups';
import type { DbHandle } from '@/server/db';

const URL = process.env.DATABASE_URL;
// the founder's layers live only on a machine that has them staged (gitignored)
const LAYERS = existsSync(path.join(process.cwd(), '.prodigi-assets', 'blanks', 'layered', 'christmasBundle', 'thumb', 'manifest.json'));

// The CHRISTMAS FAMILY BUNDLE's pictures against Postgres + storage: the seed stores each layout, the
// catalogue tile renders (behind composeMockup's authz gate) and is cached, and the builder's picture
// checks EVERY drawing before reading any of it.
describe.skipIf(!URL || !LAYERS)('christmas family bundle pictures — integration', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const assetIds: string[] = [];

  beforeAll(async () => {
    client = postgres(URL!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
    expect(await seedBundleLayouts(db)).toBe(2 + 2 + 2 + (1 + 1 + 2) + (1 + 1 + 4) + (1 + 1 + 8)); // print areas over the four layouts
  }, 120_000);
  afterAll(async () => {
    if (assetIds.length) await db.delete(assets).where(inArray(assets.id, assetIds));
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  // a brand-safe drawing (a flat colour), stored as an ORIGINAL like an upload
  const drawing = async (rgb: [number, number, number]) => {
    const [a] = await db
      .insert(assets)
      .values({ familyId: ids.hartleyId, kind: 'DRAWING', uploaderAccountId: ids.samId, controllerAccountId: ids.samId, visibility: 'FAMILY', keptInHome: true, moderationStatus: 'CLEAR' })
      .returning();
    assetIds.push(a!.id);
    const png = await sharp({ create: { width: 600, height: 420, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }).png().toBuffer();
    const key = `assets/${a!.id}/original.png`;
    await putObject(key, png, 'image/png');
    await db.insert(storageObjects).values({ assetId: a!.id, objectClass: 'ORIGINAL', bucket: getS3().bucket, key, contentType: 'image/png', byteSize: png.byteLength });
    return a!.id;
  };

  it('the builder picture: renders a set for 4 for its owner, fast enough, and is never stored', async () => {
    const [p, o] = [await drawing([220, 40, 40]), await drawing([40, 90, 220])];
    const before = (await db.select({ id: storageObjects.id }).from(storageObjects).where(inArray(storageObjects.assetId, [p, o]))).length;
    const out = await renderBundlePreview(db, { accountId: ids.samId, uploadClaims: [] }, { layout: 'x4', placemat: { assetId: p }, coaster: null, ornaments: [{ assetId: o }, { assetId: p }, { assetId: o }, { assetId: p }] });
    expect(out).not.toBeNull();
    const m = await sharp(out!.webp).metadata();
    expect([m.format, m.width, m.height]).toEqual(['webp', 768, 768]);
    const after = (await db.select({ id: storageObjects.id }).from(storageObjects).where(inArray(storageObjects.assetId, [p, o]))).length;
    expect(after).toBe(before); // nothing written for a picture made of several drawings
  });

  it('the builder picture refuses if ANY drawing isn’t the viewer’s — before reading a byte', async () => {
    const mine = await drawing([200, 200, 40]);
    await expect(renderBundlePreview(db, { accountId: ids.samId, uploadClaims: [] }, { layout: 'x2', placemat: { assetId: mine }, coaster: null, ornaments: [{ assetId: ids.assetBloomFamily }, { assetId: mine }] })).rejects.toBeInstanceOf(BundlePreviewDenied);
    await expect(renderBundlePreview(db, { accountId: ids.samId, uploadClaims: [] }, { layout: 'x2', placemat: { assetId: mine }, coaster: { assetId: ids.assetBloomFamily }, ornaments: [] })).rejects.toBeInstanceOf(BundlePreviewDenied);
    await expect(renderBundlePreview(db, { accountId: null, uploadClaims: [] }, { layout: 'x2', placemat: { assetId: mine }, coaster: null, ornaments: [] })).rejects.toBeInstanceOf(BundlePreviewDenied);
  });

  it('the catalogue tile: the one drawing on every piece, behind the authz gate, cached as that drawing’s derivative', async () => {
    const mine = await drawing([60, 160, 80]);
    const bundle = (await loadCatalogue(db, { includeHidden: true })).find((x) => x.key === 'christmasBundle')!;
    const variantId = bundle.variants.find((v) => v.isDefault)!.id;
    const viewer = await resolveAssetViewer(db, mine, ids.samId, []);
    const first = await composeMockup(db, viewer, { assetId: mine, variantId, transform: {}, size: 'thumb' });
    expect(first).toMatchObject({ cached: false, widthPx: 512, heightPx: 512, format: 'webp' });
    const again = await composeMockup(db, viewer, { assetId: mine, variantId, transform: {}, size: 'thumb' });
    expect(again).toMatchObject({ cached: true, mockupObjectId: first.mockupObjectId });
    // a stranger gets nothing
    const stranger = await resolveAssetViewer(db, mine, ids.malloryId, []);
    await expect(composeMockup(db, stranger, { assetId: mine, variantId, transform: {}, size: 'thumb' })).rejects.toBeInstanceOf(AuthzError);
  });
});
