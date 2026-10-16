import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { mockupViews, printTemplates, products, productVariants, storageObjects, templateAssets } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError } from '@/authz';
import { getStorageObjectGrant, resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { seedCatalogue } from '@/server/catalogue';
import { composeMockup, NoMockupTemplateError } from '@/server/print/compositor';
import { setMockupView } from '@/server/print/templates';
import { deleteObject, putObject } from '@/storage';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
// A colourful design + a flat "product photo" blank (stand-in for a real photo).
const design = () => sharp({ create: { width: 1200, height: 1500, channels: 4, background: { r: 220, g: 90, b: 60, alpha: 1 } } }).png().toBuffer();
const blankPhoto = () => sharp({ create: { width: 600, height: 800, channels: 3, background: { r: 232, g: 226, b: 214 } } }).png().toBuffer();
// Axis-aligned print area (FLAT) — central window of the blank.
const QUAD: [number, number][] = [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]];

describe.skipIf(!DB || !S3)('mockup compositor — FLAT (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  let variantId = '';
  let productId = '';
  let blankAssetId = '';
  const designAssetIds: string[] = [];
  const keys: string[] = [];

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
    // A PRIVATE, hidden test product with the framed print's real print canvas — never the shared
    // framedPrint variant: mutating that one mid-suite raced every test (and the dev server)
    // reading the live catalogue, e.g. the print-map registration check saw the test quad.
    const [real] = await db
      .select({ t: printTemplates })
      .from(printTemplates)
      .innerJoin(productVariants, eq(printTemplates.variantId, productVariants.id))
      .where(eq(productVariants.sku, 'framedPrint'));
    const [prod] = await db
      .insert(products)
      .values({ key: `zz-test-compositor-${ids.nonce}`, category: 'PRINT', label: 'test frame', active: false, visibleInShop: false })
      .returning();
    productId = prod!.id;
    const [v] = await db
      .insert(productVariants)
      .values({ productId, sku: `zz-test-compositor-${ids.nonce}`, label: 'test frame', attributes: { size: '11×14″', colour: 'gold' }, pricePence: 100, active: false })
      .returning();
    variantId = v!.id;
    const { id: _id, variantId: _v, ...tpl } = real!.t;

    // Brand-safe NON-child blank in template_assets + wire the variant's mockup template.
    const buf = await blankPhoto();
    const blankKey = `templates/test-${ids.nonce}/blank.png`;
    await putObject(blankKey, buf, 'image/png');
    keys.push(blankKey);
    const [ta] = await db
      .insert(templateAssets)
      .values({ kind: 'BLANK', bucket: process.env.S3_BUCKET!, key: blankKey, contentType: 'image/png', byteSize: buf.byteLength, widthPx: 600, heightPx: 800 })
      .returning();
    blankAssetId = ta!.id;
    await db.insert(printTemplates).values({ ...tpl, variantId, blankObjectId: blankAssetId, printQuad: QUAD, templateVersion: 1, materialClass: 'PAPER', maskObjectId: null, lightingObjectId: null });
  });

  afterAll(async () => {
    // the private test product goes, and its variant + template with it (cascade)
    if (variantId) await db.delete(printTemplates).where(eq(printTemplates.variantId, variantId)).catch(() => {});
    if (productId) await db.delete(products).where(eq(products.id, productId)).catch(() => {});
    if (blankAssetId) await db.delete(templateAssets).where(eq(templateAssets.id, blankAssetId)).catch(() => {});
    for (const id of designAssetIds) {
      const objs = await db.select().from(storageObjects).where(eq(storageObjects.assetId, id));
      for (const o of objs) await deleteObject(o.key).catch(() => {});
      await db.delete(schema.assets).where(eq(schema.assets.id, id)).catch(() => {});
    }
    for (const k of keys) await deleteObject(k).catch(() => {});
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  async function ingestDesign() {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const r = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await design(), keptInHome: true });
    keys.push(r.key);
    designAssetIds.push(r.assetId);
    return r.assetId;
  }

  it('composites a real WebP mockup of the design on the blank, gated + cached', async () => {
    const assetId = await ingestDesign();
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);

    const res = await composeMockup(db, sam, { assetId, variantId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } });
    expect(res.tier).toBe('FLAT');
    expect(res.cached).toBe(false);
    expect(res.format).toBe('webp');

    // The derivative is a real WebP, under the asset, EXIF-stripped.
    const [row] = await db.select().from(storageObjects).where(eq(storageObjects.id, res.mockupObjectId));
    expect(row!.assetId).toBe(assetId); // a child-image derivative → covered by retention/cascade
    expect(row!.contentType).toBe('image/webp');
    expect(row!.exifStripped).toBe(true);

    const grant = await getStorageObjectGrant(db, res.mockupObjectId, sam, 600);
    const fetched = Buffer.from(await (await fetch(grant.url)).arrayBuffer());
    const meta = await sharp(fetched).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(400); // 'thumb' default

    // Second call → cache HIT, same object, no new row.
    const before = (await db.select().from(storageObjects).where(eq(storageObjects.assetId, assetId))).length;
    const again = await composeMockup(db, sam, { assetId, variantId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } });
    expect(again.cached).toBe(true);
    expect(again.mockupObjectId).toBe(res.mockupObjectId);
    const after = (await db.select().from(storageObjects).where(eq(storageObjects.assetId, assetId))).length;
    expect(after).toBe(before);
  });

  it('ZERO third-party egress: a render touches only our own storage host', async () => {
    const assetId = await ingestDesign();
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const s3host = new URL(process.env.S3_ENDPOINT!).host;

    const calls: string[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = ((...a: Parameters<typeof fetch>) => {
      calls.push(String(a[0]));
      return orig(...a);
    }) as typeof fetch;
    try {
      await composeMockup(db, sam, { assetId, variantId, transform: { scale: 1.4, offsetX: 0.1, offsetY: 0, rotationDeg: 0 } });
    } finally {
      globalThis.fetch = orig;
    }
    const offenders = calls.filter((u) => {
      try {
        const h = new URL(u).host;
        return h !== s3host && !/^(localhost|127\.0\.0\.1)(:|$)/.test(h);
      } catch {
        return false;
      }
    });
    expect(offenders).toEqual([]); // the child's design never goes to any third party
  });

  it('templateVersion bump produces a fresh render (no stale mockup)', async () => {
    const assetId = await ingestDesign();
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const tf = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 };

    const a = await composeMockup(db, sam, { assetId, variantId, transform: tf });
    await db.update(printTemplates).set({ templateVersion: 2 }).where(eq(printTemplates.variantId, variantId));
    const b = await composeMockup(db, sam, { assetId, variantId, transform: tf });
    expect(b.mockupObjectId).not.toBe(a.mockupObjectId); // new key ⇒ new derivative
    await db.update(printTemplates).set({ templateVersion: 1 }).where(eq(printTemplates.variantId, variantId));
  });

  it('denies a viewer who cannot see the asset (authz first)', async () => {
    const assetId = await ingestDesign();
    const outsider = await resolveViewerContext(db, ids.blakeId, ids.bloomId); // a different family
    await expect(composeMockup(db, outsider, { assetId, variantId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } })).rejects.toBeInstanceOf(AuthzError);
  });

  it('falls back (throws NoMockupTemplateError) for a variant with no template', async () => {
    const assetId = await ingestDesign();
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    // giftWrap is an ADDON (print: false) — it has no print_template row at all, and never
    // will, so it's a stable "no mockup template" case (real products may be authored blanks).
    const [wrap] = await db.select().from(productVariants).where(eq(productVariants.sku, 'giftWrap'));
    await expect(composeMockup(db, sam, { assetId, variantId: wrap!.id, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } })).rejects.toBeInstanceOf(NoMockupTemplateError);
  });

  it('deleting the asset cascades the mockup derivative but NOT the template asset', async () => {
    const assetId = await ingestDesign();
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const res = await composeMockup(db, sam, { assetId, variantId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } });

    await db.delete(schema.assets).where(eq(schema.assets.id, assetId)); // cascades storage_objects
    designAssetIds.splice(designAssetIds.indexOf(assetId), 1); // already gone
    const gone = await db.select().from(storageObjects).where(eq(storageObjects.id, res.mockupObjectId));
    expect(gone).toHaveLength(0); // mockup derivative cascaded with the asset
    const blankStill = await db.select().from(templateAssets).where(eq(templateAssets.id, blankAssetId));
    expect(blankStill).toHaveLength(1); // the brand-safe blank is NOT child data → untouched
  });

  it('concurrent identical renders → ONE derivative (in-flight dedup + unique key)', async () => {
    const assetId = await ingestDesign();
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const tf = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 };
    const results = await Promise.all([
      composeMockup(db, sam, { assetId, variantId, transform: tf }),
      composeMockup(db, sam, { assetId, variantId, transform: tf }),
      composeMockup(db, sam, { assetId, variantId, transform: tf }),
    ]);
    expect(new Set(results.map((r) => r.mockupObjectId)).size).toBe(1); // all share one object
    const rows = await db.select().from(storageObjects).where(and(eq(storageObjects.assetId, assetId), eq(storageObjects.objectClass, 'DERIVATIVE')));
    expect(rows.filter((r) => r.key.includes('mockup-'))).toHaveLength(1); // no duplicate row
  });

  it('the ORIGINAL and a cutout source render to DISTINCT keys (no collision)', async () => {
    const assetId = await ingestDesign();
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const cutoutBuf = await sharp({ create: { width: 800, height: 1000, channels: 4, background: { r: 90, g: 180, b: 120, alpha: 1 } } }).png().toBuffer();
    const cutoutKey = `assets/${assetId}/derivatives/cutout-test.png`;
    await putObject(cutoutKey, cutoutBuf, 'image/png');
    keys.push(cutoutKey);
    const [cutout] = await db
      .insert(storageObjects)
      .values({ assetId, objectClass: 'DERIVATIVE', bucket: process.env.S3_BUCKET!, key: cutoutKey, contentType: 'image/png', exifStripped: true })
      .returning();
    const tf = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 };
    const fromOriginal = await composeMockup(db, sam, { assetId, variantId, transform: tf });
    const fromCutout = await composeMockup(db, sam, { assetId, variantId, transform: tf, sourceObjectId: cutout!.id });
    expect(fromOriginal.key).not.toBe(fromCutout.key);
    expect(fromOriginal.mockupObjectId).not.toBe(fromCutout.mockupObjectId);
  });

  it('authz runs BEFORE the cache — an outsider is denied even on a cache HIT', async () => {
    const assetId = await ingestDesign();
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const tf = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 };
    await composeMockup(db, sam, { assetId, variantId, transform: tf }); // populate the cache
    const outsider = await resolveViewerContext(db, ids.blakeId, ids.bloomId);
    await expect(composeMockup(db, outsider, { assetId, variantId, transform: tf })).rejects.toBeInstanceOf(AuthzError);
  });

  it('clips the design to the silhouette MASK — art cannot overlap the product edge', async () => {
    const assetId = await ingestDesign(); // solid red 1200×1500
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);

    // Mask: a white circle (the "product face") inside the quad, black elsewhere — full blank frame.
    const maskBuf = await sharp(
      Buffer.from('<svg width="600" height="800"><rect width="600" height="800" fill="black"/><circle cx="300" cy="400" r="120" fill="white"/></svg>'),
    ).png().toBuffer();
    const maskKey = `templates/test-${ids.nonce}/mask.png`;
    await putObject(maskKey, maskBuf, 'image/png');
    keys.push(maskKey);
    const [ma] = await db
      .insert(templateAssets)
      .values({ kind: 'MASK', bucket: process.env.S3_BUCKET!, key: maskKey, contentType: 'image/png', byteSize: maskBuf.byteLength, widthPx: 600, heightPx: 800 })
      .returning();
    await db.update(printTemplates).set({ maskObjectId: ma!.id, templateVersion: 7 }).where(eq(printTemplates.variantId, variantId));

    try {
      const res = await composeMockup(db, sam, { assetId, variantId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 }, size: 'zoom' });
      const grant = await getStorageObjectGrant(db, res.mockupObjectId, sam, 600);
      const out = Buffer.from(await (await fetch(grant.url)).arrayBuffer());
      const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
      const at = (x: number, y: number) => {
        const i = (y * info.width! + x) * info.channels!;
        return [data[i]!, data[i + 1]!, data[i + 2]!] as const;
      };
      // Output is the blank's own resolution (600×800 fits inside the zoom edge).
      expect(info.width).toBe(600);
      // Centre of the circle → the red design shows.
      const [r1] = at(300, 400);
      expect(r1).toBeGreaterThan(150);
      // Inside the QUAD but OUTSIDE the circle → the blank's grey (the design is clipped).
      const [r2, g2, b2] = at(140, 180);
      expect(Math.abs(r2 - 232) + Math.abs(g2 - 226) + Math.abs(b2 - 214)).toBeLessThan(45);
    } finally {
      await db.update(printTemplates).set({ maskObjectId: null, templateVersion: 1 }).where(eq(printTemplates.variantId, variantId));
      await db.delete(templateAssets).where(eq(templateAssets.id, ma!.id)).catch(() => {});
    }
  });

  it('composites a foreground OVERLAY over the design (jigsaw piece lines)', async () => {
    const assetId = await ingestDesign(); // solid red 1200×1500
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);

    // Full-frame overlay (same canvas as the blank): transparent except an opaque BLUE
    // patch over the design's centre — stands in for the die-cut lines sitting on the art.
    const overlayBuf = await sharp(
      Buffer.from('<svg width="600" height="800"><rect x="250" y="350" width="100" height="100" fill="rgb(40,90,220)"/></svg>'),
    ).png().toBuffer();
    const overlayKey = `templates/test-${ids.nonce}/overlay.png`;
    await putObject(overlayKey, overlayBuf, 'image/png');
    keys.push(overlayKey);
    const [oa] = await db
      .insert(templateAssets)
      .values({ kind: 'LIGHTING', bucket: process.env.S3_BUCKET!, key: overlayKey, contentType: 'image/png', byteSize: overlayBuf.byteLength, widthPx: 600, heightPx: 800 })
      .returning();
    await db.update(printTemplates).set({ lightingObjectId: oa!.id, templateVersion: 9 }).where(eq(printTemplates.variantId, variantId));

    try {
      const res = await composeMockup(db, sam, { assetId, variantId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 }, size: 'zoom' });
      const grant = await getStorageObjectGrant(db, res.mockupObjectId, sam, 600);
      const out = Buffer.from(await (await fetch(grant.url)).arrayBuffer());
      const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
      const at = (x: number, y: number) => {
        const i = (y * info.width! + x) * info.channels!;
        return [data[i]!, data[i + 1]!, data[i + 2]!] as const;
      };
      // Centre → the overlay's BLUE sits OVER the red design (blue dominates, not red).
      const [rC, , bC] = at(300, 400);
      expect(bC).toBeGreaterThan(rC + 40);
      // Inside the print area but OUTSIDE the overlay patch → the red design still shows.
      const [rD] = at(150, 200);
      expect(rD).toBeGreaterThan(150);
    } finally {
      await db.update(printTemplates).set({ lightingObjectId: null, templateVersion: 1 }).where(eq(printTemplates.variantId, variantId));
      await db.delete(templateAssets).where(eq(templateAssets.id, oa!.id)).catch(() => {});
    }
  });

  it('CONTAIN default (scale 0): the whole design fits, margins show the blank through', async () => {
    const assetId = await ingestDesign(); // solid red 1200×1500 (aspect 0.8) on a 0.75-aspect print area
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const res = await composeMockup(db, sam, { assetId, variantId, transform: { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 }, size: 'zoom' });
    const grant = await getStorageObjectGrant(db, res.mockupObjectId, sam, 600);
    const out = Buffer.from(await (await fetch(grant.url)).arrayBuffer());
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => {
      const i = (y * info.width! + x) * info.channels!;
      return [data[i]!, data[i + 1]!, data[i + 2]!] as const;
    };
    // Quad = x[120..480] y[160..640] on the 600×800 blank. Contain leaves ~10px bands top +
    // bottom INSIDE the print area where the grey blank shows through; the centre is design.
    const [rTop, gTop, bTop] = at(300, 163); // just inside the window's top edge → blank grey
    expect(Math.abs(rTop - 232) + Math.abs(gTop - 226) + Math.abs(bTop - 214)).toBeLessThan(45);
    const [rMid] = at(300, 400); // centre → the red design
    expect(rMid).toBeGreaterThan(150);
  });

  it('LIGHT_FABRIC composites MULTIPLY: design white vanishes into the fabric, ink darkens it', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    // A white design with a dark ink square in the middle (a drawing on white paper).
    const inkSquare = await sharp({ create: { width: 400, height: 500, channels: 3, background: { r: 40, g: 35, b: 30 } } }).png().toBuffer();
    const inkDesign = await sharp({ create: { width: 1200, height: 1500, channels: 3, background: '#ffffff' } })
      .composite([{ input: inkSquare, left: 400, top: 500 }])
      .png()
      .toBuffer();
    const r = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: inkDesign, keptInHome: true });
    keys.push(r.key);
    designAssetIds.push(r.assetId);
    await db.update(printTemplates).set({ materialClass: 'LIGHT_FABRIC', templateVersion: 8 }).where(eq(printTemplates.variantId, variantId));
    try {
      const res = await composeMockup(db, sam, { assetId: r.assetId, variantId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 }, size: 'zoom' });
      const grant = await getStorageObjectGrant(db, res.mockupObjectId, sam, 600);
      const out = Buffer.from(await (await fetch(grant.url)).arrayBuffer());
      const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
      const at = (x: number, y: number) => {
        const i = (y * info.width! + x) * info.channels!;
        return [data[i]!, data[i + 1]!, data[i + 2]!] as const;
      };
      // Inside the print area where the design is WHITE → the blank's grey fabric shows
      // through (multiply identity), NOT an opaque white panel.
      const [rW, gW, bW] = at(150, 200);
      expect(Math.abs(rW - 232) + Math.abs(gW - 226) + Math.abs(bW - 214)).toBeLessThan(45);
      // The ink square → clearly darker than the fabric.
      const [rI] = at(300, 380);
      expect(rI).toBeLessThan(120);
    } finally {
      await db.update(printTemplates).set({ materialClass: 'PAPER', templateVersion: 1 }).where(eq(printTemplates.variantId, variantId));
    }
  });

  it('PERSPECTIVE view: an alternate mockup_view warps the design onto a SKEWED quad', async () => {
    const assetId = await ingestDesign(); // solid red 1200×1500
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    // A 'tin'-style alternate view: a grey blank + a SKEWED (perspective) quad — not axis-aligned.
    const blank = await sharp({ create: { width: 600, height: 600, channels: 3, background: { r: 180, g: 180, b: 188 } } }).png().toBuffer();
    const skewed: [number, number][] = [[0.30, 0.12], [0.72, 0.26], [0.60, 0.72], [0.20, 0.56]]; // TL,TR,BR,BL
    await setMockupView(db, { variantId, view: 'tin', blank, contentType: 'image/png', printQuad: skewed, printWidthPx: 400, printHeightPx: 300, materialClass: 'PAPER' });
    try {
      const res = await composeMockup(db, sam, { assetId, variantId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 }, view: 'tin', size: 'zoom' });
      expect(res.tier).toBe('PERSPECTIVE'); // the skewed quad routed through the warp, not the flat bbox
      const grant = await getStorageObjectGrant(db, res.mockupObjectId, sam, 600);
      const out = Buffer.from(await (await fetch(grant.url)).arrayBuffer());
      const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
      const at = (x: number, y: number) => {
        const i = (y * info.width! + x) * info.channels!;
        return [data[i]!, data[i + 1]!, data[i + 2]!] as const;
      };
      expect(info.width).toBe(600);
      // Centroid of the quad (~0.455, 0.415) → the warped RED design shows.
      const [rC] = at(Math.round(0.455 * 600), Math.round(0.415 * 600));
      expect(rC).toBeGreaterThan(150);
      // A corner well OUTSIDE the skewed quad → the grey blank shows through (art didn't leak).
      const [r2, g2, b2] = at(560, 40);
      expect(Math.abs(r2 - 180) + Math.abs(g2 - 180) + Math.abs(b2 - 188)).toBeLessThan(45);
    } finally {
      await db.delete(mockupViews).where(and(eq(mockupViews.variantId, variantId), eq(mockupViews.view, 'tin'))).catch(() => {});
    }
  });

  it('spanHalf=front (full-width CLOSED card): the front panel shows the design’s RIGHT half', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    // A design split blue (left half) | red (right half) so a horizontal crop is provable.
    const strip = (rgb: { r: number; g: number; b: number }) => sharp({ create: { width: 600, height: 1500, channels: 3, background: rgb } }).png().toBuffer();
    const split = await sharp({ create: { width: 1200, height: 1500, channels: 3, background: '#000000' } })
      .composite([
        { input: await strip({ r: 40, g: 90, b: 220 }), left: 0, top: 0 }, // left half → blue
        { input: await strip({ r: 220, g: 70, b: 60 }), left: 600, top: 0 }, // right half → red
      ])
      .png()
      .toBuffer();
    const r = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: split, keptInHome: true });
    keys.push(r.key);
    designAssetIds.push(r.assetId);

    // A skewed (PERSPECTIVE) portrait card-front view — the closed-card hero, like the greetings card.
    const blank = await sharp({ create: { width: 600, height: 600, channels: 3, background: { r: 180, g: 180, b: 188 } } }).png().toBuffer();
    const skewed: [number, number][] = [[0.30, 0.12], [0.72, 0.26], [0.60, 0.72], [0.20, 0.56]];
    await setMockupView(db, { variantId, view: 'tin', blank, contentType: 'image/png', printQuad: skewed, printWidthPx: 400, printHeightPx: 560, materialClass: 'PAPER' });
    try {
      const tf = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 };
      const full = await composeMockup(db, sam, { assetId: r.assetId, variantId, transform: tf, view: 'tin', size: 'zoom' });
      const front = await composeMockup(db, sam, { assetId: r.assetId, variantId, transform: tf, view: 'tin', size: 'zoom', spanHalf: 'front' });
      // The span forks the cache key → its own derivative; it never collides with the full render.
      expect(front.key).not.toBe(full.key);
      expect(front.mockupObjectId).not.toBe(full.mockupObjectId);
      expect(front.tier).toBe('PERSPECTIVE');

      const raw = async (id: string) => {
        const grant = await getStorageObjectGrant(db, id, sam, 600);
        const out = Buffer.from(await (await fetch(grant.url)).arrayBuffer());
        return sharp(out).raw().toBuffer({ resolveWithObject: true });
      };
      const a = await raw(full.mockupObjectId);
      const b = await raw(front.mockupObjectId);
      const at = (buf: typeof a, x: number, y: number) => {
        const i = (y * buf.info.width! + x) * buf.info.channels!;
        return [buf.data[i]!, buf.data[i + 1]!, buf.data[i + 2]!] as const;
      };
      // Centroid of the skewed quad (~0.455, 0.415): for the FRONT half it lands on the RED (right)
      // side; RED clearly dominates BLUE → the closed card really shows the design's right half.
      const cx = Math.round(0.455 * 600), cy = Math.round(0.415 * 600);
      const [rF, , bF] = at(b, cx, cy);
      expect(rF).toBeGreaterThan(bF + 40);
      // …and it is a genuinely different render from the full-design view (the crop moved pixels).
      expect(Buffer.compare(a.data, b.data)).not.toBe(0);
    } finally {
      await db.delete(mockupViews).where(and(eq(mockupViews.variantId, variantId), eq(mockupViews.view, 'tin'))).catch(() => {});
    }
  });

  it('falls back (bounded memory, no OOM) for an extreme-aspect design', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const wide = await ingestOriginalAsset(db, sam, {
      familyId: ids.hartleyId,
      kind: 'DRAWING',
      buffer: await sharp({ create: { width: 12000, height: 100, channels: 3, background: { r: 200, g: 100, b: 50 } } }).png().toBuffer(),
      keptInHome: true,
    });
    keys.push(wide.key);
    designAssetIds.push(wide.assetId);
    await expect(
      composeMockup(db, sam, { assetId: wide.assetId, variantId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } }),
    ).rejects.toBeInstanceOf(NoMockupTemplateError);
  });
});
