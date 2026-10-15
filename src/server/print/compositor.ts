import './sharp-init';
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { mockupViews, printTemplates, storageObjects, templateAssets } from '@/db/schema';
import { getViewableAssetOrThrow } from '@/server/assets';
import { derivativeKey, getObjectBytes, getS3, putObject } from '@/storage';
import type { ViewerContext } from '@/authz';
import type { DbHandle } from '@/server/db';
import { clampTransform, computeLayerRect, mmToPx, type RawTransform, type Transform } from './geometry';
import { applyFabricFx, MATERIAL_FX } from './fabricFx';
import { perspectiveWarp } from './perspective';
import { cylinderWarp } from './cylinder';

/** Mug wrap geometry (11oz): the visible front face spans ~ARC° of the mug; the printed wrap
 * covers ~WRAP° of the circumference (209mm on an ~82mm-ø mug). Tunables for the cylinder tier. */
// The 209mm print wraps ~292° of an 11oz mug (209mm of a ~258mm circumference = π·82mm); the
// remaining ~68° is the handle gap. The design's right edge anchors at the printmap's handle-side
// edge and steps back by real arc, so the FRONT shows the design's right ~half and the BACK its
// left ~half. The printcircumference ellipse (measured from red/printcircumference.png) gives the
// exact screen-x → surface-angle projection.
const MUG_PRINTED_ARC_DEG = 292;
const MUG_ELLIPSE_CX = 0.423; // front/back photo: normalised centre-x of the projected circumference
const MUG_ELLIPSE_A = 0.207; // normalised half-width (projected radius) — same for both photos
// The CENTRE view is a separate head-on photo (handle hidden behind) with the mug centred, so its
// circumference ellipse is centred too. Measured from red/centerprintcircumference.png.
const MUG_CENTRE_ELLIPSE_CX = 0.499;

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
// Render-engine revision — part of the cache key, so an engine upgrade (e.g. the Tier-B
// fabric fx) re-renders cached mockups without a per-template version bump.
const RENDER_REV = 'r15'; // r15: mug 'centre' view (design middle head-on) alongside front/back

export type MockupSize = 'thumb' | 'zoom';

export interface MockupResult {
  mockupObjectId: string;
  key: string;
  format: 'webp';
  tier: 'FLAT' | 'PERSPECTIVE';
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
  /** An ALTERNATE display view (mockup_views), e.g. 'tin'. Absent/'primary' ⇒ the product's
   * main mockup (print_templates). Alternate views can carry a PERSPECTIVE quad. */
  view?: string;
  /** A solid-colour FILL instead of the child's image — a `#rrggbb` (e.g. the cushion's plain
   * coloured back). GENERIC product render (no child pixels): the fill is multiplied over the
   * blank so it reads as plush fabric. Display only; the asset is still authz-gated + owns the
   * cached derivative. Absent ⇒ the real design. */
  fill?: string;
  /** For a card shown 'full width' (the design spans the whole outside, front+back across the
   * fold): the CLOSED card shows only one panel. Cover-fit the design into a double-wide spread,
   * then keep this half — 'front' = the right panel of [back | front]. PERSPECTIVE views only
   * (the closed-card hero); the flat outside-full view bakes the span into its box instead. */
  spanHalf?: 'front' | 'back';
}

/** Thrown when a variant has no mockup template (or the source can't be used). The
 * caller treats this as "no photo to show" (the preview rests on its calm empty
 * block) — it is expected, not an error to alarm on. */
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

/** The quad's own width÷height (average of opposite edge lengths) — used to tell whether the
 * print's aspect is TRANSPOSED relative to how the surface sits in the photo. */
function quadEdgeAspect(quad: [number, number][]): number {
  const [tl, tr, br, bl] = quad as [[number, number], [number, number], [number, number], [number, number]];
  const len = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const w = (len(tl, tr) + len(bl, br)) / 2;
  const h = (len(tl, bl) + len(tr, br)) / 2;
  return h === 0 ? 1 : w / h;
}

