import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
import { composeForViewer } from '@/server/print/mockupRequest';
import { layeredFlatTemplate } from '@/server/print/seedMockups';
import { setMockupTemplate } from '@/server/print/templates';
import { deleteObject } from '@/storage';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;

/**
 * A pair of socks through the REAL gated compose path: the template stores one print area per sock
 * (print_templates.extra_quads), and the photo a shopper is served shows the SAME print on both
 * socks. Synthetic, brand-safe layers (two sock-shaped capsules) — no founder photo needed.
 */
describe.skipIf(!DB || !S3)('a pair of socks — one print area per sock (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  let assetId = '';
  let variantId = '';
  let dir = '';
  let quads: [number, number][][] = [];
  const productIds: string[] = [];
  const W = 900, H = 900;

  const paint = (a: Uint8Array, cx: number, cy: number, w: number, h: number, deg: number, r: number) => {
    const t = (deg * Math.PI) / 180, cs = Math.cos(t), sn = Math.sin(t);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const u = Math.abs(dx * cs + dy * sn), v = Math.abs(-dx * sn + dy * cs);
        const qx = u - (w / 2 - r), qy = v - (h / 2 - r);
        if (qx <= 0 || qy <= 0 ? u <= w / 2 && v <= h / 2 : Math.hypot(qx, qy) <= r) a[y * W + x] = 255;
      }
  };

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);

    // the two-sock layered set
    dir = mkdtempSync(path.join(tmpdir(), 'socks-pair-int-'));
    const alpha = new Uint8Array(W * H);
    paint(alpha, 300, 470, 190, 560, -16, 80);
    paint(alpha, 600, 430, 190, 560, -16, 80);
    const rgba = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) if (alpha[i]) rgba.set([250, 250, 250, 255], i * 4);
    const png = (b: Buffer) => sharp(b, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
    writeFileSync(path.join(dir, 'product.png'), await png(rgba));
    writeFileSync(path.join(dir, 'printmap.png'), await png(rgba));
    writeFileSync(path.join(dir, 'shadow.png'), await png(Buffer.alloc(W * H * 4)));
    writeFileSync(path.join(dir, 'background.png'), await sharp({ create: { width: W, height: H, channels: 3, background: '#f8f5e9' } }).png().toBuffer());

    // a private ankle-sock product (its key starts 'socks-' so it prints the repeat)
    const [real] = await db
      .select({ t: printTemplates, attrs: productVariants.attributes })
      .from(printTemplates)
      .innerJoin(productVariants, eq(printTemplates.variantId, productVariants.id))
      .where(eq(productVariants.sku, 'socks'));
    const key = `socks-zzpair-${ids.nonce}`;
    const [prod] = await db.insert(products).values({ key, category: 'APPAREL', label: key, active: false, visibleInShop: false }).returning();
    productIds.push(prod!.id);
    const [v] = await db.insert(productVariants).values({ productId: prod!.id, sku: key, label: key, attributes: real!.attrs, pricePence: 100, active: false }).returning();
    variantId = v!.id;
    const { id: _id, variantId: _v, ...tpl } = real!.t;
    await db.insert(printTemplates).values({ ...tpl, variantId, blankObjectId: null, printQuad: null, extraQuads: null, maskObjectId: null, lightingObjectId: null });
    const t = (await layeredFlatTemplate(dir, tpl.printWidthPx / tpl.printHeightPx, true, false, true))!;
    quads = [t.quad, ...(t.extraQuads ?? [])];
    await setMockupTemplate(db, { variantId, blank: t.blank, contentType: 'image/png', printQuad: t.quad, extraQuads: t.extraQuads, materialClass: 'LIGHT_FABRIC', mask: t.mask });

    // a lopsided drawing, so a shifted / turned copy can't pass
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const art = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><rect width="900" height="900" fill="#fff"/><rect width="900" height="300" fill="#c8402a"/><circle cx="640" cy="640" r="180" fill="#2f5da8"/></svg>')).png().toBuffer();
    assetId = (await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: art, keptInHome: true })).assetId;
  });

  afterAll(async () => {
    if (assetId) {
      for (const o of await db.select().from(storageObjects).where(eq(storageObjects.assetId, assetId))) await deleteObject(o.key).catch(() => {});
      await db.delete(schema.assets).where(eq(schema.assets.id, assetId)).catch(() => {});
    }
    if (productIds.length) await db.delete(products).where(inArray(products.id, productIds)).catch(() => {});
    if (ids) await cleanupDemoFamilies(db, ids);
    if (dir) rmSync(dir, { recursive: true, force: true });
    await client.end();
  });

  it('stores one print area per sock', async () => {
    const [row] = await db.select({ q: printTemplates.printQuad, extra: printTemplates.extraQuads }).from(printTemplates).where(eq(printTemplates.variantId, variantId));
    expect(row?.q).toHaveLength(4);
    expect(row?.extra).toHaveLength(1);
  });

  it('the served photo shows the same print on both socks', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const r = await composeForViewer(db, sam, { assetId, variantId, transform: { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 }, size: 'zoom' }, { needsAuth: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tier).toBe('PERSPECTIVE');
    const buf = Buffer.from(await (await fetch(r.url)).arrayBuffer());
    const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const at = (q: [number, number][], u: number, v: number) => {
      const [tl, tr, br, bl] = q;
      const x = ((1 - v) * ((1 - u) * tl![0] + u * tr![0]) + v * ((1 - u) * bl![0] + u * br![0])) * info.width;
      const y = ((1 - v) * ((1 - u) * tl![1] + u * tr![1]) + v * ((1 - u) * bl![1] + u * br![1])) * info.height;
      const i = (Math.round(y) * info.width + Math.round(x)) * 3;
      return [data[i]!, data[i + 1]!, data[i + 2]!];
    };
    let diff = 0, n = 0, varied = 0;
    let prev: number[] | null = null;
    for (const u of [0.35, 0.45, 0.55, 0.65]) for (const v of [0.25, 0.4, 0.55, 0.7, 0.85]) {
      const a = at(quads[0]!, u, v), b = at(quads[1]!, u, v);
      diff += Math.abs(a[0]! - b[0]!) + Math.abs(a[1]! - b[1]!) + Math.abs(a[2]! - b[2]!);
      if (prev && Math.abs(prev[0]! - a[0]!) + Math.abs(prev[2]! - a[2]!) > 60) varied++;
      prev = a;
      n++;
    }
    expect(varied, 'the print really varies across the sock (not a blank match)').toBeGreaterThan(2);
    expect(diff / n, 'both socks, spot for spot').toBeLessThan(25);
  }, 120_000);
});
