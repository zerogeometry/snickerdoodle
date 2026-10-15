import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { printTemplates, products, productVariants, storageObjects, templateAssets } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError } from '@/authz';
import { getStorageObjectGrant, resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { mmToPx, seedCatalogue } from '@/server/catalogue';
import { renderPrintFile } from '@/server/print/render';
import { deleteObject, getObjectBytes, getS3, putObject } from '@/storage';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;

// A solid-colour source of given dimensions (compresses tiny).
const src = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 120, b: 60 } } }).png().toBuffer();

// The default framed print's canvas = print px + bleed on every side. Derived from the seeded
// template in beforeAll so the test survives catalogue geometry changes (e.g. the default size).
let CANVAS_W = 0;
let CANVAS_H = 0;

describe.skipIf(!DB || !S3)('print-file render — integration', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  let variantId = '';
  let cushionDualVariantId = '';
  let cushionSingleVariantId = '';
  const keys: string[] = [];

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
    const [v] = await db.select().from(productVariants).where(eq(productVariants.sku, 'framedPrint'));
    variantId = v!.id;
    const [cd] = await db.select().from(productVariants).where(eq(productVariants.sku, 'cushion-12square-double'));
    const [cs] = await db.select().from(productVariants).where(eq(productVariants.sku, 'cushion-12square'));
    cushionDualVariantId = cd!.id;
    cushionSingleVariantId = cs!.id;
    const [tpl] = await db.select().from(printTemplates).where(eq(printTemplates.variantId, variantId));
    const bleedPx = mmToPx(tpl!.bleedMm, tpl!.requiredDpi);
    CANVAS_W = tpl!.printWidthPx + 2 * bleedPx;
    CANVAS_H = tpl!.printHeightPx + 2 * bleedPx;
  });

  afterAll(async () => {
    for (const k of keys) await deleteObject(k).catch(() => {});
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  async function ingest(buf: Buffer) {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const r = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: buf, keptInHome: true });
    keys.push(r.key);
    return r.assetId;
  }

  it('renders a print file at exactly the bleed canvas + the product DPI, without an upscale', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const assetId = await ingest(await src(4200, 5400)); // plenty of resolution for the 11×14 canvas
    const res = await renderPrintFile(db, sam, { assetId, variantId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } });
    keys.push(res.key);

    expect(res).toMatchObject({ widthPx: CANVAS_W, heightPx: CANVAS_H, renderedDpi: 300, upscaled: false });

    // fetch the rendered file via the authz-gated grant; check its real pixels + DPI
    const grant = await getStorageObjectGrant(db, res.printObjectId, sam);
    const fetched = Buffer.from(await (await fetch(grant.url)).arrayBuffer());
    const meta = await sharp(fetched).metadata();
    expect(meta.width).toBe(CANVAS_W);
    expect(meta.height).toBe(CANVAS_H);
    expect(meta.density).toBe(300);

    // the ORIGINAL is untouched (still its source dimensions, not the canvas)
    const [orig] = await db.select().from(storageObjects).where(and(eq(storageObjects.assetId, assetId), eq(storageObjects.objectClass, 'ORIGINAL')));
    const origGrant = await getStorageObjectGrant(db, orig!.id, sam);
    const origMeta = await sharp(Buffer.from(await (await fetch(origGrant.url)).arrayBuffer())).metadata();
    expect(origMeta.width).toBe(4200);
    expect(origMeta.height).toBe(5400);
    // and a DERIVATIVE print file now exists alongside it
    const derivs = await db.select().from(storageObjects).where(and(eq(storageObjects.assetId, assetId), eq(storageObjects.objectClass, 'DERIVATIVE')));
    expect(derivs.length).toBeGreaterThanOrEqual(1);
    expect(derivs[0]!.writeOnce).toBe(true);
  });

  it('flags an upscale for a low-res source (still fills the canvas)', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const assetId = await ingest(await src(1200, 1680));
    const res = await renderPrintFile(db, sam, { assetId, variantId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } });
    keys.push(res.key);
    expect(res.upscaled).toBe(true);
    expect(res.effectiveDpi).toBeLessThan(300);
    expect(res.widthPx).toBe(CANVAS_W); // still rendered to spec
  });

  it('CONTAIN default (scale 0): whole image on the print file, white margins, canvas exact', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const assetId = await ingest(await src(4200, 5400)); // aspect 0.778 vs canvas ~0.787 → thin side margins
    const res = await renderPrintFile(db, sam, { assetId, variantId, transform: { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 } });
    keys.push(res.key);
    expect(res).toMatchObject({ widthPx: CANVAS_W, heightPx: CANVAS_H }); // the canvas never shrinks

    const grant = await getStorageObjectGrant(db, res.printObjectId, sam);
    const fetched = Buffer.from(await (await fetch(grant.url)).arrayBuffer());
    const { data, info } = await sharp(fetched).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => {
      const i = (y * info.width! + x) * info.channels!;
      return [data[i]!, data[i + 1]!, data[i + 2]!] as const;
    };
    const [rEdge, gEdge, bEdge] = at(3, Math.round(CANVAS_H / 2)); // inside the left margin → white
    expect(rEdge + gEdge + bEdge).toBeGreaterThan(720);
    const [rMid, gMid, bMid] = at(Math.round(CANVAS_W / 2), Math.round(CANVAS_H / 2)); // centre → the design
    expect(Math.abs(rMid - 200) + Math.abs(gMid - 120) + Math.abs(bMid - 60)).toBeLessThan(60);
  });

  it('BLOCKS a source too low-res to print', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const assetId = await ingest(await src(400, 560));
    await expect(renderPrintFile(db, sam, { assetId, variantId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } })).rejects.toThrow();
  });

  it('refuses to render for a viewer who may not see the asset (no print file produced)', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const assetId = await ingest(await src(3000, 4200)); // a FAMILY asset
    const rosie = await resolveViewerContext(db, ids.rosieId, ids.hartleyId); // Extended circle → denied
    await expect(renderPrintFile(db, rosie, { assetId, variantId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } })).rejects.toBeInstanceOf(AuthzError);
    // nothing was written
    const derivs = await db.select().from(storageObjects).where(and(eq(storageObjects.assetId, assetId), eq(storageObjects.objectClass, 'DERIVATIVE')));
    expect(derivs).toHaveLength(0);
    void sam;
  });

  // Shared pixel helpers (used by the overlay-leak test + the DUAL cushion tests below).
  const DESIGN = [200, 120, 60] as const; // the src() fill
  const BERRY = [0xe8, 0x78, 0x6e] as const; // CUSHION_BACK_COLOURS berry #E8786E
  const nearTo = (got: readonly number[], want: readonly number[]) =>
    Math.abs(got[0]! - want[0]!) + Math.abs(got[1]! - want[1]!) + Math.abs(got[2]! - want[2]!);
  async function facePixels(printObjectId: string) {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const grant = await getStorageObjectGrant(db, printObjectId, sam);
    const { data, info } = await sharp(Buffer.from(await (await fetch(grant.url)).arrayBuffer())).raw().toBuffer({ resolveWithObject: true });
    return {
      w: info.width!,
      h: info.height!,
      at: (x: number, y: number) => {
        const i = (Math.round(y) * info.width! + Math.round(x)) * info.channels!;
        return [data[i]!, data[i + 1]!, data[i + 2]!] as const;
      },
    };
  }

  it('DISPLAY-ONLY overlay (the cushion plumpness lives here) can NEVER reach the print file', async () => {
    // The founder's plumpness.png is stored on the template's lightingObjectId and composited
    // ONLY by the mockup pipeline. Prove the PRINT path ignores it: hang a maximally-visible
    // display overlay — a FULLY OPAQUE BLACK sheet — on a variant's lightingObjectId, then render.
    // If renderPrintFile ever composited it the file would come back black; it must stay the
    // child's design (the print path reads only the print GEOMETRY). Uses the SINGLE cushion
    // variant — its own lightingObjectId, untouched by the other suites that share framedPrint —
    // and a unique-per-run key + a self-healing restore, so parallel runs never poison it.
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const leakVariantId = cushionSingleVariantId;
    const { bucket } = getS3();
    const overlayKey = `templates/render-leak-${ids.nonce}/overlay.png`;
    const black = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
    await putObject(overlayKey, black, 'image/png');
    keys.push(overlayKey);
    const [oa] = await db
      .insert(templateAssets)
      .values({ kind: 'LIGHTING', bucket, key: overlayKey, contentType: 'image/png', byteSize: black.byteLength, widthPx: 64, heightPx: 64 })
      .returning();
    const [tplBefore] = await db.select().from(printTemplates).where(eq(printTemplates.variantId, leakVariantId));
    await db.update(printTemplates).set({ lightingObjectId: oa!.id }).where(eq(printTemplates.variantId, leakVariantId));
    try {
      const assetId = await ingest(await src(2400, 2400));
      const res = await renderPrintFile(db, sam, { assetId, variantId: leakVariantId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } });
      keys.push(res.key);
      // Cover placement fills the (single square) face → every sample must be the DESIGN colour,
      // never the overlay's black. A leak would drive nearTo() toward 3×200.
      const px = await facePixels(res.printObjectId);
      for (const [x, y] of [[px.w >> 1, px.h >> 1], [12, 12], [px.w - 12, px.h - 12]] as const) {
        expect(nearTo(px.at(x, y), DESIGN), `print pixel ${x},${y} is the design, not the display overlay`).toBeLessThan(60);
      }
    } finally {
      // Restore best-effort, never leaving a DANGLING lightingObjectId (fall back to null — the
      // cushion has no overlay in the test DB), then drop the throwaway asset.
      await db
        .update(printTemplates)
        .set({ lightingObjectId: tplBefore?.lightingObjectId ?? null })
        .where(eq(printTemplates.variantId, leakVariantId))
        .catch(() => db.update(printTemplates).set({ lightingObjectId: null }).where(eq(printTemplates.variantId, leakVariantId)));
      await db.delete(templateAssets).where(eq(templateAssets.id, oa!.id)).catch(() => {});
    }
  });

  it('DUAL + colour back → double-wide [image | colour], front left, back right, both upright', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const assetId = await ingest(await src(2400, 2400)); // fills a 12″-square face at 150dpi, no upscale
    const res = await renderPrintFile(db, sam, { assetId, variantId: cushionDualVariantId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 }, back: 'berry' });
    keys.push(res.key);
    expect(res.widthPx).toBe(res.heightPx * 2); // two SQUARE faces side by side
    const px = await facePixels(res.printObjectId);
    expect(px.w).toBe(px.h * 2);
    expect(nearTo(px.at(px.w * 0.25, px.h * 0.5), DESIGN), 'left face is the image').toBeLessThan(60);
    expect(nearTo(px.at(px.w * 0.75, px.h * 0.5), BERRY), 'right face is the berry back').toBeLessThan(60);
  });

  it('DUAL + "both" (or junk/forged) → the SAME image on both faces (safe default, never a broken face)', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    for (const back of ['both', 'periwinkle-not-a-real-token']) {
      const assetId = await ingest(await src(2400, 2400));
      const res = await renderPrintFile(db, sam, { assetId, variantId: cushionDualVariantId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 }, back });
      keys.push(res.key);
      const px = await facePixels(res.printObjectId);
      expect(px.w).toBe(px.h * 2);
      expect(nearTo(px.at(px.w * 0.25, px.h * 0.5), DESIGN), `left face is the image (back=${back})`).toBeLessThan(60);
      expect(nearTo(px.at(px.w * 0.75, px.h * 0.5), DESIGN), `right face is ALSO the image (back=${back})`).toBeLessThan(60);
    }
  });

  it('SINGLE cushion is untouched — a forged colour back is IGNORED (one square face, never doubled)', async () => {
    // The variant's `sides` attribute (server, from the DB) is authoritative, NOT the client-supplied
    // back: a colour back on the single-sided SKU must never smuggle in a second face.
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const assetId = await ingest(await src(2400, 2400));
    const res = await renderPrintFile(db, sam, { assetId, variantId: cushionSingleVariantId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 }, back: 'berry' });
    keys.push(res.key);
    expect(res.widthPx).toBe(res.heightPx); // ONE square face, not double-wide
    const px = await facePixels(res.printObjectId);
    expect(px.w).toBe(px.h);
    expect(nearTo(px.at(px.w * 0.5, px.h * 0.5), DESIGN), 'the single face is the image').toBeLessThan(60);
  });

  it('BLANKET landscape variant rotates the print file 90° back to Prodigi’s fixed PORTRAIT', async () => {
    // Orientation is ours (like the frame/jigsaw): Prodigi's blanket print file is fixed PORTRAIT.
    // A landscape variant designs on a SWAPPED canvas, then the fulfilment render rotates the
    // finished file 90° back — so BOTH orientations ship a portrait file of identical dimensions.
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const [portrait] = await db.select().from(productVariants).where(eq(productVariants.sku, 'blanket'));
    const [landscape] = await db.select().from(productVariants).where(eq(productVariants.sku, 'blanket-medium-landscape'));
    const assetId = await ingest(await src(6000, 6000)); // covers either 150dpi canvas without an upscale
    const p = await renderPrintFile(db, sam, { assetId, variantId: portrait!.id, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } });
    keys.push(p.key);
    const l = await renderPrintFile(db, sam, { assetId, variantId: landscape!.id, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } });
    keys.push(l.key);
    expect(p.heightPx).toBeGreaterThan(p.widthPx); // native portrait file
    expect(l.heightPx).toBeGreaterThan(l.widthPx); // landscape variant rotated 90° back → also portrait
    expect(l.widthPx).toBe(p.widthPx); // identical Prodigi portrait canvas
    expect(l.heightPx).toBe(p.heightPx);
  });

  it('a GREETINGS CARD renders the flat 4-panel spread (6236×2220), not a single face', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const [card] = await db
      .select({ id: productVariants.id })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(eq(products.key, 'card'));
    const assetId = await ingest(await src(1600, 2200)); // enough for a 5×7 panel at 300dpi
    const msg = { greeting: 'Happy Birthday, Mabel!', message: 'Hope it is lovely.', signature: 'love, Mum x', note: 'for you', font: 'caveat', fontScale: 1 };
    const res = await renderPrintFile(db, sam, { assetId, variantId: card!.id, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 }, message: msg, cardSpan: 'full' });
    keys.push(res.key);
    // The card's own 4-panel artboard — NOT the single 5×7 face.
    expect(res).toMatchObject({ widthPx: 6236, heightPx: 2220, renderedDpi: 300 });
    const grant = await getStorageObjectGrant(db, res.printObjectId, sam);
    const meta = await sharp(Buffer.from(await (await fetch(grant.url)).arrayBuffer())).metadata();
    expect(meta.width).toBe(6236);
    expect(meta.height).toBe(2220);

    // Defence in depth: an abusive inside message is REJECTED at the PRINT boundary too, not just at
    // order time — the print renderer re-screens and refuses to lay it onto a keepsake.
    await expect(
      renderPrintFile(db, sam, {
        assetId,
        variantId: card!.id,
        transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 },
        message: { ...msg, message: 'you fucking idiot' },
      }),
    ).rejects.toThrow(/can’t be printed/);
  });

  describe('tees print from a SEE-THROUGH file (never a white rectangle); coloured tees get firm edges', () => {
    // a cut-out: an opaque red square, a faint band (alpha 100) and a strong band (alpha 200)
    const cutout = () =>
      sharp({ create: { width: 1500, height: 1500, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([
          { input: { create: { width: 600, height: 600, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } } }, left: 450, top: 450 },
          { input: { create: { width: 1500, height: 100, channels: 4, background: { r: 30, g: 30, b: 200, alpha: 100 / 255 } } }, left: 0, top: 100 },
          { input: { create: { width: 1500, height: 100, channels: 4, background: { r: 30, g: 30, b: 200, alpha: 200 / 255 } } }, left: 0, top: 1300 },
        ])
        .png()
        .toBuffer();
    const variant = async (sku: string) => (await db.select().from(productVariants).where(eq(productVariants.sku, sku)))[0]!.id;
    const alphaAt = async (key: string) => {
      const { data, info } = await sharp(await getObjectBytes(key)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      return (fx: number, fy: number) => data[(Math.round(fy * (info.height - 1)) * info.width + Math.round(fx * (info.width - 1))) * 4 + 3]!;
    };

    it('a navy tee: transparent around the art, faint pixels dropped, strong ones solid', async () => {
      const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
      const assetId = await ingest(await cutout());
      const res = await renderPrintFile(db, sam, { assetId, variantId: await variant('kidsTee-34years-frenchnavy'), transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } });
      keys.push(res.key);
      // no trim on a garment: the file IS Prodigi's 3070×3070 front print area, at half scale (150dpi)
      expect([res.widthPx, res.heightPx]).toEqual([1535, 1535]);
      const a = await alphaAt(res.key);
      expect(a(0.02, 0.5)).toBe(0); // no paper, no rectangle
      expect(a(0.5, 0.5)).toBe(255); // the art
      expect(a(0.5, 0.1)).toBe(0); // faint band: wouldn't print cleanly → not at all
      expect(a(0.5, 0.9)).toBe(255); // strong band: solid
    });

    it('a white tee: still see-through around the art, soft edges kept (ink only, no underbase)', async () => {
      const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
      const assetId = await ingest(await cutout());
      const res = await renderPrintFile(db, sam, { assetId, variantId: await variant('kidsTee'), transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } });
      keys.push(res.key);
      const a = await alphaAt(res.key);
      expect(a(0.02, 0.5)).toBe(0);
      expect(a(0.5, 0.1)).toBeGreaterThan(60);
      expect(a(0.5, 0.1)).toBeLessThan(140);
    });
  });
});
