import './sharp-init';
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { printTemplates, storageObjects, templateAssets } from '@/db/schema';
import { getViewableAssetOrThrow } from '@/server/assets';
import { derivativeKey, getObjectBytes, getS3, putObject } from '@/storage';
import type { ViewerContext } from '@/authz';
import type { DbHandle } from '@/server/db';
import { clampTransform, computeLayerRect, mmToPx, type RawTransform, type Transform } from './geometry';

/**
 * The in-VPC product-mockup compositor (proposal/04 + the compositor design spec).
 * A SIBLING of renderPrintFile: it emits a DISPLAY mockup (a WebP of the child's
 * design composited onto a brand-safe blank product PHOTO) — never a print file, and
 * the child's image NEVER leaves the VPC (no third-party mockup service).
 *
 * It reuses render.ts's secure spine verbatim: authz gate FIRST, source object scoped
 * to the asset, work-once DERIVATIVE at a deterministic key in private storage. The
 * mockup is a child-image derivative → a normal storage_objects row under the asset,
 * so retention + cascading delete already cover it. The blank/maps come from
 * template_assets (structurally NON-child). It is NEVER routed through the egress gate
 * (only the print file goes to Prodigi).
 *
 * Placement reuses the SAME print geometry as the print file (computeLayerRect + the
 * clamped transform), with the print AREA as the canvas (zero bleed) — so the preview
 * shows exactly the visible printed result and can't drift from what Prodigi prints.
 *
 * Phase 1 ships the FLAT tier (planar print area shown ~square-on). PERSPECTIVE (a
 * pieced two-triangle warp) and DISPLACEMENT are later tiers behind the same API.
 */

const MAX_INPUT_PIXELS = 50_000_000; // decompression-bomb guard on every decode
// Cap the DRAWN layer too: computeLayerRect cover-fits from the SHORT source dimension,
// so an extreme-aspect source makes the scaled layer enormous (a 10000×100 design →
// tens of thousands of px wide) and the intermediate .resize() buffer can OOM the worker
// independent of the decode cap. Beyond this we fall back to the SVG (the source is the
// wrong shape for a faithful mockup anyway).
const MAX_DRAWN_PIXELS = 16_000_000;
const OUTPUT_EDGE: Record<MockupSize, number> = { thumb: 400, zoom: 1200 };
const MAX_CONCURRENT = 3;

export type MockupSize = 'thumb' | 'zoom';

export interface MockupResult {
  mockupObjectId: string;
  key: string;
  format: 'webp';
  tier: 'FLAT';
  cached: boolean;
  widthPx?: number; // set on a fresh render
  heightPx?: number;
}

export interface ComposeMockupInput {
  assetId: string;
  variantId: string;
  transform: RawTransform; // client-proposed; clamped server-side
  size?: MockupSize; // default 'thumb'
  sourceObjectId?: string; // a specific stored object (e.g. a bg-removed cutout); must belong to assetId
}

/** Thrown when a variant has no mockup template (or the source can't be used). The
 * caller treats this as "fall back to the SVG ProductMockup" — it is expected, not an
 * error to alarm on. */
export class NoMockupTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoMockupTemplateError';
  }
}

// ── A tiny in-process concurrency limiter (no dependency). Caps concurrent pipelines
// so a burst can't fan out unbounded scRGB (4× memory) pipelines on a small box.
let active = 0;
const waiters: Array<() => void> = [];
async function withLimit<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiters.push(resolve));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiters.shift()?.();
  }
}

/** Stable cache discriminator for the placement. Quantised to 3dp so sub-pixel client
 * jitter that clamps to the same value HITS the same cache (key cardinality can't explode). */
function transformHash(t: Transform): string {
  const q = (n: number) => Math.round(n * 1000) / 1000;
  return createHash('sha256')
    .update(JSON.stringify({ s: q(t.scale), x: q(t.offsetX), y: q(t.offsetY), r: t.rotationDeg }))
    .digest('hex')
    .slice(0, 16);
}

/** Axis-aligned bounding box (px) of a normalised quad on a W×H image. */
function quadBboxPx(quad: [number, number][], W: number, H: number): { x: number; y: number; w: number; h: number } {
  const xs = quad.map((p) => p[0]);
  const ys = quad.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return {
    x: Math.round(minX * W),
    y: Math.round(minY * H),
    w: Math.max(1, Math.round((maxX - minX) * W)),
    h: Math.max(1, Math.round((maxY - minY) * H)),
  };
}

