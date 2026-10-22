import './sharp-init';
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { printTemplates, productVariants, products, storageObjects } from '@/db/schema';
import { getViewableAssetOrThrow } from '@/server/assets';
import { CUSHION_BACK_MATCH, cushionBackHex, normalizeCushionBack } from '@/lib/catalogue-view';
import { DESIGNED_TURNED, PRODIGI_NATIVE_ORIENTATION } from '@/server/catalogue';
import { groundHex, groundTag, isGroundProduct, isPatternProduct, normalizeGround } from '@/lib/patterns';
import { CARD_PACK_KEY } from '@/lib/card-packs';
import { derivativeKey, getObjectBytes, getS3, putObject } from '@/storage';
import type { ViewerContext } from '@/authz';
import type { DbHandle } from '@/server/db';
import { assessResolution, canvasSizePx, clampTransform, computeLayerRect, type RawTransform } from './geometry';
import { renderRepeatPattern } from './pattern';
import { renderHeightChartFace } from './heightChart';
import { isHeightChart } from './height-chart-geometry';
import { assessPrintResolution } from './pattern-geometry';
import { DTG_GARMENT_KEYS, firmEdges } from './apparel';
import { isDarkGarment } from '@/lib/garments';
import { screenCardMessage } from '@/server/textSafety';
import { assembleCardPrintSpread, CARD_SPREAD } from './cardPrint';
import { renderCardBackBadge } from './cardBranding';

export interface RenderResult {
  printObjectId: string;
  key: string;
  renderedDpi: number;
  effectiveDpi: number;
  upscaled: boolean;
  widthPx: number;
  heightPx: number;
}

/**
 * Render a print-ready file for an asset on a product variant (proposal/04 §4.4).
 * Server-authoritative throughout: authz-gated, the transform is clamped here, the
 * geometry comes from the template, and the output is exactly the bleed canvas at
 * the product's DPI. The ORIGINAL is never mutated — the result is a write-once
 * DERIVATIVE. (Self-hosted: no third party sees the image. Real ML super-resolution
 * for large enlargements lands in P2; P1 uses classical resampling.)
 */
