import './sharp-init';
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import sharp, { type OverlayOptions, type Sharp } from 'sharp';
import { mockupViews, printTemplates, products, productVariants, storageObjects, templateAssets } from '@/db/schema';
import { getViewableAssetOrThrow } from '@/server/assets';
import { derivativeKey, getObjectBytes, getS3, putObject } from '@/storage';
import type { ViewerContext } from '@/authz';
import type { DbHandle } from '@/server/db';
import { type RawTransform, type Transform, canvasSizePx, clampTransform, computeLayerRect, galleryRect, isGalleryProduct } from './geometry';
import { groundHex, groundTag, isGroundProduct, isPatternProduct, normalizeGround } from '@/lib/patterns';
import { renderRepeatPatternPixels } from './pattern';
import { isHeightChart } from './height-chart-geometry';
import { renderHeightChartFacePixels } from './heightChart';
import { applyFabricFx, MATERIAL_FX } from './fabricFx';
import { firmAlpha } from './apparel';
import { perspectiveWarp } from './perspective';
import { cylinderWarp } from './cylinder';
import { ByteLru, faceCache } from './previewCache';

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
/** The angled-view preview canvas's longest edge (never printed — warped onto the working photo). */
const PERSPECTIVE_CANVAS_EDGE = 3000;
const OUTPUT_EDGE: Record<MockupSize, number> = { thumb: 400, zoom: 1200 };
const MAX_CONCURRENT = 3;
// Render-engine revision — part of the cache key, so an engine upgrade (e.g. the Tier-B
// fabric fx) re-renders cached mockups without a per-template version bump.
/**
 * PREVIEW-ONLY paper tone, by product: the photographed products beside the printed one aren't pure
 * white, so a pure-white printed surface glares next to them (founder, 23 Oct: the custom playing
 * card next to the photographed K/Q/J, whose white measures ~237/255). The whole printed surface is
 * multiplied by this in the MOCKUP only — the print file is never touched.
 */
const PAPER_TONE: Partial<Record<string, number>> = { playingCards: 237 / 255 };

const RENDER_REV = 'r21'; // r21: angled previews lay out on a capped canvas (tube socks render again); r20: the custom playing card's paper matches the photographed cards' off-white; r19: narrow repeats (ankle socks) default to ≥4 motifs round, one centred on the visible side; r18: tees see-through around the garment; r17: tees per colour + true size, firm edges on coloured garments; r16: angled views lay the design on white paper (transparent art no longer makes a ghost card); r15: mug 'centre' view

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
  /** An edge-to-edge product's BASE COLOUR (#rrggbb, GROUND_PRODUCT_KEYS): the printed face is
   * filled with it, the drawing sitting (or repeating) on top — exactly as the print file. Ignored on
   * other products. */
  ground?: string;
  /** Per-REQUEST memo (a batch of thumbs for one drawing shares its shrunk design). Never kept
   * across requests. (The one thing made from a drawing that outlives a request is the printed
   * face — briefly, behind the authz gate, dropped on erase: see previewCache.ts.) */
  memo?: ComposeMemo;
}
export type ComposeMemo = Map<string, Promise<Buffer>>;

/** Thumbs (400px out) work at ≤ 800px — 3.5× fewer pixels than the 1500px zoom tier, no visible loss. */
const THUMB_WORK_EDGE = 800;
/** …and draw from a copy of the design no bigger than this (a 4500px original is ~10× the pixels). */
const THUMB_DESIGN_EDGE = 1200;

/** The design's bytes — shrunk for a thumb, memoised per request when a memo is given. */
async function designBytes(key: string, edge: number | null, memo?: ComposeMemo): Promise<Buffer> {
  const id = `${key}@${edge ?? 'full'}`;
  const hit = memo?.get(id);
  if (hit) return hit;
  const p = (async () => {
    const buf = await getObjectBytes(key);
    if (!edge) return buf;
    return sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS }).resize(edge, edge, { fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 1 }).toBuffer();
  })();
  memo?.set(id, p);
  return p;
}

// ── Template layers (blank / mask / overlay): brand-safe, NON-child, and immutable per key (a
// re-author bumps the version → a new key), so they're safe to keep in process memory. A warm
// server then composes a thumb without touching storage for the photo at all — and without
// decoding it either: each layer is also kept DECODED at the working size a render asked for (and
// the pieces derived from it: the print-area grey maps, the silhouette clip), so a thumb, its zoom
// and a colour flip of the same product redo none of that.
const templateBytesCache = new ByteLru<Buffer>(160 * 1024 * 1024, (b) => b.byteLength);
const templateRawCache = new ByteLru<Raw>(192 * 1024 * 1024, (r) => r.data.byteLength);
function templateBytes(key: string): Promise<Buffer> {
  return templateBytesCache.get(key, () => getObjectBytes(key));
}
/** A template-derived raw layer — cached under the layer's stable id when it has one (the shop's
 * template asset key); made fresh when it hasn't (in-memory previews, tests). */
function templateRaw(id: string | undefined, step: string, make: () => Promise<Raw>): Promise<Raw> {
  return id ? templateRawCache.get(`${id}|${step}`, make) : make();
}

/**
 * Fill the template-layer cache when the server starts (founder, 26 Oct: "the image upload on first
 * testing seemed to take too long" — a fresh server fetched every product photo from storage during
 * the first shopper's catalogue reveal). Only BRAND-SAFE, NON-child template images (template_assets);
 * never a design. Best-effort and bounded: a byte budget below the cache's own, a few at a time, and
 * any failure simply leaves that layer to load on first use as before.
 */
export async function warmTemplateCache(db: DbHandle, budgetBytes = 120 * 1024 * 1024): Promise<{ layers: number; bytes: number }> {
  const rows = await db.select({ key: templateAssets.key, byteSize: templateAssets.byteSize }).from(templateAssets);
  let bytes = 0, layers = 0;
  const todo = rows.filter((r) => {
    const n = r.byteSize ?? 2 * 1024 * 1024;
    if (bytes + n > budgetBytes) return false;
    bytes += n;
    return true;
  });
  bytes = 0;
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(todo.slice(i, i + 4).map(async (r) => {
      try {
        bytes += (await templateBytes(r.key)).byteLength;
        layers++;
      } catch {
        /* loads on first use instead */
      }
    }));
  }
  return { layers, bytes };
}

/** Empty the compositor's in-process caches (the parity test and the benchmark measure cold renders). */
export function clearMockupCaches(): void {
  templateBytesCache.clear();
  templateRawCache.clear();
  faceCache.clear();
}