// Concurrent identical renders (React strictMode double-fires the preview effect; the
// grid fan-out requests the same thumb twice) share ONE pipeline + ONE insert. Keyed by
// the deterministic cache key, AFTER each caller has passed its own authz check.
const inFlight = new Map<string, Promise<MockupResult>>();

export async function composeMockup(db: DbHandle, viewer: ViewerContext, input: ComposeMockupInput): Promise<MockupResult> {
  // 1. AUTHZ FIRST — identical gate to renderPrintFile, run on EVERY call (a deduped or
  //    cache-hit caller is still authorised here before any byte is returned).
  await getViewableAssetOrThrow(db, input.assetId, viewer);

  // 2. Template + its brand-safe blank (NON-child). No template ⇒ SVG fallback.
  const [tpl] = await db.select().from(printTemplates).where(eq(printTemplates.variantId, input.variantId));
  if (!tpl || !tpl.blankObjectId || !tpl.printQuad) throw new NoMockupTemplateError('variant has no mockup template');
  const [blank] = await db.select().from(templateAssets).where(eq(templateAssets.id, tpl.blankObjectId));
  if (!blank) throw new NoMockupTemplateError('blank template asset missing');
  // Optional product-silhouette mask (NON-child, same family as the blank): the design is
  // clipped to it, so art can never overlap the product's edge on shaped blanks.
  const [mask] = tpl.maskObjectId ? await db.select().from(templateAssets).where(eq(templateAssets.id, tpl.maskObjectId)) : [undefined];

  // 3. The DESIGN — read from storage_objects, scoped to THIS asset (never from
  //    template_assets). A specific source object (e.g. a bg-removed cutout) must
  //    belong to the asset; otherwise the preserved ORIGINAL.
  const [srcObj] = input.sourceObjectId
    ? await db
        .select()
        .from(storageObjects)
        .where(and(eq(storageObjects.id, input.sourceObjectId), eq(storageObjects.assetId, input.assetId)))
    : await db
        .select()
        .from(storageObjects)
        .where(and(eq(storageObjects.assetId, input.assetId), eq(storageObjects.objectClass, 'ORIGINAL')));
  if (!srcObj) throw new NoMockupTemplateError('no source object for the design');

  // 4. Deterministic, VERSIONED cache key. templateVersion + size + the SOURCE OBJECT id
  //    are all load-bearing: the source id keeps the ORIGINAL and a bg-removed cutout
  //    (both DERIVATIVE/ORIGINAL under the SAME asset) from colliding on one key.
  const t = clampTransform(input.transform);
  const size: MockupSize = input.size ?? 'thumb';
  const key = derivativeKey(input.assetId, `mockup-${input.variantId}-${size}-v${tpl.templateVersion}-${srcObj.id}-${transformHash(t)}`);

  // 5. Cache hit → no sharp work.
  const [existing] = await db.select({ id: storageObjects.id }).from(storageObjects).where(eq(storageObjects.key, key));
  if (existing) return { mockupObjectId: existing.id, key, format: 'webp', tier: 'FLAT', cached: true };

  // 6. In-flight dedup → render + persist once (concurrency-capped) and share the result.
  const pending = inFlight.get(key);
  if (pending) return pending;
  const p = withLimit(() =>
    renderAndPersist(db, {
      assetId: input.assetId,
      key,
      blankKey: blank.key,
      maskKey: mask?.key,
      designKey: srcObj.key,
      quad: tpl.printQuad!,
      transform: t,
      workEdge: tpl.mapResolutionPx,
      outputEdge: OUTPUT_EDGE[size],
      print: { widthPx: tpl.printWidthPx, bleedMm: tpl.bleedMm, requiredDpi: tpl.requiredDpi },
    }),
  );
  inFlight.set(key, p);
  try {
    return await p;
  } finally {
    inFlight.delete(key);
  }
}

