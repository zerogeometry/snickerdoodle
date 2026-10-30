import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { printTemplates, productVariants, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { getStorageObjectGrant, resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { composeMockup } from '@/server/print/compositor';
import { renderPrintFile } from '@/server/print/render';
import { deleteObject, getObjectBytes } from '@/storage';
import type { DbHandle } from '@/server/db';

/**
 * ASPECT TRUTH (founder guarantee, 2026-07-07): we never distort the uploaded
 * image — cover-fill scales it uniformly to fill the frame and crops overflow.
 * Proven end-to-end: a perfect circle composed through the LIVE framed-print
 * template must come out round (paper doesn't warp; fabric products are allowed
 * to, by the fold-following fx). Guards the layered-frame registration + the
 * shared cover-fit geometry against any future anisotropy regression.
 */

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;

describe.skipIf(!DB || !S3)('cover-fill keeps the source aspect (circle stays round)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  let assetId = '';

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    // portrait 1000×1400 (aspect ≠ any frame canvas), dark bg, perfect circle r=300
    const circle = await sharp(
      Buffer.from(
        '<svg width="1000" height="1400"><rect width="1000" height="1400" fill="#10265c"/><circle cx="500" cy="700" r="300" fill="#ffffff"/></svg>',
      ),
    ).png().toBuffer();
    const r = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: circle, keptInHome: true });
    assetId = r.assetId;
  });

  afterAll(async () => {
    if (assetId) {
      const objs = await db.select().from(storageObjects).where(eq(storageObjects.assetId, assetId));
      for (const o of objs) await deleteObject(o.key).catch(() => {});
      await db.delete(schema.assets).where(eq(schema.assets.id, assetId)).catch(() => {});
    }
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  it('the framed print renders the circle round to within 2%', async (ctx) => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const [v] = await db.select().from(productVariants).where(eq(productVariants.sku, 'framedPrint'));
    // the framed print's mockup is authored from the founder's layered photos (gitignored, so never in CI)
    const [t] = v ? await db.select({ blank: printTemplates.blankObjectId, quad: printTemplates.printQuad }).from(printTemplates).where(eq(printTemplates.variantId, v.id)) : [];
    if (!t?.blank || !t.quad) ctx.skip('no framed-print mockup template in this database (seedMockups needs the founder layers)');
    const res = await composeMockup(db, sam, { assetId, variantId: v!.id, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 }, size: 'zoom' });
    const grant = await getStorageObjectGrant(db, res.mockupObjectId, sam, 600);
    const buf = Buffer.from(await (await fetch(grant.url)).arrayBuffer());
    const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    const { width: W, height: H, channels: C } = info;
    const white = (x: number, y: number) => {
      const i = (y * W + x) * C;
      return data[i]! > 210 && data[i + 1]! > 210 && data[i + 2]! > 210;
    };
    const blue = (x: number, y: number) => {
      const i = (y * W + x) * C;
      return data[i]! < 90 && data[i + 2]! > 50;
    };
    // The circle is the only white bounded by the design's blue on BOTH sides —
    // the frame's paper/backdrop whites never are. Longest bounded run per axis
    // = the diameters.
    let dW = 0;
    for (let y = 0; y < H; y++) {
      let x = 0;
      while (x < W) {
        if (blue(x, y)) {
          while (x < W && blue(x, y)) x++;
          const s = x;
          while (x < W && white(x, y)) x++;
          if (x > s && x < W && blue(x, y)) dW = Math.max(dW, x - s);
        } else x++;
      }
    }
    let dH = 0;
    for (let x = 0; x < W; x++) {
      let y = 0;
      while (y < H) {
        if (blue(x, y)) {
          while (y < H && blue(x, y)) y++;
          const s = y;
          while (y < H && white(x, y)) y++;
          if (y > s && y < H && blue(x, y)) dH = Math.max(dH, y - s);
        } else y++;
      }
    }
    expect(dW).toBeGreaterThan(100); // the circle is actually there, at real size
    expect(dW / dH).toBeGreaterThan(0.98);
    expect(dW / dH).toBeLessThan(1.02);
  }, 120_000);

  it('a LANDSCAPE frame ships a PORTRAIT print file (Prodigi fixed-portrait spec), art rotated inside', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    // print-resolution source (the shared circle asset is deliberately small)
    const big = await sharp(
      Buffer.from('<svg width="4400" height="3400"><rect width="4400" height="3400" fill="#10265c"/><circle cx="2200" cy="1700" r="1200" fill="#ffffff"/></svg>'),
    ).png().toBuffer();
    const bigAsset = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: big, keptInHome: true });
    const [v] = await db.select().from(productVariants).where(eq(productVariants.sku, 'framedPrint-1114-gold-landscape'));
    expect(v).toBeTruthy();
    const res = await renderPrintFile(db, sam, { assetId: bigAsset.assetId, variantId: v!.id, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } });
    // the finished file is PORTRAIT px (Prodigi's fixed-portrait frame spec)...
    expect(res.heightPx).toBeGreaterThan(res.widthPx);
    const buf = await getObjectBytes(res.key);
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(res.widthPx);
    expect(meta.height).toBe(res.heightPx);
    // ...and it is exactly Prodigi's 11×14 portrait print area (printAreaSizes 3307×4192px, no bleed)
    expect([meta.width, meta.height]).toEqual([3307, 4192]);
    // cleanup the big asset (cascades its derivatives)
    const objs = await db.select().from(storageObjects).where(eq(storageObjects.assetId, bigAsset.assetId));
    for (const o of objs) await deleteObject(o.key).catch(() => {});
    await db.delete(schema.assets).where(eq(schema.assets.id, bigAsset.assetId)).catch(() => {});
  }, 120_000);
});