// ── Raw pixels between steps. Every intermediate used to be re-encoded as PNG and decoded again by
// the next pipeline (13 times a render) — lossless, so the pixels were identical, but it was most of
// the render's time. Steps now hand each other the decoded pixels; only the final WebP is encoded.
export type RawPixels = Raw;
interface Raw {
  data: Buffer;
  width: number;
  height: number;
  channels: 1 | 2 | 3 | 4;
}
async function toRaw(p: Sharp): Promise<Raw> {
  const { data, info } = await p.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}
const rawOf = (r: Raw) => ({ raw: { width: r.width, height: r.height, channels: r.channels } });
/** A pipeline reading raw pixels. */
const fromRaw = (r: Raw) => sharp(r.data, { ...rawOf(r), limitInputPixels: MAX_INPUT_PIXELS });
/** A composite input from raw pixels. */
const overlayOf = (r: Raw, o: Omit<OverlayOptions, 'input' | 'raw'> = {}): OverlayOptions => ({ input: r.data, ...rawOf(r), ...o });

/** The blank at the working size (longest edge capped at workEdge — scRGB is 32-bit float, ~4×
 * memory, so the cap is load-bearing; the normalised quad scales with it). Its OWN pipeline: sharp
 * honours one .resize() per pipeline, so it can't share a chain with the output resize. */
