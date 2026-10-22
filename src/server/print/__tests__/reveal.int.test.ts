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
import type { ComposeMemo } from '@/server/print/compositor';
import { drawProductMockup, type DrawnProductKey } from '@/server/print/drawnMockups';
import { instantContexts } from '@/server/print/instantContext';
import { composeForViewer } from '@/server/print/mockupRequest';
import { setMockupTemplate } from '@/server/print/templates';
import { deleteObject } from '@/storage';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;

/**
 * The catalogue REVEAL's server side: the instant-preview context (brand-safe photo + print area,
 * only where the browser can draw it faithfully) and the batch compose (one drawing download for
 * the whole batch; every item still authz-gated on its own).
 */
describe.skipIf(!DB || !S3)('catalogue reveal — instant contexts + batch compose (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const productIds: string[] = [];
  const variant: Record<string, string> = {};
  let assetId = '';

  async function privateCopy(realSku: string, drawn: DrawnProductKey, key: string) {
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
    const d = drawProductMockup(drawn, {}, { w: tpl.printWidthPx, h: tpl.printHeightPx });
    await setMockupTemplate(db, { variantId: v!.id, blank: d.blank, contentType: 'image/png', printQuad: d.quad, materialClass: d.material, mask: d.mask, overlay: d.overlay });
    return v!.id;
  }

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
    variant.block = await privateCopy('acrylicBlock', 'acrylicBlock', `zz-reveal-block-${ids.nonce}`);
    variant.cards = await privateCopy('playingCards', 'playingCards', `zz-reveal-cards-${ids.nonce}`);
    variant.socks = await privateCopy('socks', 'socks', `socks-zzreveal-${ids.nonce}`);
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const png = await sharp({ create: { width: 900, height: 700, channels: 3, background: { r: 200, g: 60, b: 40 } } }).png().toBuffer();
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

  it('instant contexts: a small brand-safe photo + the print area for flat products; none where the browser can’t draw it', async () => {
    const ctx = await instantContexts(db, [variant.block!, variant.socks!]);
    expect(ctx[variant.socks!]).toBeNull(); // a repeat pattern: the server's printed face only
    const block = ctx[variant.block!]!;
    expect(block.quad).toHaveLength(4);
    expect(block.material).toBe('GLOSS');
    const photo = await sharp(Buffer.from(await (await fetch(block.blankUrl)).arrayBuffer())).metadata();
    expect(Math.max(photo.width!, photo.height!)).toBeLessThanOrEqual(600); // the small copy, not the full photo
    expect(block.blankW / block.blankH).toBeCloseTo(photo.width! / photo.height!, 2);
  });

  it('batch compose: one drawing download for the whole batch, each item its own photo', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const memo: ComposeMemo = new Map();
    const tf = { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 };
    const [a, b] = await Promise.all([
      composeForViewer(db, sam, { assetId, variantId: variant.block, transform: tf, size: 'thumb' }, { needsAuth: false, memo }),
      composeForViewer(db, sam, { assetId, variantId: variant.cards, transform: tf, size: 'thumb' }, { needsAuth: false, memo }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.url).not.toBe(b.url);
    expect(memo.size).toBe(1); // the drawing was fetched + shrunk ONCE for both
    const m = await sharp(Buffer.from(await (await fetch((a as { url: string }).url)).arrayBuffer())).metadata();
    expect(Math.max(m.width!, m.height!)).toBeLessThanOrEqual(400); // a thumb
  });

  it('batch compose never skips the gate: an outsider gets the plain fallback, not a picture', async () => {
    const blake = await resolveViewerContext(db, ids.blakeId, null);
    const res = await composeForViewer(db, blake, { assetId, variantId: variant.block, transform: {}, size: 'thumb' }, { needsAuth: false, memo: new Map() });
    expect(res.ok).toBe(false);
  });
});