async function renderAndPersist(
  db: DbHandle,
  args: {
    assetId: string; key: string; blankKey: string; maskKey?: string; designKey: string; quad: [number, number][];
    transform: Transform; workEdge: number; outputEdge: number;
    print: { widthPx: number; bleedMm: number; requiredDpi: number };
  },
): Promise<MockupResult> {
  const out = await renderFlat({
    blankBuf: await getObjectBytes(args.blankKey),
    maskBuf: args.maskKey ? await getObjectBytes(args.maskKey) : undefined,
    designBuf: await getObjectBytes(args.designKey),
    quad: args.quad,
    transform: args.transform,
    workEdge: args.workEdge,
    outputEdge: args.outputEdge,
    print: args.print,
  });

  // Write-once DERIVATIVE under the asset (mirrors render.ts): retention + cascading
  // delete already cover it; private bucket; EXIF stripped by re-encode. The unique
  // index on key makes onConflictDoNothing a genuine arbiter, so a concurrent racer that
  // slipped past the cache check + dedup can't duplicate the row.
  const sha256 = createHash('sha256').update(out.buffer).digest('hex');
  const { bucket } = getS3();
  await putObject(args.key, out.buffer, 'image/webp');
  const [row] = await db
    .insert(storageObjects)
    .values({ assetId: args.assetId, objectClass: 'DERIVATIVE', bucket, key: args.key, contentType: 'image/webp', byteSize: out.buffer.byteLength, sha256, exifStripped: true, writeOnce: true })
    .onConflictDoNothing({ target: storageObjects.key })
    .returning();
  const mockupObjectId = row?.id ?? (await db.select({ id: storageObjects.id }).from(storageObjects).where(eq(storageObjects.key, args.key)))[0]!.id;

  return { mockupObjectId, key: args.key, format: 'webp', tier: 'FLAT', cached: false, widthPx: out.width, heightPx: out.height };
}

/**
 * FLAT tier: composite the design into the (axis-aligned) print area of the blank,
 * COMPOSITING IN LINEAR LIGHT (scRGB) — the single biggest realism lever. The design
 * is cover-fit + transformed into the print area using the SAME geometry as the print
 * file, so the preview matches the print. The design's alpha is feathered to kill
 * background-removal halos. Output is sRGB WebP at the requested display size.
 */
