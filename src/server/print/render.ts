import './sharp-init';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { printTemplates, productVariants, products, storageObjects } from '@/db/schema';
import { getViewableAssetOrThrow } from '@/server/assets';
import { CUSHION_BACK_MATCH, cushionBackHex, normalizeCushionBack } from '@/lib/catalogue-view';
import { PRODIGI_NATIVE_ORIENTATION } from '@/server/catalogue';
import { derivativeKey, getObjectBytes, getS3, putObject } from '@/storage';
import type { ViewerContext } from '@/authz';
import type { DbHandle } from '@/server/db';
import { assessResolution, clampTransform, computeLayerRect, type RawTransform } from './geometry';
import { ensurePrintSharp, resolvePrintSource } from './upscale';
import { DTG_GARMENT_KEYS, firmEdges } from './apparel';
import { isDarkGarment } from '@/lib/garments';
import { screenCardMessage } from '@/server/textSafety';
import { assembleCardPrintSpread, CARD_SPREAD } from './cardPrint';
import { renderCardBackBadge } from './cardBranding';

export type UpscaleMethod = 'none' | 'classical' | 'super-res';

export interface RenderResult {
  printObjectId: string;
  key: string;
  renderedDpi: number;
  effectiveDpi: number;
  upscaled: boolean;
  /** How the source was enlarged: not at all, the classical resample, or super-resolution. */
  upscaleMethod: UpscaleMethod;
  widthPx: number;
  heightPx: number;
}

/**
 * Render a print-ready file for an asset on a product variant (proposal/04 §4.4).
 * Server-authoritative throughout: authz-gated, the transform is clamped here, the
 * geometry comes from the template, and the output is exactly the bleed canvas at
 * the product's DPI. The ORIGINAL is never mutated — the result is a write-once
 * DERIVATIVE. Self-hosted: no third party sees the image. The upscale is tiered: up to
 * 2× the classical resample; past that the print is made from the print-sharp
 * (super-resolved) copy of the source, made here if it doesn't exist yet (./upscale.ts).
 * The DPI gate always judges the SOURCE's real pixels, never the copy's.
 */