async function workingBlankOf(blankBuf: Buffer, workEdge: number, id: string | undefined, flop = false): Promise<{ img: Raw; WW: number; WH: number }> {
  const m = await sharp(blankBuf, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  const bw0 = m.width ?? 0, bh0 = m.height ?? 0;
  if (!bw0 || !bh0) throw new NoMockupTemplateError('unreadable blank template');
  const scale = Math.min(1, workEdge / Math.max(bw0, bh0));
  const WW = Math.max(1, Math.round(bw0 * scale));
  const WH = Math.max(1, Math.round(bh0 * scale));
  const img = await templateRaw(id, `blank@${WW}x${WH}${flop ? '-flop' : ''}`, () => {
    const p = sharp(blankBuf, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).resize(WW, WH, { fit: 'fill' });
    return toRaw(flop ? p.flop() : p);
  });
  return { img, WW, WH };
}

/** The design (encoded bytes, or pixels — a printed face arrives as pixels) as a pipeline input. */
type Design = Buffer | Raw;
function designInput(d: Design): Sharp {
  return Buffer.isBuffer(d) ? sharp(d, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }) : fromRaw(d);
}
async function designSize(d: Design): Promise<{ width: number; height: number }> {
  if (!Buffer.isBuffer(d)) return { width: d.width, height: d.height };
  const m = await sharp(d, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  return { width: m.width ?? 0, height: m.height ?? 0 };
}

/** The design rotated, scaled to the drawn rect and cut to its visible window — one pipeline. */
function placedPart(designBuf: Design, transform: Transform, size: { width: number; height: number }, win: { left: number; top: number; width: number; height: number }): Promise<Raw> {
  return toRaw(
    designInput(designBuf)
      .rotate(transform.rotationDeg)
      .resize(size.width, size.height, { fit: 'fill' })
      .ensureAlpha()
      .extract(win),
  );
}

/** The final step, unchanged: downscale to the display size (lanczos), sharpen, encode sRGB WebP. */
async function encodeOutput(img: Raw, outputEdge: number): Promise<{ buffer: Buffer; width: number; height: number }> {
  const out = await fromRaw(img)
    .resize(outputEdge, outputEdge, { fit: 'inside', kernel: 'lanczos3', withoutEnlargement: true })
    .sharpen({ sigma: 0.8, m1: 0.5, m2: 2 })
    .withMetadata({ icc: 'srgb' })
    .webp({ quality: 82, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  return { buffer: out.data, width: out.info.width, height: out.info.height };
}

/** Clip a layer to a silhouette window (dest-in with a black RGB + mask-alpha clip), as sharp did. */
async function clipTo(layer: Raw, clip: Raw): Promise<Raw> {
  return toRaw(fromRaw(layer).composite([overlayOf(clip, { blend: 'dest-in' })]));
}
/** The silhouette clip for a window of the mask (soft 0.6px edge so it doesn't alias). Template-only. */
function maskClip(maskBuf: Buffer, id: string | undefined, WW: number, WH: number, win?: { x: number; y: number; w: number; h: number }): Promise<Raw> {
  const w = win?.w ?? WW, h = win?.h ?? WH;
  return templateRaw(id, `clip@${WW}x${WH}${win ? `:${win.x},${win.y},${w},${h}` : ''}`, async () => {
    let p = sharp(maskBuf, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).resize(WW, WH, { fit: 'fill' });
    if (win) p = p.extract({ left: win.x, top: win.y, width: w, height: h });
    const alpha = await toRaw(p.toColourspace('b-w').blur(0.6));
    return toRaw(sharp({ create: { width: w, height: h, channels: 3, background: '#000' } }).joinChannel(alpha.data, rawOf(alpha)));
  });
}
/** A foreground overlay at the working size. Template-only. */
function overlayAt(overlayBuf: Buffer, id: string | undefined, WW: number, WH: number): Promise<Raw> {
  return templateRaw(id, `overlay@${WW}x${WH}`, () =>
    toRaw(sharp(overlayBuf, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).resize(WW, WH, { fit: 'fill' }).ensureAlpha()),
  );
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

/**
 * Should a print be turned 90° to fit a skewed quad? Only when the quad matches the SWAPPED print
 * shape strictly better than the print as it is (the tin's landscape lid print shot in a portrait
 * view). A square print onto a square-ish quad is never turned: a rounding hair either side of 1
 * would otherwise lay a pattern on its side. Exported for its unit test.
 */
export function isTransposed(printAspect: number, quadAspect: number): boolean {
  const straight = Math.abs(Math.log(printAspect) - Math.log(quadAspect));
  const swapped = Math.abs(-Math.log(printAspect) - Math.log(quadAspect));
  return swapped + 1e-9 < straight;
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
  /** More print areas that show the SAME print file (a pair of socks) — display only. */
  extraQuads: [number, number][][];
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
/** "the back" of these is the same product photo turned over (flipped) — the founder's photo, nothing invented
 * (founder, 26 Oct). A single-sided print shows it unprinted (the page asks with a white fill); the bauble,
 * printed on both sides, shows the drawing again — reading the right way round. */
export const FLIP_BACK_KEYS = new Set(['sack', 'ceramicOrnament', 'christmasBauble']);
async function loadResolvedTemplate(db: DbHandle, variantId: string, view: string | undefined): Promise<ResolvedTemplate | null> {
  if (view && !PRIMARY_VIEWS.has(view)) {
    const [v] = await db.select().from(mockupViews).where(and(eq(mockupViews.variantId, variantId), eq(mockupViews.view, view)));
    if (!v?.blankObjectId || !v.printQuad) return null;
    // Display-only: no bleed (Prodigi prints from the primary geometry, never this view).
    return { blankObjectId: v.blankObjectId, maskObjectId: v.maskObjectId, overlayObjectId: v.overlayObjectId, printQuad: v.printQuad, extraQuads: [], printWidthPx: v.printWidthPx, printHeightPx: v.printHeightPx, bleedMm: 0, requiredDpi: 300, materialClass: v.materialClass, mapResolutionPx: v.mapResolutionPx, templateVersion: v.templateVersion };
  }
  const [t] = await db.select().from(printTemplates).where(eq(printTemplates.variantId, variantId));
  if (!t?.blankObjectId || !t.printQuad) return null;
  return { blankObjectId: t.blankObjectId, maskObjectId: t.maskObjectId, overlayObjectId: t.lightingObjectId, printQuad: t.printQuad, extraQuads: t.extraQuads ?? [], printWidthPx: t.printWidthPx, printHeightPx: t.printHeightPx, bleedMm: t.bleedMm, requiredDpi: t.requiredDpi, materialClass: t.materialClass, mapResolutionPx: t.mapResolutionPx, templateVersion: t.templateVersion };
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
  // Products whose print file is NOT "the drawing, placed": a repeat pattern (socks, wrapping
  // paper, tea towel) and the height chart (drawing + ruler). Their preview shows the PRINTED FACE
  // — rendered by the same code as the print file, just smaller — so preview == print.
  const [prod] = await db
    .select({ key: products.key })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(eq(productVariants.id, input.variantId));
  const face: Face | undefined = !input.fill && (!input.view || PRIMARY_VIEWS.has(input.view))
    ? isPatternProduct(prod?.key) ? 'pattern' : isHeightChart(prod?.key) ? 'heightChart' : isGalleryProduct(prod?.key) ? 'gallery' : undefined
    : undefined;
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
  // a coloured base forks the key (white keeps the existing key, so nothing re-renders)
  const ground = !fill && (face === 'pattern' || isGroundProduct(prod?.key)) ? normalizeGround(input.ground) : null;
  const gTag = groundTag(ground);
  const faceTag = face ? `-face${face === 'pattern' ? 'rep' : face === 'gallery' ? 'gal' : 'hc'}${FACE_REV}${gTag}` : gTag;
  const key = derivativeKey(input.assetId, `mockup-${input.variantId}${viewTag}-${size}-v${tpl.templateVersion}${RENDER_REV}${fillTag}${spanTag}${faceTag}-${srcObj.id}${srcObj.sha256 ? `.${srcObj.sha256.slice(0, 10)}` : ''}-${transformHash(t)}`);

  // 5. Cache hit → no sharp work.
  const [existing] = await db.select({ id: storageObjects.id }).from(storageObjects).where(eq(storageObjects.key, key));
  if (existing) return { mockupObjectId: existing.id, key, format: 'webp', tier: isAxisAligned(tpl.printQuad) && !tpl.extraQuads.length ? 'FLAT' : 'PERSPECTIVE', cached: true };

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
      designTag: `${srcObj.id}${srcObj.sha256 ? `.${srcObj.sha256.slice(0, 10)}` : ''}`,
      fillHex: fill,
      groundHex: ground ? groundHex(ground) : undefined,
      quad: tpl.printQuad,
      extraQuads: tpl.extraQuads,
      transform: t,
      spanHalf,
      workEdge: size === 'thumb' ? Math.min(tpl.mapResolutionPx, THUMB_WORK_EDGE) : tpl.mapResolutionPx,
      outputEdge: OUTPUT_EDGE[size],
      thumb: size === 'thumb',
      memo: input.memo,
      print: { widthPx: tpl.printWidthPx, heightPx: tpl.printHeightPx, bleedMm: tpl.bleedMm, requiredDpi: tpl.requiredDpi },
      materialClass: tpl.materialClass,
      mugMode: input.view === 'back' ? 'back' : input.view === 'centre' ? 'centre' : 'front',
      flipBack: input.view === 'back' && FLIP_BACK_KEYS.has(prod?.key ?? ''),
      face,
      paperTone: PAPER_TONE[prod?.key ?? ''],
    }),
  );
  inFlight.set(key, p);
  try {
    return await p;
  } finally {
    inFlight.delete(key);
  }
}

/** the PRINTED FACE a product's mockup shows (the print code's own render): the repeat, the height chart,
 * the calendar's gallery page (the whole drawing inside a white margin) */
type Face = 'pattern' | 'heightChart' | 'gallery';
/** Bump to re-render cached pattern / height-chart previews when the face rendering changes. */
const FACE_REV = '2'; // 2: the repeat's motif follows the zoom; rows follow the motif (every zoom step adds copies)
/** The longest edge / the most pixels a preview face is rendered at (a 5 m roll is 122 MP in print;
 * the photo's print area is never more than the ~1500 px working edge, so 2× that is plenty). */
const FACE_MAX_EDGE = 3000;
const FACE_MAX_PIXELS = 8_000_000;
/** A thumb's face only needs to cover its ≤ 800px working photo. */
const THUMB_FACE_EDGE = 1000;

/** Render a product's printed face at preview size — the same functions renderPrintFile uses — as
 * pixels: the compositor lays it straight onto the photo, so it is never encoded in between. */
export async function renderPrintedFace(
  srcBuf: Buffer,
  face: Face,
  print: { widthPx: number; heightPx: number; bleedMm: number; requiredDpi: number },
  transform: Transform,
  maxEdge = FACE_MAX_EDGE,
  /** A pattern's base colour (#rrggbb) — the print file's fill; white by default. */
  groundHex = '#ffffff',
): Promise<RawPixels> {
  const geom = { printWidthPx: print.widthPx, printHeightPx: print.heightPx, bleedMm: print.bleedMm, requiredDpi: print.requiredDpi };
  const canvas = face === 'pattern' ? canvasSizePx(geom) : { width: print.widthPx, height: print.heightPx };
  const scale = Math.min(1, maxEdge / Math.max(canvas.width, canvas.height), Math.sqrt(FACE_MAX_PIXELS / (canvas.width * canvas.height)));
  if (face === 'pattern') return renderRepeatPatternPixels(srcBuf, canvas, print.requiredDpi, transform, groundHex, { scale });
  if (face === 'gallery') {
    // the page as it prints (no bleed — the mockup shows the trimmed page): white, the whole drawing in the margin
    const r = galleryRect(geom, await designSize(srcBuf));
    const W = Math.max(1, Math.round(print.widthPx * scale)), H = Math.max(1, Math.round(print.heightPx * scale));
    const art = await sharp(srcBuf).resize(Math.max(1, Math.round(r.width * scale)), Math.max(1, Math.round(r.height * scale)), { fit: 'fill' }).png().toBuffer();
    const { data, info } = await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
      .composite([{ input: art, left: Math.round(r.x * scale), top: Math.round(r.y * scale) }])
      .flatten({ background: '#ffffff' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height, channels: info.channels as 3 };
  }
  return renderHeightChartFacePixels(srcBuf, geom, transform, { scale, groundHex: groundHex === '#ffffff' ? undefined : groundHex });
}

/**
 * Render a mockup from template layers held in memory — no storage, no viewer, and the caller passes
 * brand-safe TEST art only. For checking new product photo sets on this machine before they're seeded
 * (scripts/preview-mockups.ts). Same renderers and same choice of warp as the shop.
 */
export async function renderTemplatePreview(args: {
  blank: Buffer; mask?: Buffer; overlay?: Buffer; quad: [number, number][]; materialClass: string;
  /** more print areas showing the same print file (a pair of socks) */
  extraQuads?: [number, number][][];
  design: Buffer; productKey: string; print: { widthPx: number; heightPx: number; bleedMm: number; requiredDpi: number };
  size?: MockupSize;
  /** a base colour (#rrggbb; white by default) */
  ground?: string;
  /** the placement (default: the product's default) */
  transform?: Transform;
}): Promise<Buffer> {
  const face: Face | undefined = isPatternProduct(args.productKey) ? 'pattern' : isHeightChart(args.productKey) ? 'heightChart' : isGalleryProduct(args.productKey) ? 'gallery' : undefined;
  let transform: Transform = args.transform ?? { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 };
  let designBuf: Design = args.design;
  if (face) {
    designBuf = await renderPrintedFace(args.design, face, args.print, transform, undefined, groundHex(args.ground));
    transform = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 };
  }
  const meta = await sharp(args.blank).metadata();
  const placedGround = !face && isGroundProduct(args.productKey) && normalizeGround(args.ground) ? groundHex(args.ground) : undefined;
  const common = { blankBuf: args.blank, designBuf, ids: {}, quad: args.quad, transform, workEdge: Math.max(meta.width ?? 0, meta.height ?? 0), outputEdge: OUTPUT_EDGE[args.size ?? 'zoom'], print: args.print, groundHex: placedGround };
  const out = !isAxisAligned(args.quad) || args.extraQuads?.length
    ? await renderPerspective({ ...common, extraQuads: args.extraQuads?.length ? args.extraQuads : undefined, maskBuf: args.mask, overlayBuf: args.overlay, materialClass: args.materialClass, paperTone: PAPER_TONE[args.productKey] })
    : await renderFlat({ ...common, maskBuf: args.mask, overlayBuf: args.overlay, materialClass: args.materialClass });
  return out.buffer;
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
    assetId: string; key: string; blankKey: string; maskKey?: string; overlayKey?: string; designKey: string;
    /** the source object's id + content hash — what a cached printed face was made from */
    designTag: string;
    fillHex?: string; groundHex?: string; quad: [number, number][]; extraQuads?: [number, number][][];
    transform: Transform; spanHalf?: 'front' | 'back'; workEdge: number; outputEdge: number;
    print: { widthPx: number; heightPx: number; bleedMm: number; requiredDpi: number };
    materialClass: string; mugMode?: 'front' | 'back' | 'centre'; face?: Face;
    thumb?: boolean; memo?: ComposeMemo;
    /** preview-only paper tone (PAPER_TONE) */
    paperTone?: number;
    /** "the back": render the front, turned over (FLIP_BACK_KEYS) */
    flipBack?: boolean;
  },
): Promise<MockupResult> {
  // A solid-colour fill (cushion plain back) is synthesised in-process — no child pixels; it
  // cover-fits + multiplies over the blank so the whole face reads as that plush fabric colour.
  // A THUMB never needs the full-size original or the full-size photo: the design is shrunk once
  // (shared across a batch via `memo`) and every template layer comes from the in-process cache,
  // decoded at the thumb's working size — far less to download, decode and composite (the
  // catalogue reveal).
  const source = () => (args.fillHex ? solidFill(args.fillHex) : designBytes(args.designKey, args.thumb ? THUMB_DESIGN_EDGE : null, args.memo));
  let designBuf: Design;
  let transform = args.transform;
  if (args.face) {
    // The PRINTED FACE (the repeat / the drawing + ruler) at preview size, from the print code. It
    // has the print canvas's exact aspect, so a plain cover-fit lays it on the print area 1:1.
    // Kept briefly in memory (previewCache.ts — reached only past composeMockup's authz gate, keyed
    // by this exact source object + content hash, dropped when the asset is erased), so flipping
    // back to a colour, a sibling size with the same print canvas, or a re-render after a template
    // bump reuses it without fetching the drawing again.
    const faceEdge = args.thumb ? THUMB_FACE_EDGE : FACE_MAX_EDGE;
    const p = args.print;
    const faceKey = `${args.assetId}|${args.designTag}|${args.face}${FACE_REV}|${faceEdge}|${p.widthPx}x${p.heightPx}@${p.requiredDpi}+${p.bleedMm}|${transformHash(args.transform)}|${args.groundHex ?? ''}`;
    designBuf = await faceCache.get(faceKey, async () => renderPrintedFace(await source(), args.face!, p, args.transform, faceEdge, args.groundHex));
    transform = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 };
  } else {
    designBuf = await source();
  }
  if (args.flipBack && !args.fillHex) {
    designBuf = await sharp(Buffer.isBuffer(designBuf) ? designBuf : await sharp(designBuf.data, { raw: { width: designBuf.width, height: designBuf.height, channels: designBuf.channels } }).png().toBuffer()).flop().png().toBuffer();
    transform = { ...transform, offsetX: -transform.offsetX, rotationDeg: ((360 - transform.rotationDeg) % 360) as Transform['rotationDeg'] };
  }
  const out = await renderMockupLayers({
    blank: await templateBytes(args.blankKey),
    mask: args.maskKey ? await templateBytes(args.maskKey) : undefined,
    overlay: args.overlayKey ? await templateBytes(args.overlayKey) : undefined,
    layerIds: { blank: args.blankKey, mask: args.maskKey, overlay: args.overlayKey },
    design: designBuf,
    quad: args.quad,
    extraQuads: args.extraQuads,
    transform,
    spanHalf: args.spanHalf,
    workEdge: args.workEdge,
    outputEdge: args.outputEdge,
    print: args.print,
    materialClass: args.materialClass,
    mugMode: args.mugMode,
    // a base colour under a PLACED drawing (a printed face already carries its own)
    groundHex: args.face ? undefined : args.groundHex,
    paperTone: args.paperTone,
  });
  if (args.flipBack) {
    const flopped = await sharp(out.buffer).flop().toBuffer();
    out.buffer = flopped;
  }

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

  return { mockupObjectId, key: args.key, format: 'webp', tier: out.tier, cached: false, widthPx: out.width, heightPx: out.height };
}