/** Is the quad an axis-aligned rectangle (FLAT) or a skewed/perspective quad? */
function isAxisAligned(quad: [number, number][]): boolean {
  const [tl, tr, br, bl] = quad as [[number, number], [number, number], [number, number], [number, number]];
  const tol = 0.004; // normalised
  return (
    Math.abs(tl[0] - bl[0]) < tol && Math.abs(tr[0] - br[0]) < tol &&
    Math.abs(tl[1] - tr[1]) < tol && Math.abs(bl[1] - br[1]) < tol
  );
}

/** A variant's mockup template, resolved from EITHER print_templates (the primary product
 * view) OR mockup_views (an alternate view, e.g. 'tin'). Unifies the two so the compose
 * pipeline is identical; alternate views are display-only (bleed 0). */
interface ResolvedTemplate {
  blankObjectId: string;
  maskObjectId: string | null;
  overlayObjectId: string | null;
  printQuad: [number, number][];
  printWidthPx: number;
  printHeightPx: number;
  bleedMm: number;
  requiredDpi: number;
  materialClass: string;
  mapResolutionPx: number;
  templateVersion: number;
}
/** Views served off the PRIMARY template (not a mockup_views row): the plain primary, the AR
 * 'board', and the mug's cylinder 'front'/'back' (both wrap the same front photo). */
const PRIMARY_VIEWS = new Set(['primary', 'board', 'front', 'back']);
async function loadResolvedTemplate(db: DbHandle, variantId: string, view: string | undefined): Promise<ResolvedTemplate | null> {
  if (view && !PRIMARY_VIEWS.has(view)) {
    const [v] = await db.select().from(mockupViews).where(and(eq(mockupViews.variantId, variantId), eq(mockupViews.view, view)));
    if (!v?.blankObjectId || !v.printQuad) return null;
    // Display-only: no bleed (Prodigi prints from the primary geometry, never this view).
    return { blankObjectId: v.blankObjectId, maskObjectId: v.maskObjectId, overlayObjectId: v.overlayObjectId, printQuad: v.printQuad, printWidthPx: v.printWidthPx, printHeightPx: v.printHeightPx, bleedMm: 0, requiredDpi: 300, materialClass: v.materialClass, mapResolutionPx: v.mapResolutionPx, templateVersion: v.templateVersion };
  }
  const [t] = await db.select().from(printTemplates).where(eq(printTemplates.variantId, variantId));
  if (!t?.blankObjectId || !t.printQuad) return null;
  return { blankObjectId: t.blankObjectId, maskObjectId: t.maskObjectId, overlayObjectId: t.lightingObjectId, printQuad: t.printQuad, printWidthPx: t.printWidthPx, printHeightPx: t.printHeightPx, bleedMm: t.bleedMm, requiredDpi: t.requiredDpi, materialClass: t.materialClass, mapResolutionPx: t.mapResolutionPx, templateVersion: t.templateVersion };
}

// Concurrent identical renders (React strictMode double-fires the preview effect; the
// grid fan-out requests the same thumb twice) share ONE pipeline + ONE insert. Keyed by
// the deterministic cache key, AFTER each caller has passed its own authz check.
const inFlight = new Map<string, Promise<MockupResult>>();