export async function renderPrintFile(
  db: DbHandle,
  viewer: ViewerContext,
  input: {
    assetId: string;
    variantId: string;
    transform: RawTransform;
    sourceObjectClass?: 'ORIGINAL' | 'DERIVATIVE';
    /** Render from a SPECIFIC stored object (e.g. a bg-removed cutout) — must belong to the asset. */
    sourceObjectId?: string;
    /** CUSHION back choice, honoured ONLY on a double-sided (DUAL) cushion variant: 'both' (or
     * null/unknown) = the same image on both faces; a CUSHION_BACK_COLOURS token = image front +
     * that plain-colour back. Ignored entirely on any non-DUAL variant (the SKU is authoritative). */
    back?: string;
    /** BASE COLOUR (#rrggbb) of an edge-to-edge product (GROUND_PRODUCT_KEYS): the whole file is
     * filled with it and the drawing sits (or repeats) on top — on a greetings card / pack card, the
     * outside panels the design covers (never the inside). Unknown / absent / other products ⇒ white. */
    ground?: string;
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

  const [srcObj] = input.sourceObjectId
    ? await db
        .select()
        .from(storageObjects)
        .where(and(eq(storageObjects.id, input.sourceObjectId), eq(storageObjects.assetId, input.assetId)))
    : await db
        .select()
        .from(storageObjects)
        .where(and(eq(storageObjects.assetId, input.assetId), eq(storageObjects.objectClass, input.sourceObjectClass ?? 'ORIGINAL')));
  if (!srcObj) throw new Error('no source object to render from');

  const srcBuf = await getObjectBytes(srcObj.key);
  const meta = await sharp(srcBuf).metadata();
  const src = { width: meta.width ?? 0, height: meta.height ?? 0 };
  if (!src.width || !src.height) throw new Error('unreadable source image');

  const transform = clampTransform(input.transform);
  const geom = { printWidthPx: tpl.printWidthPx, printHeightPx: tpl.printHeightPx, bleedMm: tpl.bleedMm, requiredDpi: tpl.requiredDpi };

  const [variantRow] = await db
    .select({ attributes: productVariants.attributes, key: products.key })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(eq(productVariants.id, input.variantId));

  // A REPEAT-PATTERN product (socks, wrapping paper, tea towel) prints the drawing tiled into a
  // seamless repeat that fills the whole file — the 'pattern' magic edit, deterministic and in-VPC.
  // Resolution is judged on ONE motif (that's what's printed at size), not on the whole sheet: a
  // 5 m roll needs no bigger a photo than a pair of socks.
  if (variantRow?.key && isPatternProduct(variantRow.key)) {
    const canvas = canvasSizePx(geom);
    const motifAssess = assessPrintResolution(geom, src, transform, variantRow.key);
    if (motifAssess.decision === 'BLOCK') {
      throw new Error(`source too low-res for this product (would need ${motifAssess.upscaleFactor.toFixed(1)}× upscale)`);
    }
    const ground = normalizeGround(input.ground);
    let { png } = await renderRepeatPattern(srcBuf, canvas, tpl.requiredDpi, transform, groundHex(ground));
    // designed on a turned canvas (the landscape tea towel) → turn the file back to Prodigi's spec
    let [fileW, fileH] = [canvas.width, canvas.height];
    if (DESIGNED_TURNED.has(variantRow.key)) {
      png = await sharp(png).rotate(90).png().withMetadata({ density: tpl.requiredDpi }).toBuffer();
      [fileW, fileH] = [canvas.height, canvas.width];
    }
    // the colour is part of the file's name: red + navy socks of one drawing in one order are two
    // different files — never one overwriting the other
    return persistPrintFile(db, input.assetId, input.variantId, png, tpl.requiredDpi, motifAssess.effectiveDpi, motifAssess.decision === 'UPSCALE', fileW, fileH, groundTag(ground));
  }

  // A HEIGHT CHART prints the drawing beside a cm + ft/in ruler drawn INTO the file at true scale
  // (Prodigi prints no markings). Placement and resolution are judged on the art area beside the
  // ruler — the same answer the positioner, the mockup and the order gate use.
  if (variantRow?.key && isHeightChart(variantRow.key)) {
    const chartAssess = assessPrintResolution(geom, src, transform, variantRow.key);
    if (chartAssess.decision === 'BLOCK') {
      throw new Error(`source too low-res for this product (would need ${chartAssess.upscaleFactor.toFixed(1)}× upscale)`);
    }
    const face = await renderHeightChartFace(srcBuf, geom, transform);
    return persistPrintFile(db, input.assetId, input.variantId, face.png, tpl.requiredDpi, chartAssess.effectiveDpi, chartAssess.decision === 'UPSCALE', face.width, face.height);
  }

  const assess = assessResolution(geom, src, transform);
  if (assess.decision === 'BLOCK') {
    throw new Error(`source too low-res for this product (would need ${assess.upscaleFactor.toFixed(1)}× upscale)`);
  }

  // Orientation is OURS: a variant in the NON-native orientation designs on a SWAPPED
  // canvas, so the finished print file rotates 90° back to Prodigi's FIXED spec. Frames are
  // fixed-portrait (rotate the landscape variant); jigsaw boards are fixed-landscape (rotate
  // the portrait variant). "Preview the exact print file" shows this same rotated file —
  // exactly what the printer receives. Unknown/no orientation ⇒ never rotate.
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
  // separate downstream chokepoint. A card from a PACK is the same spread, front design only and
  // BLANK inside — whatever was stored (packs carry no printed message).
  if (variantRow?.key === 'card' || variantRow?.key === CARD_PACK_KEY) {
    const fromPack = variantRow.key === CARD_PACK_KEY;
    const screen = fromPack ? { ok: true as const, value: null } : screenCardMessage(input.message as Parameters<typeof screenCardMessage>[0]);
    if (!screen.ok) throw new Error(`the card ${screen.field} can’t be printed — please reword it`);
    // the BASE COLOUR fills the outside under the design (front, + rear when full width); never the inside
    const cardGround = normalizeGround(input.ground);
    out = await assembleCardPrintSpread({
      design: srcBuf,
      transform,
      span: !fromPack && input.cardSpan === 'full' ? 'full' : 'front',
      message: screen.value,
      branding: renderCardBackBadge(), // the founder's Snickerdoodle logo on the outer rear
      groundHex: cardGround,
    });
    outW = CARD_SPREAD.widthPx;
    outH = CARD_SPREAD.heightPx;
    // each colour its own file: a red and a blue card of one drawing never overwrite each other
    return persistPrintFile(db, input.assetId, input.variantId, out, tpl.requiredDpi, assess.effectiveDpi, assess.decision === 'UPSCALE', outW, outH, groundTag(cardGround));
  }

  const rect = computeLayerRect(geom, src, transform);
  // rotate → scale to the drawn rect → INTERSECT with the canvas and place at its offset
  // on a white canvas. Handles both regimes: cover/zoom (layer ≥ canvas → crop, offset 0,
  // identical to the old extract) and contain/zoom-out (layer < canvas → whole image
  // placed centred with white margins — unprinted product surface).
  const layer = await sharp(srcBuf).rotate(transform.rotationDeg).resize(rect.width, rect.height, { fit: 'fill' }).toBuffer();
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
    return persistPrintFile(db, input.assetId, input.variantId, out, tpl.requiredDpi, assess.effectiveDpi, assess.decision === 'UPSCALE', outW, outH);
  }

  // The child's image placed on ONE opaque face — the single-sided print file, and the FRONT (left)
  // face of a DUAL cushion. White, or the BASE COLOUR on an edge-to-edge product (the whole face).
  const ground = variantRow?.key && isGroundProduct(variantRow.key) ? normalizeGround(input.ground) : null;
  const faceHex = groundHex(ground);
  const face = await sharp({ create: { width: rect.canvasWidth, height: rect.canvasHeight, channels: 3, background: faceHex } })
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
    out = await sharp(face).flatten({ background: faceHex }).png().withMetadata({ density: tpl.requiredDpi }).toBuffer();
    if (landscape) {
      out = await sharp(out).rotate(90).png().withMetadata({ density: tpl.requiredDpi }).toBuffer();
      outW = rect.canvasHeight;
      outH = rect.canvasWidth;
    }
  }

  // each base colour is its own file (two cushions of one drawing in two colours never collide)
  return persistPrintFile(db, input.assetId, input.variantId, out, tpl.requiredDpi, assess.effectiveDpi, assess.decision === 'UPSCALE', outW, outH, groundTag(ground));
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
  upscaled: boolean,
  widthPx: number,
  heightPx: number,
  /** distinguishes print files of one asset + variant that differ (a pattern's base colour) */
  tag = '',
): Promise<RenderResult> {
  const key = derivativeKey(assetId, `printfile-${variantId}${tag}`);
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

  return { printObjectId, key, renderedDpi, effectiveDpi, upscaled, widthPx, heightPx };
}
