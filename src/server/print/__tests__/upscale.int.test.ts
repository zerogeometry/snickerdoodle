import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { and, eq, inArray, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { mlOperations, productVariants, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError } from '@/authz';
import { resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { seedCatalogue } from '@/server/catalogue';
import { upscaleForPrint } from '@/server/magic';
import { renderPrintFile } from '@/server/print/render';
import { ensurePrintSharp, findPrintSharp, printSharpKey, resolvePrintSource } from '@/server/print/upscale';
import { resetSuperResForTests } from '@/ml/superRes';
import { deleteObject, derivativeKey, getObjectBytes } from '@/storage';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const COVER = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 };

/** A line drawing (brand-safe synthetic) of a given size. */
const drawing = (w: number, h: number) =>
  sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <rect width="${w}" height="${h}" fill="#fffdf6"/>
      <circle cx="${w / 2}" cy="${h / 2}" r="${h / 3}" fill="none" stroke="#2b2118" stroke-width="${Math.max(3, h / 40)}"/>
      <rect x="${w / 10}" y="${h / 10}" width="${w / 4}" height="${h / 12}" fill="#c8402a"/>
    </svg>`),
  )
    .png()
    .toBuffer();

// The mug (2469×1157 + 3mm bleed at 300dpi, floor 75dpi):
//   720×340 → ~83dpi → 3.6× short → tier 1 (super-resolution); 1400×660 → ≤2× → tier 0; 400×190 → blocked.
describe.skipIf(!DB || !S3)('print-sharp upscale — tiered, cached, original untouched (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  let mugId = '';
  const keys: string[] = [];

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
    const [v] = await db.select().from(productVariants).where(eq(productVariants.sku, 'mug'));
    mugId = v!.id;
  });

  afterEach(() => {
    delete process.env.SR_DISABLED;
    resetSuperResForTests();
  });

  afterAll(async () => {
    await db.delete(mlOperations).where(inArray(mlOperations.accountId, [ids.samId]));
    for (const k of keys) await deleteObject(k).catch(() => {});
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  const sam = () => resolveViewerContext(db, ids.samId, ids.hartleyId);
  async function ingest(w: number, h: number) {
    const r = await ingestOriginalAsset(db, await sam(), { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await drawing(w, h), keptInHome: true });
    keys.push(r.key);
    return r.assetId;
  }
  const original = async (assetId: string) =>
    (await db.select().from(storageObjects).where(and(eq(storageObjects.assetId, assetId), eq(storageObjects.objectClass, 'ORIGINAL'))))[0]!;

  it('one tap on a >2× placement makes the ×4 print-sharp copy; the render prints FROM it; the original is untouched', async () => {
    const assetId = await ingest(720, 340);
    const orig = await original(assetId);
    const before = sha(await getObjectBytes(orig.key));

    const res = await upscaleForPrint(db, await sam(), { assetId, variantId: mugId, transform: COVER });
    expect(res).toMatchObject({ state: 'ready', sharp: { method: 'super-res', factor: 4 }, pending: false });

    const copy = await findPrintSharp(db, assetId, orig);
    expect(copy).not.toBeNull();
    keys.push(copy!.key);
    const [row] = await db.select().from(storageObjects).where(eq(storageObjects.id, copy!.objectId));
    expect(row).toMatchObject({ objectClass: 'DERIVATIVE', exifStripped: true, assetId });
    expect(await sharp(await getObjectBytes(copy!.key)).metadata()).toMatchObject({ width: 2880, height: 1360 });

    // budget: the op is recorded once; a second tap is a cache hit (no new op, no new copy)
    const opsAfterFirst = await db.select().from(mlOperations).where(and(eq(mlOperations.assetId, assetId), eq(mlOperations.op, 'UPSCALE')));
    expect(opsAfterFirst).toHaveLength(1);
    expect(await upscaleForPrint(db, await sam(), { assetId, variantId: mugId, transform: COVER })).toMatchObject({ state: 'ready' });
    expect(await db.select().from(mlOperations).where(and(eq(mlOperations.assetId, assetId), eq(mlOperations.op, 'UPSCALE')))).toHaveLength(1);

    const render = await renderPrintFile(db, await sam(), { assetId, variantId: mugId, transform: COVER });
    keys.push(render.key);
    expect(render).toMatchObject({ upscaled: true, upscaleMethod: 'super-res' });
    expect(render.effectiveDpi).toBeLessThan(150); // the gate still reports the SOURCE's real dpi
    const srPrint = sha(await getObjectBytes(render.key));

    // the same placement with super-resolution off → classical → a different print file
    process.env.SR_DISABLED = '1';
    resetSuperResForTests();
    const classical = await renderPrintFile(db, await sam(), { assetId, variantId: mugId, transform: COVER });
    expect(classical.upscaleMethod).toBe('super-res'); // the copy already exists, so it's still used…
    await db.delete(storageObjects).where(eq(storageObjects.key, copy!.key)); // …until it's gone
    const fallback = await renderPrintFile(db, await sam(), { assetId, variantId: mugId, transform: COVER });
    expect(fallback.upscaleMethod).toBe('classical');
    expect(sha(await getObjectBytes(fallback.key))).not.toBe(srPrint);

    // the ORIGINAL: same bytes, same row
    expect(sha(await getObjectBytes(orig.key))).toBe(before);
    expect((await original(assetId)).sha256).toBe(orig.sha256);
  }, 180_000);

  it('a render with no tap still prints from super-resolution (fulfilment never ships the soft version)', async () => {
    const assetId = await ingest(720, 340);
    const render = await renderPrintFile(db, await sam(), { assetId, variantId: mugId, transform: COVER });
    keys.push(render.key);
    expect(render.upscaleMethod).toBe('super-res');
    const copy = await findPrintSharp(db, assetId, await original(assetId));
    expect(copy).not.toBeNull();
    keys.push(copy!.key);
  }, 180_000);

  it('the tap answers at once and finishes the copy in the background (deferred job)', async () => {
    const assetId = await ingest(720, 340);
    const jobs: Array<() => Promise<void>> = [];
    const res = await upscaleForPrint(db, await sam(), { assetId, variantId: mugId, transform: COVER }, { defer: (j) => jobs.push(j) });
    expect(res).toMatchObject({ state: 'ready', sharp: { method: 'super-res' }, pending: true });
    expect(jobs).toHaveLength(1);
    expect(await findPrintSharp(db, assetId, await original(assetId))).toBeNull(); // not yet
    await jobs[0]!();
    const copy = await findPrintSharp(db, assetId, await original(assetId));
    expect(copy).not.toBeNull();
    keys.push(copy!.key);
  }, 180_000);

  it('≤2× needs no copy (classical at render); nothing stored, no budget spent', async () => {
    const assetId = await ingest(1400, 660);
    const res = await upscaleForPrint(db, await sam(), { assetId, variantId: mugId, transform: COVER });
    expect(res).toMatchObject({ state: 'ready', sharp: null });
    expect(await findPrintSharp(db, assetId, await original(assetId))).toBeNull();
    expect(await db.select().from(mlOperations).where(eq(mlOperations.assetId, assetId))).toHaveLength(0);
    const render = await renderPrintFile(db, await sam(), { assetId, variantId: mugId, transform: COVER });
    keys.push(render.key);
    expect(render.upscaleMethod).toBe('classical');
  }, 60_000);

  it('the floor still holds: below it the tap is refused and the render throws — even with a print-sharp copy on hand', async () => {
    const tiny = await ingest(400, 190);
    expect(await upscaleForPrint(db, await sam(), { assetId: tiny, variantId: mugId, transform: COVER })).toMatchObject({ state: 'blocked', sharp: null });
    expect(await findPrintSharp(db, tiny, await original(tiny))).toBeNull();
    await expect(renderPrintFile(db, await sam(), { assetId: tiny, variantId: mugId, transform: COVER })).rejects.toThrow(/low-res/);

    // A copy exists for this one; zoomed right in it's below the floor on its REAL pixels → refused.
    const assetId = await ingest(720, 340);
    const copy = await ensurePrintSharp(db, assetId, await original(assetId));
    keys.push(copy!.key);
    await expect(renderPrintFile(db, await sam(), { assetId, variantId: mugId, transform: { ...COVER, scale: 4 } })).rejects.toThrow(/low-res/);
    // and the copy can't be passed off as the source to dodge the gate
    expect(await resolvePrintSource(db, assetId, copy!.objectId)).toBeNull();
    await expect(renderPrintFile(db, await sam(), { assetId, variantId: mugId, transform: { ...COVER, scale: 4 }, sourceObjectId: copy!.objectId })).rejects.toThrow(/no source/);
  }, 180_000);

  it('the tap is authz-gated (a viewer outside the circle is refused)', async () => {
    const assetId = await ingest(720, 340);
    const rosie = await resolveViewerContext(db, ids.rosieId, ids.hartleyId); // Extended circle, FAMILY asset
    await expect(upscaleForPrint(db, rosie, { assetId, variantId: mugId, transform: COVER })).rejects.toBeInstanceOf(AuthzError);
    expect(await findPrintSharp(db, assetId, await original(assetId))).toBeNull();
  });

  it('an edited source gets a fresh copy; the stale one is removed (bytes + row)', async () => {
    const assetId = await ingest(720, 340);
    const orig = await original(assetId);
    const first = await ensurePrintSharp(db, assetId, { ...orig, sha256: 'aaaaaaaaaaaaaaaa' });
    const second = await ensurePrintSharp(db, assetId, { ...orig, sha256: 'bbbbbbbbbbbbbbbb' });
    keys.push(first!.key, second!.key);
    expect(first!.key).toBe(printSharpKey(assetId, { ...orig, sha256: 'aaaaaaaaaaaaaaaa' }));
    expect(second!.key).not.toBe(first!.key);
    const left = await db.select().from(storageObjects).where(like(storageObjects.key, `${derivativeKey(assetId, 'upscale-')}%`));
    expect(left.map((r) => r.key)).toEqual([second!.key]);
    await expect(getObjectBytes(first!.key)).rejects.toThrow();
  }, 180_000);
});