export async function composeMockup(db: DbHandle, viewer: ViewerContext, input: ComposeMockupInput): Promise<MockupResult> {
  // 1. AUTHZ FIRST — identical gate to renderPrintFile, run on EVERY call (a deduped or
  //    cache-hit caller is still authorised here before any byte is returned).
  await getViewableAssetOrThrow(db, input.assetId, viewer);

  // 2. Template — the PRIMARY product view (print_templates) or an alternate display view
  //    (mockup_views, e.g. the tin). Its brand-safe blank is NON-child. No template ⇒ fallback.
  const tpl = await loadResolvedTemplate(db, input.variantId, input.view);
  if (!tpl) throw new NoMockupTemplateError('variant has no mockup template for this view');
  const [blank] = await db.select().from(templateAssets).where(eq(templateAssets.id, tpl.blankObjectId));
  if (!blank) throw new NoMockupTemplateError('blank template asset missing');
  // Optional product-silhouette mask: the design is clipped to it (shaped product edges).
  const [mask] = tpl.maskObjectId ? await db.select().from(templateAssets).where(eq(templateAssets.id, tpl.maskObjectId)) : [undefined];
  // Optional FOREGROUND overlay: authored on-top detail composited OVER the design — e.g.
  // the jigsaw's die-cut piece lines, so the art reads as physically cut.
  const [overlay] = tpl.overlayObjectId ? await db.select().from(templateAssets).where(eq(templateAssets.id, tpl.overlayObjectId)) : [undefined];

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
  //    (both DERIVATIVE/ORIGINAL under the SAME asset) from colliding on one key, and the source's
  //    content hash makes a REPLACED cutout (touch-up, re-run removal) recompose instead of
  //    serving the old picture.
  const t = clampTransform(input.transform);
  const size: MockupSize = input.size ?? 'thumb';
  const viewTag = input.view && input.view !== 'primary' && input.view !== 'board' ? `-${input.view}` : '';
  // A solid-colour fill (the cushion's plain back) — sanitised #rrggbb, part of the key so each
  // colour caches separately and never collides with the real-design render.
  const fill = input.fill && /^#[0-9a-f]{6}$/i.test(input.fill) ? input.fill.toLowerCase() : undefined;
  const fillTag = fill ? `-fill${fill.slice(1)}` : '';
  // 'full width' closed-card half — only meaningful on a PERSPECTIVE view (the flat outside-full
  // view carries its span in the box); ignored elsewhere so it never forks other products' keys.
  const spanHalf = (input.spanHalf === 'front' || input.spanHalf === 'back') && !isAxisAligned(tpl.printQuad) ? input.spanHalf : undefined;
  const spanTag = spanHalf ? `-span${spanHalf}` : '';
  const key = derivativeKey(input.assetId, `mockup-${input.variantId}${viewTag}-${size}-v${tpl.templateVersion}${RENDER_REV}${fillTag}${spanTag}-${srcObj.id}${srcObj.sha256 ? `.${srcObj.sha256.slice(0, 10)}` : ''}-${transformHash(t)}`);

  // 5. Cache hit → no sharp work.
  const [existing] = await db.select({ id: storageObjects.id }).from(storageObjects).where(eq(storageObjects.key, key));
  if (existing) return { mockupObjectId: existing.id, key, format: 'webp', tier: isAxisAligned(tpl.printQuad) ? 'FLAT' : 'PERSPECTIVE', cached: true };

  // 6. In-flight dedup → render + persist once (concurrency-capped) and share the result.
  const pending = inFlight.get(key);
  if (pending) return pending;
  const p = withLimit(() =>
    renderAndPersist(db, {
      assetId: input.assetId,
      key,
      blankKey: blank.key,
      maskKey: mask?.key,
      overlayKey: overlay?.key,
      designKey: srcObj.key,
      fillHex: fill,
      quad: tpl.printQuad,
      transform: t,
      spanHalf,
      workEdge: tpl.mapResolutionPx,
      outputEdge: OUTPUT_EDGE[size],
      print: { widthPx: tpl.printWidthPx, heightPx: tpl.printHeightPx, bleedMm: tpl.bleedMm, requiredDpi: tpl.requiredDpi },
      materialClass: tpl.materialClass,
      mugMode: input.view === 'back' ? 'back' : input.view === 'centre' ? 'centre' : 'front',
    }),
  );
  inFlight.set(key, p);
  try {
    return await p;
  } finally {
    inFlight.delete(key);
  }
}

/** A solid-colour design for a FILL render (e.g. the cushion's plain coloured back): cover-fit
 * + multiplied over the blank, it paints the whole print area that colour. No child pixels. */
async function solidFill(hex: string): Promise<Buffer> {
  const r = parseInt(hex.slice(1, 3), 16),
    g = parseInt(hex.slice(3, 5), 16),
    b = parseInt(hex.slice(5, 7), 16);
  return sharp({ create: { width: 512, height: 512, channels: 4, background: { r, g, b, alpha: 1 } } }).png().toBuffer();
}