/**
 * The render itself, from layers already in memory — no storage, no database, no viewer. The ONLY
 * caller with a child's design is renderAndPersist (after its authz gate); it is exported for the
 * pixel-parity test, which drives every tier with synthetic, brand-safe layers.
 */
export async function renderMockupLayers(args: {
  blank: Buffer; mask?: Buffer; overlay?: Buffer; design: Buffer | RawPixels; quad: [number, number][];
  /** More print areas showing the SAME print file (a pair of socks) — drawn by the perspective tier. */
  extraQuads?: [number, number][][];
  /** Stable ids of the TEMPLATE layers (their storage keys): their decoded, working-size pixels are
   * then cached in process. Absent ⇒ nothing is cached. Never an id for the design. */
  layerIds?: { blank?: string; mask?: string; overlay?: string };
  transform: Transform; spanHalf?: 'front' | 'back'; workEdge: number; outputEdge: number;
  print: { widthPx: number; heightPx: number; bleedMm: number; requiredDpi: number };
  materialClass: string; mugMode?: 'front' | 'back' | 'centre';
  /** Base colour under a PLACED drawing (#rrggbb), edge to edge on the print area (flat, perspective, the mug's wrap). */
  groundHex?: string;
  /** Preview-only paper tone (PAPER_TONE), multiplied over the printed surface. Perspective only. */
  paperTone?: number;
}): Promise<{ buffer: Buffer; width: number; height: number; tier: 'FLAT' | 'PERSPECTIVE' }> {
  // A skewed quad (an angled product like the tin lid) → PERSPECTIVE warp; a ceramic mug →
  // CYLINDER warp (the art curves around the real photo's face); else the FLAT (axis-aligned
  // bbox) placement. Same secure spine either way.
  // Several print areas (a pair of socks) always take the perspective tier: it maps the print file
  // into each area (a straight area is just a simple case of the warp).
  const extra = args.extraQuads?.length ? args.extraQuads : undefined;
  const perspective = !isAxisAligned(args.quad) || !!extra;
  // A ceramic mug WITH a printmap (mask) → CYLINDER warp onto that surface. Without a printmap
  // (the plain-white fallback blank) it falls through to FLAT.
  const cylinder = !perspective && args.materialClass === 'CERAMIC' && !!args.mask;
  const common = { blankBuf: args.blank, designBuf: args.design, ids: args.layerIds ?? {}, quad: args.quad, transform: args.transform, workEdge: args.workEdge, outputEdge: args.outputEdge, print: args.print };
  const out = perspective
    ? await renderPerspective({ ...common, extraQuads: extra, spanHalf: args.spanHalf, maskBuf: args.mask, overlayBuf: args.overlay, materialClass: args.materialClass, groundHex: args.groundHex, paperTone: args.paperTone })
    : cylinder
      ? await renderCylinder({ ...common, mode: args.mugMode ?? 'front', ellipseCx: args.mugMode === 'centre' ? MUG_CENTRE_ELLIPSE_CX : MUG_ELLIPSE_CX, printmapBuf: args.mask!, groundHex: args.groundHex })
      : await renderFlat({ ...common, maskBuf: args.mask, overlayBuf: args.overlay, materialClass: args.materialClass, groundHex: args.groundHex });
  return { ...out, tier: perspective ? 'PERSPECTIVE' : 'FLAT' };
}