export async function renderPrintFile(
  db: DbHandle,
  viewer: ViewerContext,
  input: {
    assetId: string;
    variantId: string;
    transform: RawTransform;
    /** Render from a SPECIFIC stored object (e.g. a bg-removed cutout) — must belong to the asset. */
    sourceObjectId?: string;
    /** CUSHION back choice, honoured ONLY on a double-sided (DUAL) cushion variant: 'both' (or
     * null/unknown) = the same image on both faces; a CUSHION_BACK_COLOURS token = image front +
     * that plain-colour back. Ignored entirely on any non-DUAL variant (the SKU is authoritative). */
    back?: string;
    /** GREETINGS-CARD frozen inside message (re-screened here) — the note + greeting/message/
     * signature laid into the two inside panels. null/absent ⇒ a blank (write-by-hand) inside. */
    message?: unknown;
    /** GREETINGS-CARD outer span: 'full' = the design across rear+front; else the front panel. */
    cardSpan?: string;
  },
): Promise<RenderResult> {
  await getViewableAssetOrThrow(db, input.assetId, viewer); // ← the gate

  const [tpl] = await db.select().from(printTemplates).where(eq(printTemplates.variantId, input.variantId));
  if (!tpl) throw new Error('no print template for this variant');

  // Only a real print source (original / cutout / design) — never a print file or an upscaled copy.
  const srcObj = await resolvePrintSource(db, input.assetId, input.sourceObjectId);
  if (!srcObj) throw new Error('no source object to render from');

  const srcBuf = await getObjectBytes(srcObj.key);
  const meta = await sharp(srcBuf).metadata();
  const src = { width: meta.width ?? 0, height: meta.height ?? 0 };
  if (!src.width || !src.height) throw new Error('unreadable source image');

  const transform = clampTransform(input.transform);
  const geom = { printWidthPx: tpl.printWidthPx, printHeightPx: tpl.printHeightPx, bleedMm: tpl.bleedMm, requiredDpi: tpl.requiredDpi };
  const assess = assessResolution(geom, src, transform);
  if (assess.decision === 'BLOCK') {
    throw new Error(`source too low-res for this product (would need ${assess.upscaleFactor.toFixed(1)}× upscale)`);
  }

  // Tiered upscale. ≤2× → the classical resample below. More → print from the print-sharp copy
  // (made now if a tap hasn't already). If super-resolution can't run, classical it is — the
  // source already cleared the floor, so it still prints, just softer up close.
  let printSrc = srcBuf;
  let upscaleMethod: UpscaleMethod = assess.decision === 'UPSCALE' ? 'classical' : 'none';
  if (assess.decision === 'UPSCALE' && assess.tier === 1) {
    const copy = await ensurePrintSharp(db, input.assetId, srcObj, srcBuf).catch((e: unknown) => {
      console.warn('[print] print-sharp copy failed; using the classical resample:', e instanceof Error ? e.message : e);
      return null;
    });
    if (copy) {
      printSrc = copy.buffer;
      upscaleMethod = 'super-res';
    }
  }
  const persist = (out: Buffer, w: number, h: number) =>
    persistPrintFile(db, input.assetId, input.variantId, out, tpl.requiredDpi, assess.effectiveDpi, upscaleMethod, w, h);

  // Orientation is OURS: a variant in the NON-native orientation designs on a SWAPPED
  // canvas, so the finished print file rotates 90° back to Prodigi's FIXED spec. Frames are
  // fixed-portrait (rotate the landscape variant); jigsaw boards are fixed-landscape (rotate
  // the portrait variant). "Preview the exact print file" shows this same rotated file —
  // exactly what the printer receives. Unknown/no orientation ⇒ never rotate.
  const [variantRow] = await db
    .select({ attributes: productVariants.attributes, key: products.key })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(eq(productVariants.id, input.variantId));
  const orientation = ((variantRow?.attributes as Record<string, string>) ?? {}).orientation;
  const nativeOri = (variantRow?.key ? PRODIGI_NATIVE_ORIENTATION[variantRow.key] : undefined) ?? 'portrait';
  const landscape = !!orientation && orientation !== nativeOri; // "landscape" = "needs the 90° rotate"
  // A double-sided (DUAL) cushion prints TWO square faces into one double-wide file [front | back],
  // both upright — Prodigi's single "default" print area (their template is a 2:1 artboard). The
  // SKU's `sides` attribute is authoritative here; a `back` on any other variant is ignored. Cushion
  // faces are square, so DUAL never rotates.
  const dual = ((variantRow?.attributes as Record<string, string>) ?? {}).sides === 'double';

  let out: Buffer;
  let outW: number;
  let outH: number;

  // A GREETINGS CARD prints as one flat 4-panel spread (Prodigi 'default' area), NOT the single
  // face — [ outer rear (branding) | outer front (design) | inside front (note) | inside back
  // (message) ]. The message is RE-SCREENED here (never trust the stored value) so the print can't
  // carry text the screen would reject. In-VPC like every other render; the POD egress gate is the
  // separate downstream chokepoint.
  if (variantRow?.key === 'card') {
    const screen = screenCardMessage(input.message as Parameters<typeof screenCardMessage>[0]);
    if (!screen.ok) throw new Error(`the card ${screen.field} can’t be printed — please reword it`);
    out = await assembleCardPrintSpread({
      design: printSrc,
      transform,
      span: input.cardSpan === 'full' ? 'full' : 'front',
      message: screen.value,
      branding: renderCardBackBadge(), // the founder's Snickerdoodle logo on the outer rear
    });
    outW = CARD_SPREAD.widthPx;
    outH = CARD_SPREAD.heightPx;
    return persist(out, outW, outH);
  }

  // Placement comes from the SOURCE's dims; the print-sharp copy (same aspect) is just drawn into it.
  const rect = computeLayerRect(geom, src, transform);
  // rotate → scale to the drawn rect → INTERSECT with the canvas and place at its offset
  // on a white canvas. Handles both regimes: cover/zoom (layer ≥ canvas → crop, offset 0,
  // identical to the old extract) and contain/zoom-out (layer < canvas → whole image
  // placed centred with white margins — unprinted product surface).
  const layer = await sharp(printSrc).rotate(transform.rotationDeg).resize(rect.width, rect.height, { fit: 'fill', kernel: 'lanczos3' }).toBuffer();
  const ix = Math.max(0, -rect.x);
  const iy = Math.max(0, -rect.y);
  const ox = Math.max(0, rect.x);
  const oy = Math.max(0, rect.y);
  const iw = Math.max(1, Math.min(rect.width - ix, rect.canvasWidth - ox));
  const ih = Math.max(1, Math.min(rect.height - iy, rect.canvasHeight - oy));
  const part = await sharp(layer).extract({ left: ix, top: iy, width: iw, height: ih }).png().toBuffer();

  outW = rect.canvasWidth;
  outH = rect.canvasHeight;
  // A garment (DTG) prints from a SEE-THROUGH file — never flattened, or a coloured tee gets a white
  // rectangle — and on a coloured garment the edges are firm, exactly as the preview shows them.
  if (variantRow?.key && DTG_GARMENT_KEYS.has(variantRow.key)) {
    const colour = ((variantRow.attributes as Record<string, string>) ?? {}).colour;
    const ink = isDarkGarment(colour) ? await firmEdges(part) : part;
    out = await sharp({ create: { width: rect.canvasWidth, height: rect.canvasHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: ink, left: ox, top: oy }])
      .png()
      .withMetadata({ density: tpl.requiredDpi })
      .toBuffer();
    return persist(out, outW, outH);
  }

  // The child's image placed on ONE opaque white face — the single-sided print file, and the
  // FRONT (left) face of a DUAL cushion.
  const face = await sharp({ create: { width: rect.canvasWidth, height: rect.canvasHeight, channels: 3, background: '#ffffff' } })
    .composite([{ input: part, left: ox, top: oy }])
    .png()
    .toBuffer();

  if (dual) {
    // BACK (right) face: a known palette colour → a solid fill; 'both' / null / unknown → the same
    // image again (image-both-sides), the safe default so the customer always gets their artwork.
    const back = normalizeCushionBack(input.back);
    const backColour = back && back !== CUSHION_BACK_MATCH ? cushionBackHex(back) : null;
    const backFace = backColour
      ? await sharp({ create: { width: rect.canvasWidth, height: rect.canvasHeight, channels: 3, background: backColour } }).png().toBuffer()
      : face;
    outW = rect.canvasWidth * 2;
    out = await sharp({ create: { width: outW, height: outH, channels: 3, background: '#ffffff' } })
      .composite([{ input: face, left: 0, top: 0 }, { input: backFace, left: rect.canvasWidth, top: 0 }])
      .flatten({ background: '#ffffff' })
      .png()
      .withMetadata({ density: tpl.requiredDpi })
      .toBuffer();
  } else {
    out = await sharp(face).flatten({ background: '#ffffff' }).png().withMetadata({ density: tpl.requiredDpi }).toBuffer();
    if (landscape) {
      out = await sharp(out).rotate(90).png().withMetadata({ density: tpl.requiredDpi }).toBuffer();
      outW = rect.canvasHeight;
      outH = rect.canvasWidth;
    }
  }

  return persist(out, outW, outH);
}