async function renderFlat(args: {
  blankBuf: Buffer;
  maskBuf?: Buffer;
  designBuf: Buffer;
  quad: [number, number][];
  transform: Transform;
  workEdge: number;
  outputEdge: number;
  /** The variant's real print geometry, for bleed-exact windowing. */
  print: { widthPx: number; bleedMm: number; requiredDpi: number };
}): Promise<{ buffer: Buffer; width: number; height: number }> {
  const { blankBuf, maskBuf, designBuf, quad, transform, workEdge, outputEdge, print } = args;

  // Working blank dimensions: cap the longest edge at workEdge (scRGB is 32-bit float,
  // ~4× memory, so this cap is load-bearing). The normalised quad scales with it.
  const blankMeta = await sharp(blankBuf, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  const bw0 = blankMeta.width ?? 0;
  const bh0 = blankMeta.height ?? 0;
  if (!bw0 || !bh0) throw new NoMockupTemplateError('unreadable blank template');
  const scale = Math.min(1, workEdge / Math.max(bw0, bh0));
  const WW = Math.max(1, Math.round(bw0 * scale));
  const WH = Math.max(1, Math.round(bh0 * scale));

  // Blank at working res as its OWN pipeline — sharp honours only one .resize() per
  // pipeline, so the working-res resize must not share a chain with the output resize.
  const workingBlank = await sharp(blankBuf, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).resize(WW, WH, { fit: 'fill' }).toBuffer();

  const rect = quadBboxPx(quad, WW, WH);

  // Place the design into the print area exactly as the print render places it onto the
  // bleed canvas — cover-fit + clamped transform — but with the print AREA as the canvas
  // (zero bleed), so what's previewed is the visible printed result.
  const dMeta = await sharp(designBuf, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  const src = { width: dMeta.width ?? 0, height: dMeta.height ?? 0 };
  if (!src.width || !src.height) throw new NoMockupTemplateError('unreadable design image');

  // BLEED-EXACT placement: the print file cover-fits the art over the BLEED canvas (print
  // area + bleed) and Prodigi trims the bleed off. Replicate that exactly at photo scale —
  // cover-fit over the scaled bleed canvas, then window the print-area (trim box) — so the
  // preview IS the trimmed print, not an approximation of it. The photo-scale bleed comes
  // from the same mm→px conversion the print renderer uses, scaled by photo-px per print-px.
  const s = rect.w / print.widthPx;
  const layer = computeLayerRect(
    { printWidthPx: rect.w, printHeightPx: rect.h, bleedMm: print.bleedMm, requiredDpi: print.requiredDpi * s },
    src,
    transform,
  );
  if (layer.width * layer.height > MAX_DRAWN_PIXELS) {
    throw new NoMockupTemplateError(`design aspect too extreme to composite (${layer.width}×${layer.height})`);
  }
  const bleed = Math.round((layer.canvasWidth - rect.w) / 2); // the scaled bleed margin

  // Rotate → scale to the drawn rect → INTERSECT with the TRIM window and place at its
  // offset on a TRANSPARENT window canvas (mirroring render.ts's white canvas — here the
  // margins stay transparent so the product photo shows through, exactly like unprinted
  // surface). Handles cover (crop) and contain/zoom-out (whole image, centred) alike.
  const scaled = await sharp(designBuf, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
    .rotate(transform.rotationDeg)
    .resize(layer.width, layer.height, { fit: 'fill' })
    .ensureAlpha()
    .toBuffer();
  const ix = Math.max(0, bleed - layer.x);
  const iy = Math.max(0, bleed - layer.y);
  const ox = Math.max(0, layer.x - bleed);
  const oy = Math.max(0, layer.y - bleed);
  const iw = Math.max(1, Math.min(layer.width - ix, rect.w - ox));
  const ih = Math.max(1, Math.min(layer.height - iy, rect.h - oy));
  const part = await sharp(scaled).extract({ left: ix, top: iy, width: iw, height: ih }).toBuffer();
  const windowed = await sharp({ create: { width: rect.w, height: rect.h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: part, left: ox, top: oy }])
    .png()
    .toBuffer();

  // Feather the alpha edge (blur the alpha channel, re-join) to remove the 1px halo a
  // background-removal can leave. Robust: if anything is off, fall back to the raw layer.
  let designLayer = windowed;
  try {
    const rgb = await sharp(windowed).removeAlpha().toBuffer();
    const alpha = await sharp(windowed).ensureAlpha().extractChannel(3).blur(0.8).toBuffer();
    designLayer = await sharp(rgb).joinChannel(alpha).png().toBuffer();
  } catch {
    // keep `windowed`
  }

  // Clip the design to the product SILHOUETTE (mask: white = printable). The mask shares
  // the blank's frame, so resize it to working res, cut the same print-area window, and
  // multiply it into the design's alpha (dest-in) — art can never overlap the product's
  // edge on shaped blanks (heart/round cushions, bauble, sack, apron). Unlike the feather
  // this is NOT best-effort: a template authored WITH a mask must never render unclipped.
  if (maskBuf) {
    const maskWin = await sharp(maskBuf, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .resize(WW, WH, { fit: 'fill' })
      .extract({ left: rect.x, top: rect.y, width: rect.w, height: rect.h })
      .toColourspace('b-w')
      .blur(0.6) // soft edge so the clip doesn't alias
      .toBuffer();
    const clip = await sharp({ create: { width: rect.w, height: rect.h, channels: 3, background: '#000' } })
      .joinChannel(maskWin)
      .png()
      .toBuffer();
    designLayer = await sharp(designLayer).composite([{ input: clip, blend: 'dest-in' }]).png().toBuffer();
  }

  // Composite the design over the working-res blank IN LINEAR LIGHT (own pipeline:
  // sharp applies a chained .resize() to the base BEFORE composite, which would shrink
  // it under the design — so the downscale must be a SEPARATE pipeline).
  const composited = await sharp(workingBlank, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
    .pipelineColourspace('scrgb')
    .composite([{ input: designLayer, left: rect.x, top: rect.y, blend: 'over' }])
    .toColourspace('srgb')
    .toBuffer();

  // Downscale to the display size (lanczos), sharpen after resize, encode sRGB WebP.
  const out = await sharp(composited, { limitInputPixels: MAX_INPUT_PIXELS })
    .resize(outputEdge, outputEdge, { fit: 'inside', kernel: 'lanczos3', withoutEnlargement: true })
    .sharpen({ sigma: 0.8, m1: 0.5, m2: 2 })
    .withMetadata({ icc: 'srgb' })
    .webp({ quality: 82, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  return { buffer: out.data, width: out.info.width, height: out.info.height };
}