async function renderAndPersist(
  db: DbHandle,
  args: {
    assetId: string; key: string; blankKey: string; maskKey?: string; overlayKey?: string; designKey: string; fillHex?: string; quad: [number, number][];
    transform: Transform; spanHalf?: 'front' | 'back'; workEdge: number; outputEdge: number;
    print: { widthPx: number; heightPx: number; bleedMm: number; requiredDpi: number };
    materialClass: string; mugMode?: 'front' | 'back' | 'centre';
  },
): Promise<MockupResult> {
  // A skewed quad (an angled product like the tin lid) → PERSPECTIVE warp; a ceramic mug →
  // CYLINDER warp (the art curves around the real photo's face); else the FLAT (axis-aligned
  // bbox) placement. Same secure spine either way.
  const perspective = !isAxisAligned(args.quad);
  // A ceramic mug WITH a printmap (mask) → CYLINDER warp onto that surface. Without a printmap
  // (the plain-white fallback blank) it falls through to FLAT.
  const cylinder = !perspective && args.materialClass === 'CERAMIC' && !!args.maskKey;
  const common = {
    blankBuf: await getObjectBytes(args.blankKey),
    // A solid-colour fill (cushion plain back) is synthesised in-process — no child pixels; it
    // cover-fits + multiplies over the blank so the whole face reads as that plush fabric colour.
    designBuf: args.fillHex ? await solidFill(args.fillHex) : await getObjectBytes(args.designKey),
    quad: args.quad,
    transform: args.transform,
    workEdge: args.workEdge,
    outputEdge: args.outputEdge,
    print: args.print,
  };
  const out = perspective
    ? await renderPerspective({ ...common, spanHalf: args.spanHalf })
    : cylinder
      ? await renderCylinder({ blankBuf: common.blankBuf, designBuf: common.designBuf, transform: common.transform, workEdge: common.workEdge, outputEdge: common.outputEdge, print: common.print, mode: args.mugMode ?? 'front', ellipseCx: args.mugMode === 'centre' ? MUG_CENTRE_ELLIPSE_CX : MUG_ELLIPSE_CX, printmapBuf: await getObjectBytes(args.maskKey!) })
      : await renderFlat({
          ...common,
          maskBuf: args.maskKey ? await getObjectBytes(args.maskKey) : undefined,
          overlayBuf: args.overlayKey ? await getObjectBytes(args.overlayKey) : undefined,
          materialClass: args.materialClass,
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

  return { mockupObjectId, key: args.key, format: 'webp', tier: perspective ? 'PERSPECTIVE' : 'FLAT', cached: false, widthPx: out.width, heightPx: out.height };
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
  /** Foreground overlay composited OVER the design (full-frame, same canvas as the blank). */
  overlayBuf?: Buffer;
  designBuf: Buffer;
  quad: [number, number][];
  transform: Transform;
  workEdge: number;
  outputEdge: number;
  /** The variant's real print geometry, for bleed-exact windowing. */
  print: { widthPx: number; bleedMm: number; requiredDpi: number };
  /** Drives the Tier-B fabric fx intensities (fold displacement + shading). */
  materialClass: string;
}): Promise<{ buffer: Buffer; width: number; height: number }> {
  const { blankBuf, maskBuf, overlayBuf, designBuf, quad, transform, workEdge, outputEdge, print, materialClass } = args;

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

  const fx = MATERIAL_FX[materialClass] ?? MATERIAL_FX.PAPER!;
  let designLayer = windowed;
  if (fx.blend === 'multiply') {
    // MULTIPLY reads white as "no ink" — flatten the window over white IMMEDIATELY.
    // The composite's premultiply round-trip leaves alpha-0 margins with BLACK rgb,
    // so ANY partial-alpha edge derived from them (the feather below, displaced or
    // downscaled edges) darkens the fabric as a line tracing the design's edge.
    // Opaque white margins are exact (multiply identity), and the feather is
    // unnecessary here: a bg-removal halo multiplies to invisible anyway.
    designLayer = await sharp(windowed).flatten({ background: '#ffffff' }).png().toBuffer();
  } else {
    // Feather the alpha edge (blur the alpha channel, re-join) to remove the 1px halo a
    // background-removal can leave. Robust: if anything is off, fall back to the raw layer.
    try {
      const rgb = await sharp(windowed).removeAlpha().toBuffer();
      const alpha = await sharp(windowed).ensureAlpha().extractChannel(3).blur(0.8).toBuffer();
      designLayer = await sharp(rgb).joinChannel(alpha).png().toBuffer();
    } catch {
      // keep `windowed`
    }
  }

  // ── Tier-B fabric fx: displace the art along the blank's folds + re-apply the
  // photo's own shading (fabricFx.ts — mean-relative, so a flat untextured region is
  // an identity op). Runs BEFORE the mask clip, mirroring the reference pipeline, so
  // a fold-displaced edge is still clipped to the silhouette. Pure enhancement: any
  // failure keeps the un-fx'd layer — a mockup must never break for realism's sake.
  if (fx.disp > 0 || fx.shade > 0) {
    try {
      const blankGray = await sharp(workingBlank, { limitInputPixels: MAX_INPUT_PIXELS })
        .extract({ left: rect.x, top: rect.y, width: rect.w, height: rect.h })
        .toColourspace('b-w')
        .raw()
        .toBuffer();
      const blankGrayBlur = await sharp(workingBlank, { limitInputPixels: MAX_INPUT_PIXELS })
        .extract({ left: rect.x, top: rect.y, width: rect.w, height: rect.h })
        .toColourspace('b-w')
        .blur(Math.max(3, rect.w / 80)) // folds, not fabric grain
        .raw()
        .toBuffer();
      const designRaw = await sharp(designLayer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      if (designRaw.info.width === rect.w && designRaw.info.height === rect.h && blankGray.length === rect.w * rect.h) {
        const fxOut = applyFabricFx({
          design: designRaw.data,
          width: rect.w,
          height: rect.h,
          blankGray,
          blankGrayBlur,
          displaceStrength: fx.disp * Math.min(10, Math.max(2, rect.w / 60)),
          shadeAmount: fx.shade,
        });
        designLayer = await sharp(fxOut, { raw: { width: rect.w, height: rect.h, channels: 4 } }).png().toBuffer();
      }
    } catch {
      // keep the un-fx'd designLayer
    }
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

  // MULTIPLY reads white as "no ink", so flatten the layer's alpha away over white:
  // any partial-alpha pixel (feather ring, displaced edges, mask soft edge) otherwise
  // darkens the fabric under the premultiplied multiply — a faint line tracing the
  // print edge. Flattening preserves the mask semantics too (clipped area → white →
  // identity over the fabric).
  if (fx.blend === 'multiply') {
    designLayer = await sharp(designLayer).flatten({ background: '#ffffff' }).png().toBuffer();
  }

  // Composite the design over the working-res blank IN LINEAR LIGHT (own pipeline:
  // sharp applies a chained .resize() to the base BEFORE composite, which would shrink
  // it under the design — so the downscale must be a SEPARATE pipeline).
  const composited = await sharp(workingBlank, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
    .pipelineColourspace('scrgb')
    .composite([{ input: designLayer, left: rect.x, top: rect.y, blend: fx.blend }])
    .toColourspace('srgb')
    .toBuffer();

  // FOREGROUND overlay (piece lines etc.) OVER the design — full-frame at working res,
  // authored on the same canvas as the blank so it registers by construction; the art reads
  // THROUGH it (die-cut lines sit on top). Composited in sRGB to preserve its authored look.
  // Pure enhancement: any failure keeps `composited` — a mockup must never break for it.
  let flattened = composited;
  if (overlayBuf) {
    try {
      const ov = await sharp(overlayBuf, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
        .resize(WW, WH, { fit: 'fill' })
        .ensureAlpha()
        .png()
        .toBuffer();
      flattened = await sharp(composited).composite([{ input: ov, left: 0, top: 0, blend: 'over' }]).toBuffer();
    } catch {
      // keep `composited`
    }
  }

  // Downscale to the display size (lanczos), sharpen after resize, encode sRGB WebP.
  const out = await sharp(flattened, { limitInputPixels: MAX_INPUT_PIXELS })
    .resize(outputEdge, outputEdge, { fit: 'inside', kernel: 'lanczos3', withoutEnlargement: true })
    .sharpen({ sigma: 0.8, m1: 0.5, m2: 2 })
    .withMetadata({ icc: 'srgb' })
    .webp({ quality: 82, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  return { buffer: out.data, width: out.info.width, height: out.info.height };
}

/**
 * PERSPECTIVE tier: cover-fit + transform the design onto a print-aspect canvas (ZERO bleed —
 * a display-only view, never printed), then HOMOGRAPHY-WARP that canvas onto the quad's four
 * corners on the product photo (perspective.ts) and composite over it. Used for angled products
 * like the jigsaw tin lid, where the print area is a skewed quadrilateral. Same secure spine as
 * FLAT (authz + write-once derivative in composeMockup); the child's design never leaves the VPC.
 */
async function renderPerspective(args: {
  blankBuf: Buffer;
  designBuf: Buffer;
  quad: [number, number][];
  transform: Transform;
  spanHalf?: 'front' | 'back';
  workEdge: number;
  outputEdge: number;
  print: { widthPx: number; heightPx: number; bleedMm: number; requiredDpi: number };
}): Promise<{ buffer: Buffer; width: number; height: number }> {
  const { blankBuf, designBuf, quad, transform, spanHalf, workEdge, outputEdge, print } = args;

  // Working blank (cap the longest edge; the quad is normalised, so it scales with it).
  const bm = await sharp(blankBuf, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  const bw0 = bm.width ?? 0, bh0 = bm.height ?? 0;
  if (!bw0 || !bh0) throw new NoMockupTemplateError('unreadable blank template');
  const scale = Math.min(1, workEdge / Math.max(bw0, bh0));
  const WW = Math.max(1, Math.round(bw0 * scale));
  const WH = Math.max(1, Math.round(bh0 * scale));
  const workingBlank = await sharp(blankBuf, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).resize(WW, WH, { fit: 'fill' }).toBuffer();

  // Prepare the design on a print-aspect canvas (dw×dh = the print area's own px) — cover-fit
  // + transformed exactly like the flat path, but with ZERO bleed (this view is never printed).
  const dm = await sharp(designBuf, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  const src = { width: dm.width ?? 0, height: dm.height ?? 0 };
  if (!src.width || !src.height) throw new NoMockupTemplateError('unreadable design image');
  const dw = Math.max(2, print.widthPx);
  const dh = Math.max(2, print.heightPx);
  // 'full width' closed card: the design spans the whole outside (front+back), so cover-fit it
  // into a DOUBLE-WIDE spread and keep just this panel — 'front' = the right half of [back|front].
  const cw = spanHalf ? dw * 2 : dw;
  const layer = computeLayerRect({ printWidthPx: cw, printHeightPx: dh, bleedMm: 0, requiredDpi: print.requiredDpi }, src, transform);
  if (layer.width * layer.height > MAX_DRAWN_PIXELS) throw new NoMockupTemplateError(`design aspect too extreme to composite (${layer.width}×${layer.height})`);
  const scaled = await sharp(designBuf, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
    .rotate(transform.rotationDeg)
    .resize(layer.width, layer.height, { fit: 'fill' })
    .ensureAlpha()
    .toBuffer();
  // Window the transformed layer onto the cw×dh canvas (handles cover-crop AND contain-centre).
  const ix = Math.max(0, -layer.x);
  const iy = Math.max(0, -layer.y);
  const ox = Math.max(0, layer.x);
  const oy = Math.max(0, layer.y);
  const iw = Math.max(1, Math.min(layer.width - ix, cw - ox));
  const ih = Math.max(1, Math.min(layer.height - iy, dh - oy));
  const part = await sharp(scaled).extract({ left: ix, top: iy, width: iw, height: ih }).toBuffer();
  const spread = await sharp({ create: { width: cw, height: dh, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: part, left: ox, top: oy }])
    .png()
    .toBuffer();
  // Keep just the visible panel (front = right half) — a no-op for a normal single-panel view.
  const designPng = spanHalf
    ? await sharp(spread).extract({ left: spanHalf === 'front' ? dw : 0, top: 0, width: dw, height: dh }).png().toBuffer()
    : spread;

  // If the print's aspect and the quad's OWN aspect are TRANSPOSED — e.g. the tin's landscape
  // lid print (869×674) shot in a portrait orientation — rotate the design −90° so it fills the
  // quad the right way round instead of squishing across it. A no-op when the two agree.
  const transposed = (dw / dh >= 1) !== (quadEdgeAspect(quad) >= 1);
  const raw = await (transposed ? sharp(designPng).rotate(-90) : sharp(designPng)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  // Warp the design canvas onto the quad (in working-blank px), then composite over the photo.
  const quadPx = quad.map(([x, y]) => [x * WW, y * WH]) as [number, number][];
  const warped = perspectiveWarp({ design: raw.data, srcW: raw.info.width, srcH: raw.info.height, quad: quadPx, canvasW: WW, canvasH: WH });
  const warpedPng = await sharp(warped, { raw: { width: WW, height: WH, channels: 4 } }).png().toBuffer();
  const composited = await sharp(workingBlank, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
    .composite([{ input: warpedPng, left: 0, top: 0, blend: 'over' }])
    .toBuffer();

  const out = await sharp(composited, { limitInputPixels: MAX_INPUT_PIXELS })
    .resize(outputEdge, outputEdge, { fit: 'inside', kernel: 'lanczos3', withoutEnlargement: true })
    .sharpen({ sigma: 0.8, m1: 0.5, m2: 2 })
    .withMetadata({ icc: 'srgb' })
    .webp({ quality: 82, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  return { buffer: out.data, width: out.info.width, height: out.info.height };
}

/**
 * CYLINDER tier: wrap the design around the visible face of the REAL mug photo so it curves with
 * the ceramic (cylinder.ts), then MULTIPLY it over the photo in linear light so the mug's own
 * glaze highlights + shadows read through the print — the single biggest "it's really on a mug"
 * lever. FRONT shows the design centred on the front arc; BACK flops the photo (handle to the
 * left) and wraps the reverse arc (the two ends of the print meeting round the handle). Same
 * secure spine as FLAT — the child's design never leaves the VPC.
 */
async function renderCylinder(args: {
  blankBuf: Buffer;
  /** The founder-authored PRINTMAP (alpha shape = the visible print surface on the photo). */
  printmapBuf: Buffer;
  designBuf: Buffer;
  transform: Transform;
  workEdge: number;
  outputEdge: number;
  print: { widthPx: number; heightPx: number; bleedMm: number; requiredDpi: number };
  mode: 'front' | 'back' | 'centre';
  ellipseCx: number;
}): Promise<{ buffer: Buffer; width: number; height: number }> {
  const { blankBuf, printmapBuf, designBuf, transform, workEdge, outputEdge, print, mode, ellipseCx } = args;
  const back = mode === 'back';

  // Working photo (cap the longest edge; the quad is normalised so it scales with it). The BACK
  // view is the same mug flopped — handle to the left — and we wrap the reverse arc onto it.
  const bm = await sharp(blankBuf, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  const bw0 = bm.width ?? 0, bh0 = bm.height ?? 0;
  if (!bw0 || !bh0) throw new NoMockupTemplateError('unreadable blank template');
  const scale = Math.min(1, workEdge / Math.max(bw0, bh0));
  const WW = Math.max(1, Math.round(bw0 * scale));
  const WH = Math.max(1, Math.round(bh0 * scale));
  let workingBlankPipe = sharp(blankBuf, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).resize(WW, WH, { fit: 'fill' });
  if (back) workingBlankPipe = workingBlankPipe.flop();
  const workingBlank = await workingBlankPipe.toBuffer();

  // Prepare the design as the FULL printed wrap on a print-aspect canvas (cover-fit + transform,
  // zero bleed — this view is never printed), exactly as the print file lays the wrap out.
  const dm = await sharp(designBuf, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  const src = { width: dm.width ?? 0, height: dm.height ?? 0 };
  if (!src.width || !src.height) throw new NoMockupTemplateError('unreadable design image');
  const dw = Math.max(2, print.widthPx);
  const dh = Math.max(2, print.heightPx);
  const layer = computeLayerRect({ printWidthPx: dw, printHeightPx: dh, bleedMm: 0, requiredDpi: print.requiredDpi }, src, transform);
  if (layer.width * layer.height > MAX_DRAWN_PIXELS) throw new NoMockupTemplateError(`design aspect too extreme to composite (${layer.width}×${layer.height})`);
  const scaled = await sharp(designBuf, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
    .rotate(transform.rotationDeg)
    .resize(layer.width, layer.height, { fit: 'fill' })
    .ensureAlpha()
    .toBuffer();
  const ix = Math.max(0, -layer.x);
  const iy = Math.max(0, -layer.y);
  const ox = Math.max(0, layer.x);
  const oy = Math.max(0, layer.y);
  const iw = Math.max(1, Math.min(layer.width - ix, dw - ox));
  const ih = Math.max(1, Math.min(layer.height - iy, dh - oy));
  const part = await sharp(scaled).extract({ left: ix, top: iy, width: iw, height: ih }).toBuffer();
  // Opaque WHITE wrap canvas (not transparent): multiply reads white as "no ink", so the unprinted
  // margins are an identity op over the ceramic instead of a premultiplied-black edge line.
  const wrap = await sharp({ create: { width: dw, height: dh, channels: 4, background: '#ffffff' } })
    .composite([{ input: part, left: ox, top: oy }])
    .flatten({ background: '#ffffff' })
    .ensureAlpha()
    .raw()
    .toBuffer();

  // The PRINTMAP alpha at working res (flopped for the BACK view so it still covers the face) — a
  // single channel where opaque = the visible printable surface. Its shape drives the whole wrap.
  let pmPipe = sharp(printmapBuf, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).resize(WW, WH, { fit: 'fill' });
  if (back) pmPipe = pmPipe.flop();
  const printAlpha = await pmPipe.ensureAlpha().extractChannel(3).raw().toBuffer();

  const warped = cylinderWarp({
    design: wrap, srcW: dw, srcH: dh, printAlpha, pmW: WW, pmH: WH,
    // The photo + printmap are flopped for the BACK, so the ellipse centre mirrors with them.
    ellipseCx: back ? 1 - ellipseCx : ellipseCx, ellipseA: MUG_ELLIPSE_A,
    printedArcDeg: MUG_PRINTED_ARC_DEG, mode,
  });
  // Flatten the warped RGBA over white so alpha-0 (off-surface) is white → multiply identity → bare mug.
  const warpedPng = await sharp(warped, { raw: { width: WW, height: WH, channels: 4 } }).flatten({ background: '#ffffff' }).png().toBuffer();

  const composited = await sharp(workingBlank, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
    .pipelineColourspace('scrgb')
    .composite([{ input: warpedPng, left: 0, top: 0, blend: 'multiply' }])
    .toColourspace('srgb')
    .toBuffer();

  const out = await sharp(composited, { limitInputPixels: MAX_INPUT_PIXELS })
    .resize(outputEdge, outputEdge, { fit: 'inside', kernel: 'lanczos3', withoutEnlargement: true })
    .sharpen({ sigma: 0.8, m1: 0.5, m2: 2 })
    .withMetadata({ icc: 'srgb' })
    .webp({ quality: 82, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  return { buffer: out.data, width: out.info.width, height: out.info.height };
}