/** Write the finished print file as a deterministic write-once DERIVATIVE (idempotent re-render
 * overwrites the same key) and return the render result. Shared by every product path, so the
 * card's 4-panel spread persists identically to a single-face print. */
async function persistPrintFile(
  db: DbHandle,
  assetId: string,
  variantId: string,
  out: Buffer,
  renderedDpi: number,
  effectiveDpi: number,
  upscaleMethod: UpscaleMethod,
  widthPx: number,
  heightPx: number,
): Promise<RenderResult> {
  const key = derivativeKey(assetId, `printfile-${variantId}`);
  await putObject(key, out, 'image/png');
  const sha256 = createHash('sha256').update(out).digest('hex');
  const { bucket } = getS3();

  // Deterministic key → a re-render overwrites the same DERIVATIVE.
  const [existing] = await db.select({ id: storageObjects.id }).from(storageObjects).where(eq(storageObjects.key, key));
  let printObjectId: string;
  if (existing) {
    await db.update(storageObjects).set({ byteSize: out.byteLength, sha256 }).where(eq(storageObjects.id, existing.id));
    printObjectId = existing.id;
  } else {
    // Conflict-safe under the unique index on key: a concurrent racer that also saw no
    // existing row can't double-insert — the loser no-ops and we re-read the winner.
    const [row] = await db
      .insert(storageObjects)
      .values({ assetId, objectClass: 'DERIVATIVE', bucket, key, contentType: 'image/png', byteSize: out.byteLength, sha256, exifStripped: true, writeOnce: true })
      .onConflictDoNothing({ target: storageObjects.key })
      .returning();
    printObjectId = row?.id ?? (await db.select({ id: storageObjects.id }).from(storageObjects).where(eq(storageObjects.key, key)))[0]!.id;
  }

  return { printObjectId, key, renderedDpi, effectiveDpi, upscaled: upscaleMethod !== 'none', upscaleMethod, widthPx, heightPx };
}
