import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { printTemplates, products, productVariants, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { seedCatalogue } from '@/server/catalogue';
import { drawProductMockup } from '@/server/print/drawnMockups';
import { composeForViewer } from '@/server/print/mockupRequest';
import { layeredFlatPath, layeredFlatTemplate } from '@/server/print/seedMockups';
import { setMockupTemplate } from '@/server/print/templates';
import { deleteObject } from '@/storage';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;

/**
 * The base colour on the PREVIEW (founder, 22 Oct: "when I select one it doesn't show a renewed
 * preview"): the customize page's preview request with a colour must come back as a DIFFERENT,
 * coloured picture — not the white one again — through the real gated compose path.
 */
describe.skipIf(!DB || !S3)('pattern base colour — the preview (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  let assetId = '';
  let variantId = '';
  const productIds: string[] = [];

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
    // A private ankle-sock product (its key starts 'socks-' so it repeats), with the real photo set
    // where it's staged and the drawn sock elsewhere.
    const [real] = await db
      .select({ t: printTemplates, attrs: productVariants.attributes })
      .from(printTemplates)
      .innerJoin(productVariants, eq(printTemplates.variantId, productVariants.id))
      .where(eq(productVariants.sku, 'socks'));
    const key = `socks-zzground-${ids.nonce}`;
    const [prod] = await db.insert(products).values({ key, category: 'APPAREL', label: key, active: false, visibleInShop: false }).returning();
    productIds.push(prod!.id);
    const [v] = await db.insert(productVariants).values({ productId: prod!.id, sku: key, label: key, attributes: real!.attrs, pricePence: 100, active: false }).returning();
    variantId = v!.id;
    const { id: _id, variantId: _v, ...tpl } = real!.t;
    await db.insert(printTemplates).values({ ...tpl, variantId, blankObjectId: null, printQuad: null, maskObjectId: null, lightingObjectId: null });
    const dir = layeredFlatPath('socks/ankle');
    const t = dir ? await layeredFlatTemplate(dir, tpl.printWidthPx / tpl.printHeightPx, true) : null;
    const d = t ?? drawProductMockup('socks', {}, { w: tpl.printWidthPx, h: tpl.printHeightPx });
    await setMockupTemplate(db, { variantId, blank: d.blank, contentType: 'image/png', printQuad: d.quad, materialClass: 'LIGHT_FABRIC', mask: d.mask, overlay: d.overlay });

    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const png = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><circle cx="450" cy="450" r="260" fill="#c8402a"/></svg>')).png().toBuffer();
    assetId = (await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: png, keptInHome: true })).assetId;
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

  const meanLuma = async (url: string) => {
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    const s = await sharp(buf).removeAlpha().stats();
    return 0.299 * s.channels[0]!.mean + 0.587 * s.channels[1]!.mean + 0.114 * s.channels[2]!.mean;
  };

  it('picking navy gives a new, navy picture (the large customize preview), quickly', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const tf = { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 };
    const t0 = Date.now();
    const white = await composeForViewer(db, sam, { assetId, variantId, transform: tf, size: 'zoom' }, { needsAuth: false });
    const t1 = Date.now();
    const navy = await composeForViewer(db, sam, { assetId, variantId, transform: tf, size: 'zoom', ground: 'navy' }, { needsAuth: false });
    const t2 = Date.now();
    expect(white.ok, 'white compose').toBe(true);
    expect(navy.ok, 'navy compose').toBe(true);
    if (!white.ok || !navy.ok) return;
    expect(navy.url).not.toBe(white.url);
    expect(await meanLuma(navy.url)).toBeLessThan((await meanLuma(white.url)) - 15); // visibly darker: the socks are navy
    console.log(`[ground preview] white ${t1 - t0} ms, navy ${t2 - t1} ms`);
  }, 120_000);

  it('a junk colour is just the white picture (same cached key)', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const tf = { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 };
    const a = await composeForViewer(db, sam, { assetId, variantId, transform: tf, size: 'thumb' }, { needsAuth: false });
    const b = await composeForViewer(db, sam, { assetId, variantId, transform: tf, size: 'thumb', ground: '#ff00ff' }, { needsAuth: false });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(new URL(b.url).pathname).toBe(new URL(a.url).pathname);
  }, 120_000);
});
