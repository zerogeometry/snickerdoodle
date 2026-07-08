import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { printTemplates, productVariants, storageObjects, templateAssets } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError } from '@/authz';
import { getStorageObjectGrant, resolveViewerContext } from '@/server/assets';
import { ingestOriginalAsset } from '@/server/ingest';
import { mmToPx, seedCatalogue } from '@/server/catalogue';
import { renderPrintFile } from '@/server/print/render';
import { deleteObject, getS3, putObject } from '@/storage';
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

  it('DISPLAY-ONLY overlay (the cushion plumpness lives here) can NEVER reach the print file', async () => {
    // The founder's plumpness.png is stored on the template's lightingObjectId and composited
    // ONLY by the mockup pipeline. Prove the PRINT path ignores it: hang a maximally-visible
    // display overlay on the template — a FULLY OPAQUE BLACK sheet — then render a print file.
    // If renderPrintFile ever composited the overlay, the file would come back black. It must
    // stay the child's design: the print path reads only the print GEOMETRY from the template.
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const { bucket } = getS3();
    const overlayKey = `templates/render-leak-${ids.hartleyId}/overlay.png`;
    const black = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
    await putObject(overlayKey, black, 'image/png');
    keys.push(overlayKey);
    const [oa] = await db
      .insert(templateAssets)
      .values({ kind: 'LIGHTING', bucket, key: overlayKey, contentType: 'image/png', byteSize: black.byteLength, widthPx: 64, heightPx: 64 })
      .returning();
    const [tplBefore] = await db.select().from(printTemplates).where(eq(printTemplates.variantId, variantId));
    await db.update(printTemplates).set({ lightingObjectId: oa!.id }).where(eq(printTemplates.variantId, variantId));
    try {
      const assetId = await ingest(await src(4200, 5400));
      const res = await renderPrintFile(db, sam, { assetId, variantId, transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 } });
      keys.push(res.key);
      const grant = await getStorageObjectGrant(db, res.printObjectId, sam);
      const { data, info } = await sharp(Buffer.from(await (await fetch(grant.url)).arrayBuffer())).raw().toBuffer({ resolveWithObject: true });
      const at = (x: number, y: number) => {
        const i = (y * info.width! + x) * info.channels!;
        return [data[i]!, data[i + 1]!, data[i + 2]!] as const;
      };
      // Cover placement fills the canvas → every sample must be the DESIGN colour (200,120,60),
      // never the overlay's black. A leak would drive the sum toward 0.
      for (const [x, y] of [[CANVAS_W >> 1, CANVAS_H >> 1], [12, 12], [CANVAS_W - 12, CANVAS_H - 12]] as const) {
        const [r, g, b] = at(x, y);
        expect(Math.abs(r - 200) + Math.abs(g - 120) + Math.abs(b - 60), `print pixel ${x},${y} is the design, not the display overlay`).toBeLessThan(60);
      }
    } finally {
      // restore the template + drop the throwaway overlay asset (leave the shared catalogue clean)
      await db.update(printTemplates).set({ lightingObjectId: tplBefore?.lightingObjectId ?? null }).where(eq(printTemplates.variantId, variantId));
      await db.delete(templateAssets).where(eq(templateAssets.id, oa!.id));
    }
  });

  // ── DUAL cushion fulfilment (task #123). A double-sided square cushion prints TWO square faces
  // into ONE double-wide file [front | back], both upright — Prodigi's single "default" print area
  // (their template is a 2:1 artboard, front left). The `back` selects the second face ONLY on a
  // DUAL variant (its `sides` attribute is authoritative); a `back` on any other SKU is ignored.
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
});