/** Template-layer ids for the in-process decoded cache (see templateRaw). */
type LayerIds = { blank?: string; mask?: string; overlay?: string };

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
  designBuf: Design;
  ids: LayerIds;
  quad: [number, number][];
  transform: Transform;
  workEdge: number;
  outputEdge: number;
  /** The variant's real print geometry, for bleed-exact windowing. */
  print: { widthPx: number; bleedMm: number; requiredDpi: number };
  /** Base colour under the drawing, filling the whole print area (#rrggbb); none = see-through. */
  groundHex?: string;
  /** Drives the Tier-B fabric fx intensities (fold displacement + shading). */
  materialClass: string;
}): Promise<{ buffer: Buffer; width: number; height: number }> {
  const { blankBuf, maskBuf, overlayBuf, designBuf, ids, quad, transform, workEdge, outputEdge, print, materialClass, groundHex: ground } = args;

  const { img: workingBlank, WW, WH } = await workingBlankOf(blankBuf, workEdge, ids.blank);
  const rect = quadBboxPx(quad, WW, WH);

  // Place the design into the print area exactly as the print render places it onto the
  // bleed canvas — cover-fit + clamped transform — but with the print AREA as the canvas
  // (zero bleed), so what's previewed is the visible printed result.
  const src = await designSize(designBuf);
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
  const ix = Math.max(0, bleed - layer.x);
  const iy = Math.max(0, bleed - layer.y);
  const ox = Math.max(0, layer.x - bleed);
  const oy = Math.max(0, layer.y - bleed);
  const iw = Math.max(1, Math.min(layer.width - ix, rect.w - ox));
  const ih = Math.max(1, Math.min(layer.height - iy, rect.h - oy));
  const part = await placedPart(designBuf, transform, layer, { left: ix, top: iy, width: iw, height: ih });
  // the print area: see-through (unprinted surface), or the BASE COLOUR edge to edge
  const windowed = await toRaw(
    sharp({ create: { width: rect.w, height: rect.h, channels: 4, background: ground ?? { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([overlayOf(part, { left: ox, top: oy })]),
  );

  const fx = MATERIAL_FX[materialClass] ?? MATERIAL_FX.PAPER!;
  // A coloured garment prints firm edges (see apparel.ts) — show exactly that.
  let designLayer: Raw = windowed;
  if (materialClass === 'DARK_FABRIC') {
    const firm = Buffer.from(windowed.data);
    firmAlpha(firm);
    designLayer = { ...windowed, data: firm };
  }
  if (fx.blend === 'multiply') {
    // MULTIPLY reads white as "no ink" — flatten the window over white IMMEDIATELY.
    // The composite's premultiply round-trip leaves alpha-0 margins with BLACK rgb,
    // so ANY partial-alpha edge derived from them (the feather below, displaced or
    // downscaled edges) darkens the fabric as a line tracing the design's edge.
    // Opaque white margins are exact (multiply identity), and the feather is
    // unnecessary here: a bg-removal halo multiplies to invisible anyway.
    designLayer = await toRaw(fromRaw(windowed).flatten({ background: '#ffffff' }));
  } else {
    // Feather the alpha edge (blur the alpha channel, re-join) to remove the 1px halo a
    // background-removal can leave. Robust: if anything is off, fall back to the raw layer.
    try {
      const rgb = await toRaw(fromRaw(designLayer).removeAlpha());
      const alpha = await toRaw(fromRaw(designLayer).ensureAlpha().extractChannel(3).blur(0.8));
      designLayer = await toRaw(fromRaw(rgb).joinChannel(alpha.data, rawOf(alpha)));
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
      const win = `${rect.x},${rect.y},${rect.w},${rect.h}`;
      const area = () => fromRaw(workingBlank).extract({ left: rect.x, top: rect.y, width: rect.w, height: rect.h }).toColourspace('b-w');
      const blankGray = (await templateRaw(ids.blank, `gray@${WW}x${WH}:${win}`, () => toRaw(area()))).data;
      const blankGrayBlur = (await templateRaw(ids.blank, `grayblur@${WW}x${WH}:${win}`, () => toRaw(area().blur(Math.max(3, rect.w / 80))))).data; // folds, not fabric grain
      const designRaw = designLayer.channels === 4 ? designLayer : await toRaw(fromRaw(designLayer).ensureAlpha());
      if (designRaw.width === rect.w && designRaw.height === rect.h && blankGray.length === rect.w * rect.h) {
        const fxOut = applyFabricFx({
          design: designRaw.data,
          width: rect.w,
          height: rect.h,
          blankGray,
          blankGrayBlur,
          displaceStrength: fx.disp * Math.min(10, Math.max(2, rect.w / 60)),
          shadeAmount: fx.shade,
        });
        designLayer = { data: fxOut, width: rect.w, height: rect.h, channels: 4 };
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
    designLayer = await clipTo(designLayer, await maskClip(maskBuf, ids.mask, WW, WH, rect));
  }

  // MULTIPLY reads white as "no ink", so flatten the layer's alpha away over white:
  // any partial-alpha pixel (feather ring, displaced edges, mask soft edge) otherwise
  // darkens the fabric under the premultiplied multiply — a faint line tracing the
  // print edge. Flattening preserves the mask semantics too (clipped area → white →
  // identity over the fabric).
  if (fx.blend === 'multiply') {
    designLayer = await toRaw(fromRaw(designLayer).flatten({ background: '#ffffff' }));
  }

  // Composite the design over the working-res blank IN LINEAR LIGHT (own pipeline:
  // sharp applies a chained .resize() to the base BEFORE composite, which would shrink
  // it under the design — so the downscale must be a SEPARATE pipeline).
  const composited = await toRaw(
    fromRaw(workingBlank)
      .pipelineColourspace('scrgb')
      .composite([overlayOf(designLayer, { left: rect.x, top: rect.y, blend: fx.blend })])
      .toColourspace('srgb'),
  );

  // FOREGROUND overlay (piece lines etc.) OVER the design — full-frame at working res,
  // authored on the same canvas as the blank so it registers by construction; the art reads
  // THROUGH it (die-cut lines sit on top). Composited in sRGB to preserve its authored look.
  // Pure enhancement: any failure keeps `composited` — a mockup must never break for it.
  let flattened = composited;
  if (overlayBuf) {
    try {
      const ov = await overlayAt(overlayBuf, ids.overlay, WW, WH);
      flattened = await toRaw(fromRaw(composited).composite([overlayOf(ov, { left: 0, top: 0, blend: 'over' })]));
    } catch {
      // keep `composited`
    }
  }

  return encodeOutput(flattened, outputEdge);
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
  /** Silhouette (white = printable, same canvas as the blank): the warped art is clipped to it —
   * a rounded-corner card face, so the quad's sharp corners never poke past the real card. */
  maskBuf?: Buffer;
  /** Foreground overlay composited OVER the art (same canvas as the blank). */
  overlayBuf?: Buffer;
  /** Fabric (multiply) lets the photo's own texture read through the art, as on the flat path. */
  materialClass?: string;
  designBuf: Design;
  ids: LayerIds;
  quad: [number, number][];
  /** More print areas that show the SAME print file — a pair of socks, one print map per sock. */
  extraQuads?: [number, number][][];
  transform: Transform;
  spanHalf?: 'front' | 'back';
  workEdge: number;
  outputEdge: number;
  print: { widthPx: number; heightPx: number; bleedMm: number; requiredDpi: number };
  /** Base colour under the drawing, filling the whole print area (#rrggbb); none = white stock. */
  groundHex?: string;
  paperTone?: number;
}): Promise<{ buffer: Buffer; width: number; height: number }> {
  const { blankBuf, maskBuf, overlayBuf, materialClass, designBuf, ids, quad, extraQuads, transform, spanHalf, workEdge, outputEdge, print } = args;

  // Working blank (cap the longest edge; the quad is normalised, so it scales with it).
  const { img: workingBlank, WW, WH } = await workingBlankOf(blankBuf, workEdge, ids.blank);

  // Prepare the design on a print-aspect canvas (dw×dh = the print area's own px) — cover-fit
  // + transformed exactly like the flat path, but with ZERO bleed (this view is never printed).
  const src = await designSize(designBuf);
  if (!src.width || !src.height) throw new NoMockupTemplateError('unreadable design image');
  // A preview canvas never needs print resolution — it's warped down onto a working-size photo. Cap
  // its longest edge (same shape): a big print (a tube sock, 6141×5433) otherwise tripped the
  // drawn-pixel guard and the product had NO preview at all (founder testing, 23 Oct).
  const pk = Math.min(1, PERSPECTIVE_CANVAS_EDGE / Math.max(print.widthPx, print.heightPx));
  const dw = Math.max(2, Math.round(print.widthPx * pk));
  const dh = Math.max(2, Math.round(print.heightPx * pk));
  // 'full width' closed card: the design spans the whole outside (front+back), so cover-fit it
  // into a DOUBLE-WIDE spread and keep just this panel — 'front' = the right half of [back|front].
  const cw = spanHalf ? dw * 2 : dw;
  const layer = computeLayerRect({ printWidthPx: cw, printHeightPx: dh, bleedMm: 0, requiredDpi: print.requiredDpi * pk }, src, transform);
  if (layer.width * layer.height > MAX_DRAWN_PIXELS) throw new NoMockupTemplateError(`design aspect too extreme to composite (${layer.width}×${layer.height})`);
  // Window the transformed layer onto the cw×dh canvas (handles cover-crop AND contain-centre).
  const ix = Math.max(0, -layer.x);
  const iy = Math.max(0, -layer.y);
  const ox = Math.max(0, layer.x);
  const oy = Math.max(0, layer.y);
  const iw = Math.max(1, Math.min(layer.width - ix, cw - ox));
  const ih = Math.max(1, Math.min(layer.height - iy, dh - oy));
  const part = await placedPart(designBuf, transform, layer, { left: ix, top: iy, width: iw, height: ih });
  // The printed surface is PAPER: anything see-through in the design (a transparent PNG, a
  // removed background) prints as the white of the stock — so lay the design on white here too,
  // or the preview shows a ghost card with the art floating over the envelope.
  let spread = await toRaw(
    sharp({ create: { width: cw, height: dh, channels: 4, background: args.groundHex ?? { r: 255, g: 255, b: 255, alpha: 1 } } }).composite([overlayOf(part, { left: ox, top: oy })]),
  );
  // the preview-only paper tone: the printed surface, a shade off pure white like the photo around it
  if (args.paperTone && args.paperTone < 1) {
    const k = args.paperTone;
    spread = await toRaw(fromRaw(spread).linear([k, k, k, 1], [0, 0, 0, 0]));
  }
  // Keep just the visible panel (front = right half) — a no-op for a normal single-panel view.
  const panel = spanHalf ? await toRaw(fromRaw(spread).extract({ left: spanHalf === 'front' ? dw : 0, top: 0, width: dw, height: dh })) : spread;

  // If the print's aspect and the quad's OWN aspect are TRANSPOSED — e.g. the tin's landscape
  // lid print (869×674) shot in a portrait orientation — rotate the design −90° so it fills the
  // quad the right way round instead of squishing across it. A no-op when the two agree.
  const transposed = isTransposed(dw / dh, quadEdgeAspect(quad));
  const raw = transposed || panel.channels !== 4 ? await toRaw((transposed ? fromRaw(panel).rotate(-90) : fromRaw(panel)).ensureAlpha()) : panel;

  // Warp the design canvas onto the quad (in working-blank px), then composite over the photo. With
  // several print areas (a pair of socks) the SAME design goes into each — never mirrored; a
  // printed drawing always reads the right way round — and where two areas overlap (a sock's
  // cover-fit area reaching past its edge) each pixel belongs to the area whose centre is nearest.
  const toPx = (q: [number, number][]) => q.map(([x, y]) => [x * WW, y * WH]) as [number, number][];
  const warpInto = (q: [number, number][]) => perspectiveWarp({ design: raw.data, srcW: raw.width, srcH: raw.height, quad: toPx(q), canvasW: WW, canvasH: WH });
  const areas = [quad, ...(extraQuads ?? [])];
  let warped: Raw = {
    data:
      areas.length === 1
        ? warpInto(quad)
        : nearestOf(areas.map(warpInto), areas.map((q) => quadCentre(toPx(q))), WW, WH, maskBuf ? await pieceOwners(maskBuf, ids.mask, WW, WH, areas.map((q) => quadCentre(toPx(q)))) : undefined),
    width: WW,
    height: WH,
    channels: 4,
  };
  // Clip to the silhouette — NOT best-effort, like the flat path: a template authored with a mask
  // must never render the art past the product's edge.
  if (maskBuf) warped = await clipTo(warped, await maskClip(maskBuf, ids.mask, WW, WH));
  const fx = MATERIAL_FX[materialClass ?? 'PAPER'] ?? MATERIAL_FX.PAPER!;
  let composited: Raw;
  if (fx.blend === 'multiply') {
    // Fabric: flatten over white (multiply's identity — off-print stays the bare photo) and multiply
    // in linear light, so the knit / weave and folds read through the art, exactly like renderFlat.
    const flat = await toRaw(fromRaw(warped).flatten({ background: '#ffffff' }));
    composited = await toRaw(
      fromRaw(workingBlank)
        .pipelineColourspace('scrgb')
        .composite([overlayOf(flat, { left: 0, top: 0, blend: 'multiply' })])
        .toColourspace('srgb'),
    );
  } else {
    composited = await toRaw(fromRaw(workingBlank).composite([overlayOf(warped, { left: 0, top: 0, blend: 'over' })]));
  }
  if (overlayBuf) {
    try {
      const ov = await overlayAt(overlayBuf, ids.overlay, WW, WH);
      composited = await toRaw(fromRaw(composited).composite([overlayOf(ov, { left: 0, top: 0, blend: 'over' })]));
    } catch {
      // keep `composited` — an overlay is enhancement, never a reason to fail a mockup
    }
  }

  return encodeOutput(composited, outputEdge);
}

/** A quad's centre (the mean of its corners). */
/**
 * Which print area owns each pixel of the product's printable surface: the printmap's separate
 * pieces (each sock of a pair) are found as connected shapes, and each piece goes to the area whose
 * centre is nearest the piece's own centre. Off the printmap → -1. Without this, "nearest area
 * centre" per pixel let a diagonal pair's areas steal each other's edges (the left sock's toe showed
 * the right sock's mapping — founder, 23 Oct: "chopped up"). Cached per template + size.
 */
const ownerCache = new Map<string, Int8Array>();
export async function pieceOwners(maskBuf: Buffer, id: string | undefined, W: number, H: number, centres: [number, number][]): Promise<Int8Array> {
  const key = id ? `${id}|${W}x${H}|${centres.map((c) => c.map((n) => Math.round(n)).join(',')).join(';')}` : null;
  const hit = key ? ownerCache.get(key) : undefined;
  if (hit) return hit;
  const { data } = await sharp(maskBuf, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).resize(W, H, { fit: 'fill' }).toColourspace('b-w').raw().toBuffer({ resolveWithObject: true });
  const label = new Int32Array(W * H).fill(-1);
  const pieces: { sx: number; sy: number; n: number }[] = [];
  const stack = new Int32Array(W * H);
  for (let p = 0; p < W * H; p++) {
    if (label[p] !== -1 || data[p]! < 128) continue;
    const id2 = pieces.length;
    let top = 0, sx = 0, sy = 0, n = 0;
    stack[top++] = p;
    label[p] = id2;
    while (top) {
      const q = stack[--top]!;
      const x = q % W, y = (q - x) / W;
      sx += x; sy += y; n++;
      if (x > 0 && label[q - 1] === -1 && data[q - 1]! >= 128) { label[q - 1] = id2; stack[top++] = q - 1; }
      if (x < W - 1 && label[q + 1] === -1 && data[q + 1]! >= 128) { label[q + 1] = id2; stack[top++] = q + 1; }
      if (y > 0 && label[q - W] === -1 && data[q - W]! >= 128) { label[q - W] = id2; stack[top++] = q - W; }
      if (y < H - 1 && label[q + W] === -1 && data[q + W]! >= 128) { label[q + W] = id2; stack[top++] = q + W; }
    }
    pieces.push({ sx, sy, n });
  }
  const areaOf = pieces.map(({ sx, sy, n }) => {
    const cx = sx / n, cy = sy / n;
    let best = 0, bestD = Infinity;
    centres.forEach(([x, y], k) => {
      const d = (cx - x) ** 2 + (cy - y) ** 2;
      if (d < bestD) { bestD = d; best = k; }
    });
    return best;
  });
  const owner = new Int8Array(W * H).fill(-1);
  for (let p = 0; p < W * H; p++) if (label[p]! >= 0) owner[p] = areaOf[label[p]!]!;
  if (key) {
    if (ownerCache.size > 24) ownerCache.delete(ownerCache.keys().next().value!);
    ownerCache.set(key, owner);
  }
  return owner;
}

function quadCentre(q: [number, number][]): [number, number] {
  return [q.reduce((n, p) => n + p[0], 0) / q.length, q.reduce((n, p) => n + p[1], 0) / q.length];
}

/**
 * Several warped layers (RGBA, W×H) → one: each pixel from the layer of the PIECE it lies on (when
 * `owner` says — see pieceOwners), else from the covering layer whose area centre is nearest — so
 * two neighbouring print areas (a pair of socks) never draw over each other. Exported for its test.
 */
export function nearestOf(layers: (Uint8Array | Buffer)[], centres: [number, number][], W: number, H: number, owner?: Int8Array): Buffer {
  const out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let best = -1, bestD = Infinity;
      // a pixel ON one of the product's pieces belongs to that piece's area (the sock it's on)
      const own = owner ? owner[y * W + x]! : -1;
      if (own >= 0 && layers[own]![i + 3]) best = own;
      else for (let k = 0; k < layers.length; k++) {
        if (!layers[k]![i + 3]) continue;
        const dx = x + 0.5 - centres[k]![0], dy = y + 0.5 - centres[k]![1];
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = k; }
      }
      if (best >= 0) {
        const L = layers[best]!;
        out[i] = L[i]!; out[i + 1] = L[i + 1]!; out[i + 2] = L[i + 2]!; out[i + 3] = L[i + 3]!;
      }
    }
  }
  return out;
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
  designBuf: Design;
  ids: LayerIds;
  transform: Transform;
  workEdge: number;
  outputEdge: number;
  print: { widthPx: number; heightPx: number; bleedMm: number; requiredDpi: number };
  mode: 'front' | 'back' | 'centre';
  ellipseCx: number;
  /** a base colour under the drawing, all round the printed wrap (#rrggbb) */
  groundHex?: string;
}): Promise<{ buffer: Buffer; width: number; height: number }> {
  const { blankBuf, printmapBuf, designBuf, ids, transform, workEdge, outputEdge, print, mode, ellipseCx } = args;
  const wrapBg = args.groundHex ?? '#ffffff';
  const back = mode === 'back';

  // Working photo (cap the longest edge; the quad is normalised so it scales with it). The BACK
  // view is the same mug flopped — handle to the left — and we wrap the reverse arc onto it.
  const { img: workingBlank, WW, WH } = await workingBlankOf(blankBuf, workEdge, ids.blank, back);

  // Prepare the design as the FULL printed wrap on a print-aspect canvas (cover-fit + transform,
  // zero bleed — this view is never printed), exactly as the print file lays the wrap out.
  const src = await designSize(designBuf);
  if (!src.width || !src.height) throw new NoMockupTemplateError('unreadable design image');
  const dw = Math.max(2, print.widthPx);
  const dh = Math.max(2, print.heightPx);
  const layer = computeLayerRect({ printWidthPx: dw, printHeightPx: dh, bleedMm: 0, requiredDpi: print.requiredDpi }, src, transform);
  if (layer.width * layer.height > MAX_DRAWN_PIXELS) throw new NoMockupTemplateError(`design aspect too extreme to composite (${layer.width}×${layer.height})`);
  const ix = Math.max(0, -layer.x);
  const iy = Math.max(0, -layer.y);
  const ox = Math.max(0, layer.x);
  const oy = Math.max(0, layer.y);
  const iw = Math.max(1, Math.min(layer.width - ix, dw - ox));
  const ih = Math.max(1, Math.min(layer.height - iy, dh - oy));
  const part = await placedPart(designBuf, transform, layer, { left: ix, top: iy, width: iw, height: ih });
  // Opaque WHITE wrap canvas (not transparent): multiply reads white as "no ink", so the unprinted
  // margins are an identity op over the ceramic instead of a premultiplied-black edge line.
  const wrap = await toRaw(
    sharp({ create: { width: dw, height: dh, channels: 4, background: wrapBg } })
      .composite([overlayOf(part, { left: ox, top: oy })])
      .flatten({ background: wrapBg })
      .ensureAlpha(),
  );

  // The PRINTMAP alpha at working res (flopped for the BACK view so it still covers the face) — a
  // single channel where opaque = the visible printable surface. Its shape drives the whole wrap.
  const printAlpha = await templateRaw(ids.mask, `printmap@${WW}x${WH}${back ? '-flop' : ''}`, () => {
    const pm = sharp(printmapBuf, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).resize(WW, WH, { fit: 'fill' });
    return toRaw((back ? pm.flop() : pm).ensureAlpha().extractChannel(3));
  });

  const warped = cylinderWarp({
    design: wrap.data, srcW: dw, srcH: dh, printAlpha: printAlpha.data, pmW: WW, pmH: WH,
    // The photo + printmap are flopped for the BACK, so the ellipse centre mirrors with them.
    ellipseCx: back ? 1 - ellipseCx : ellipseCx, ellipseA: MUG_ELLIPSE_A,
    printedArcDeg: MUG_PRINTED_ARC_DEG, mode,
  });
  // Flatten the warped RGBA over white so alpha-0 (off-surface) is white → multiply identity → bare mug.
  const flat = await toRaw(sharp(warped, { raw: { width: WW, height: WH, channels: 4 } }).flatten({ background: '#ffffff' }));

  const composited = await toRaw(
    fromRaw(workingBlank)
      .pipelineColourspace('scrgb')
      .composite([overlayOf(flat, { left: 0, top: 0, blend: 'multiply' })])
      .toColourspace('srgb'),
  );

  return encodeOutput(composited, outputEdge);
}
