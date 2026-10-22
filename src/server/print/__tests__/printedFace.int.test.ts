import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { printTemplates, products, productVariants, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { getStorageObjectGrant, resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { seedCatalogue } from '@/server/catalogue';
import { composeMockup } from '@/server/print/compositor';
import { drawProductMockup } from '@/server/print/drawnMockups';
import { setMockupTemplate } from '@/server/print/templates';
import { deleteObject } from '@/storage';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;

/**
 * B2: a repeat-pattern product's mockup shows the REPEAT (as printed), and a height chart's shows
 * the RULER — the compositor lays the printed face on the product, not the single drawing.
 * Private, hidden copies of the real socks / height-chart variants (`socks-…` / `heightChart-…`
 * keys are recognised as those products), so the shared catalogue is never touched.
 */
describe.skipIf(!DB || !S3)('mockups show the printed face — pattern + height chart (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const productIds: string[] = [];
  const variant: Record<string, string> = {};
  let assetId = '';

  async function privateCopy(realSku: string, key: string) {
    const [real] = await db
      .select({ t: printTemplates, attrs: productVariants.attributes })
      .from(printTemplates)
      .innerJoin(productVariants, eq(printTemplates.variantId, productVariants.id))
      .where(eq(productVariants.sku, realSku));
    const [prod] = await db.insert(products).values({ key, category: 'PRINT', label: key, active: false, visibleInShop: false }).returning();
    productIds.push(prod!.id);
    const [v] = await db.insert(productVariants).values({ productId: prod!.id, sku: key, label: key, attributes: real!.attrs, pricePence: 100, active: false }).returning();
    const { id: _id, variantId: _v, ...tpl } = real!.t;
    await db.insert(printTemplates).values({ ...tpl, variantId: v!.id, blankObjectId: null, printQuad: null, maskObjectId: null, lightingObjectId: null });
    const which = realSku.startsWith('socks') ? 'socks' : 'heightChart';
    const d = drawProductMockup(which, (real!.attrs as Record<string, string>) ?? {}, { w: tpl.printWidthPx, h: tpl.printHeightPx });
    await setMockupTemplate(db, { variantId: v!.id, blank: d.blank, contentType: 'image/png', printQuad: d.quad, materialClass: d.material, mask: d.mask, overlay: d.overlay });
    return v!.id;
  }

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
    variant.socks = await privateCopy('socks-tube', `socks-zztest-${ids.nonce}`);
    variant.chart = await privateCopy('heightChart', `heightChart-zztest-${ids.nonce}`);
    // a drawing: ONE red disc on white — so the repeat is countable
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const disc = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="#fff"/><circle cx="400" cy="400" r="330" fill="#c8402a"/></svg>')).png().toBuffer();
    assetId = (await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: disc, keptInHome: true })).assetId;
  });

  afterAll(async () => {
    if (assetId) {
      for (const o of await db.select().from(storageObjects).where(eq(storageObjects.assetId, assetId))) await deleteObject(o.key).catch(() => {});
      await db.delete(schema.assets).where(eq(schema.assets.id, assetId)).catch(() => {});
    }
    if (productIds.length) await db.delete(products).where(inArray(products.id, productIds)).catch(() => {});
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  async function mockupPixels(variantId: string, transform = { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 }) {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const res = await composeMockup(db, sam, { assetId, variantId, transform, size: 'zoom' });
    const grant = await getStorageObjectGrant(db, res.mockupObjectId, sam, 600);
    return { key: res.key, ...(await sharp(Buffer.from(await (await fetch(grant.url)).arrayBuffer())).raw().toBuffer({ resolveWithObject: true })) };
  }

  /** How many separate red blobs (4-connected) are in the image. */
  function redBlobs(data: Buffer, w: number, h: number, c: number): number {
    const red = (p: number) => data[p * c]! > 150 && data[p * c + 1]! < 110 && data[p * c + 2]! < 110;
    const seen = new Uint8Array(w * h);
    let blobs = 0;
    for (let p = 0; p < w * h; p++) {
      if (seen[p] || !red(p)) continue;
      let size = 0;
      const stack = [p];
      seen[p] = 1;
      while (stack.length) {
        const q = stack.pop()!;
        size++;
        const x = q % w, y = (q - x) / w;
        for (const n of [x > 0 ? q - 1 : -1, x < w - 1 ? q + 1 : -1, y > 0 ? q - w : -1, y < h - 1 ? q + w : -1]) {
          if (n >= 0 && !seen[n] && red(n)) { seen[n] = 1; stack.push(n); }
        }
      }
      if (size > 30) blobs++; // ignore antialias specks
    }
    return blobs;
  }

  it('socks: the mockup shows the drawing on REPEAT (several motifs), not one placed drawing', async () => {
    const { data, info, key } = await mockupPixels(variant.socks!);
    expect(key).toMatch(/-facerep\d/); // its own cache entry, distinct from a placed-drawing render
    expect(redBlobs(data, info.width, info.height, info.channels)).toBeGreaterThanOrEqual(3);
  });

  it('socks: a bigger motif (zoom) means fewer motifs — the preview follows the pattern transform', async () => {
    const small = await mockupPixels(variant.socks!, { scale: 0.5, offsetX: 0, offsetY: 0, rotationDeg: 0 });
    const big = await mockupPixels(variant.socks!, { scale: 2.5, offsetX: 0, offsetY: 0, rotationDeg: 0 });
    expect(redBlobs(small.data, small.info.width, small.info.height, small.info.channels)).toBeGreaterThan(
      redBlobs(big.data, big.info.width, big.info.height, big.info.channels),
    );
  });

  it('height chart: the mockup carries the printed ruler beside the drawing', async () => {
    const { data, info, key } = await mockupPixels(variant.chart!);
    expect(key).toMatch(/-facehc\d/);
    // the chart's left edge column (inside the drawn canvas) has many short dark ticks
    let darkRuns = 0;
    let inRun = false;
    // find the canvas: the white column band in the middle of the photo
    const xs = Array.from({ length: info.width }, (_, x) => x).filter((x) => {
      const i = (Math.round(info.height / 2) * info.width + x) * info.channels;
      return data[i]! > 245 && data[i + 1]! > 245 && data[i + 2]! > 245;
    });
    const x = xs[0]! + 1;
    for (let y = 0; y < info.height; y++) {
      const i = (y * info.width + x) * info.channels;
      const dark = data[i]! < 150;
      if (dark && !inRun) darkRuns++;
      inRun = dark;
    }
    expect(darkRuns).toBeGreaterThan(40); // ~90 cm ticks on a 120 cm chart, some merge at this size
  });
});
