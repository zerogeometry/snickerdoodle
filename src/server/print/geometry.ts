/**
 * Pure print-geometry + DPI math (proposal/04 §4.1–4.2). No I/O — exhaustively
 * unit-testable. The server is the ONLY authority on placement and resolution;
 * the client merely *proposes* a normalised transform.
 *
 * Model: `scale: 1` is COVER-fit to the full bleed canvas (print area + bleed) — fills
 * the product, no border, Prodigi's crop is a no-op. `scale: 0` is the CONTAIN sentinel
 * ("fit the whole image"), resolved against the real canvas + source aspects inside
 * computeLayerRect, so the print renderer, the mockup compositor and the DPI gate all
 * resolve it identically (preview == print). It is the DEFAULT placement: the full
 * extents of the upload always fit on the product; zooming crops from there. Fractional
 * scales between are valid (zoomed out below cover). `offset` pans within the slack;
 * `rotationDeg` is snapped to 0/90/180/270 (the launch decision).
 */

export interface TemplateGeom {
  printWidthPx: number;
  printHeightPx: number;
  bleedMm: number;
  requiredDpi: number;
}

export type Rotation = 0 | 90 | 180 | 270;

/** What the client proposes (it owns nothing authoritative). */
export interface Transform {
  scale: number; // 0 = CONTAIN sentinel (fit whole image, the default); 1 = cover-fit; >1 zooms in
  offsetX: number; // -1..1 pan within slack
  offsetY: number; // -1..1
  rotationDeg: Rotation;
}

export const MAX_ZOOM = 4;
/** Sanity floor for an explicit numeric scale (a zoom-out below contain is legitimate —
 * a small motif with margins — but never microscopic). The UI offers contain/2 at most. */
export const MIN_SCALE = 0.1;
export const MAX_UPSCALE = 4; // the most a HAND-HELD print (mug, card, small jigsaw) may be enlarged
const TIER0_MAX = 2; // classical resample handles up to 2×; above that needs ML (tier 1)

/**
 * The least real detail (dots per inch FROM THE SOURCE) a print can have and still look good
 * where it's seen. Detail you can resolve falls with viewing distance (~1 arc-minute: ppi ≈
 * 3438 / inches away); children's art is flat colour and soft edges, so it needs far less than a
 * photo — K = 1050 matches the 75dpi floor we already trusted for hand-held things. Distance ≈
 * the print's diagonal (nobody reads a 28×40″ frame from 30cm), never under 14″ (arm's length).
 * Never stricter than the old flat 4× rule, and never below 24dpi however big the print.
 */
export const MIN_FLOOR_DPI = 24;
const ACUITY_K = 1050;
export function minimumDpi(t: TemplateGeom): number {
  const wIn = t.printWidthPx / t.requiredDpi, hIn = t.printHeightPx / t.requiredDpi;
  const viewIn = Math.max(14, Math.hypot(wIn, hIn));
  return Math.min(t.requiredDpi / MAX_UPSCALE, Math.max(MIN_FLOOR_DPI, Math.round(ACUITY_K / viewIn)));
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** The ONE mm→px conversion — used by the seeder, the renderer, and the editor
 * preview so the canvas frame, the guides, and the output file never disagree. */
export function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi);
}

function snapRotation(deg: number): Rotation {
  const n = (((Math.round((deg ?? 0) / 90) * 90) % 360) + 360) % 360;
  return n as Rotation;
}

/** A raw, untrusted transform as it may arrive from the client (any numbers). */
export type RawTransform = { scale?: number; offsetX?: number; offsetY?: number; rotationDeg?: number };

/** Clamp a client-proposed transform to the valid range — the server-authoritative step.
 * `scale ≤ 0` is preserved as the CONTAIN sentinel (0); it resolves against the real
 * canvas/source aspects wherever the geometry is actually used (computeLayerRect), so a
 * clamp WITHOUT source knowledge (e.g. at order freeze) can't corrupt it into a crop. */
export function clampTransform(input: RawTransform | null | undefined): Transform {
  const t = input ?? {};
  const s = Number.isFinite(t.scale) ? (t.scale as number) : 1;
  return {
    scale: s <= 0 ? 0 : clamp(s, MIN_SCALE, MAX_ZOOM),
    offsetX: clamp(Number.isFinite(t.offsetX) ? (t.offsetX as number) : 0, -1, 1),
    offsetY: clamp(Number.isFinite(t.offsetY) ? (t.offsetY as number) : 0, -1, 1),
    rotationDeg: snapRotation(t.rotationDeg ?? 0),
  };
}

export function bleedPx(t: TemplateGeom): number {
  return Math.round((t.bleedMm / 25.4) * t.requiredDpi);
}

export function canvasSizePx(t: TemplateGeom): { width: number; height: number; bleedPx: number } {
  const b = bleedPx(t);
  return { width: t.printWidthPx + 2 * b, height: t.printHeightPx + 2 * b, bleedPx: b };
}

export interface LayerRect {
  x: number; // top-left on the full canvas (can be negative — art overflows to cover)
  y: number;
  width: number; // drawn (scaled) source size
  height: number;
  canvasWidth: number;
  canvasHeight: number;
  rotationDeg: Rotation;
}

/**
 * The scale (in cover-relative units, ≤ 1) at which the WHOLE source fits inside the
 * canvas — the value the `scale: 0` contain sentinel resolves to. 1 when the aspects
 * already match (contain == cover).
 */
export function containScale(t: TemplateGeom, src: { width: number; height: number }, rotationDeg: Rotation = 0): number {
  const { width: CW, height: CH } = canvasSizePx(t);
  const rotated = rotationDeg % 180 !== 0;
  const sw = rotated ? src.height : src.width;
  const sh = rotated ? src.width : src.height;
  const cover = Math.max(CW / sw, CH / sh);
  const fit = Math.min(CW / sw, CH / sh);
  return fit / cover;
}

/** Where the (rotated, scaled) source is drawn on the full bleed canvas. */
export function computeLayerRect(t: TemplateGeom, src: { width: number; height: number }, transform: Transform): LayerRect {
  const { width: CW, height: CH } = canvasSizePx(t);
  const rotated = transform.rotationDeg % 180 !== 0;
  const sw = rotated ? src.height : src.width; // effective source dims after rotation
  const sh = rotated ? src.width : src.height;

  // Resolve the CONTAIN sentinel here — the one place every consumer (print renderer,
  // compositor, DPI gate, positioner preview) shares, so they can never disagree.
  const scale = transform.scale === 0 ? containScale(t, src, transform.rotationDeg) : transform.scale;

  const base = Math.max(CW / sw, CH / sh); // cover-fit the canvas
  const drawW = Math.round(sw * base * scale);
  const drawH = Math.round(sh * base * scale);

  // Pan range = how far the art can travel and still touch the canvas edges. It works in
  // BOTH regimes: OVERFLOW (art ≥ canvas → slide the crop) AND MARGIN (art < canvas, i.e.
  // zoomed out below cover → slide within the empty space). |draw − canvas| covers both;
  // offset 0 stays centred either way, so cover/contain defaults are unchanged.
  const slackX = Math.abs(drawW - CW);
  const slackY = Math.abs(drawH - CH);
  const cx = CW / 2 + (transform.offsetX * slackX) / 2;
  const cy = CH / 2 + (transform.offsetY * slackY) / 2;

  return {
    x: Math.round(cx - drawW / 2),
    y: Math.round(cy - drawH / 2),
    width: drawW,
    height: drawH,
    canvasWidth: CW,
    canvasHeight: CH,
    rotationDeg: transform.rotationDeg,
  };
}

export interface ResolutionAssessment {
  decision: 'OK' | 'UPSCALE' | 'BLOCK';
  tier: 0 | 1 | -1; // 0 = classical resample, 1 = ML super-resolution, -1 = block
  effectiveDpi: number;
  requiredDpi: number;
  upscaleFactor: number;
  /** The least the print can have where it's seen (minimumDpi) — below this it's BLOCKED. */
  minimumDpi: number;
  /** Fine where it's seen, but softer if you look closely (more than 2× enlarged). */
  softUpClose: boolean;
}

/**
 * The DPI gate. Given the source pixels and the chosen placement, what real DPI
 * does the print get, and can we reach the product's requirement?
 *  - source big enough              → OK (no upscale)
 *  - within 2×                      → UPSCALE tier 0 (classical resample)
 *  - more, but ≥ minimumDpi         → UPSCALE tier 1, softUpClose (looks right where it's seen)
 *  - below minimumDpi               → BLOCK (can't fake print quality)
 */
export function assessResolution(
  t: TemplateGeom,
  src: { width: number; height: number },
  transform: Transform,
): ResolutionAssessment {
  const rect = computeLayerRect(t, src, transform);
  const rotated = transform.rotationDeg % 180 !== 0;
  const sw = rotated ? src.height : src.width;
  const effectiveDpi = Math.round((t.requiredDpi * sw) / rect.width);
  const requiredDpi = t.requiredDpi;

  const floor = minimumDpi(t);
  if (effectiveDpi >= requiredDpi) return { decision: 'OK', tier: 0, effectiveDpi, requiredDpi, upscaleFactor: 1, minimumDpi: floor, softUpClose: false };
  const upscaleFactor = requiredDpi / effectiveDpi;
  if (upscaleFactor <= TIER0_MAX) return { decision: 'UPSCALE', tier: 0, effectiveDpi, requiredDpi, upscaleFactor, minimumDpi: floor, softUpClose: false };
  if (effectiveDpi >= floor) return { decision: 'UPSCALE', tier: 1, effectiveDpi, requiredDpi, upscaleFactor, minimumDpi: floor, softUpClose: true };
  return { decision: 'BLOCK', tier: -1, effectiveDpi, requiredDpi, upscaleFactor, minimumDpi: floor, softUpClose: true };
}

/**
 * GALLERY layout (founder, 26 Oct — the calendar): the WHOLE drawing, as the shopper made it (with our
 * edits and theirs), scaled by its longest side to fit inside a 1 cm white margin — every page the same
 * gallery look. Nothing is cropped and there's no placement to choose. One geometry for the print file,
 * the mockup, the flip-through preview and the resolution gate, so they can never disagree.
 */
export const GALLERY_MARGIN_MM = 10;
export const isGalleryProduct = (key: string | null | undefined): boolean => !!key && (key === 'calendar' || key.startsWith('calendar-'));
/** the whole drawing, fitted (the contain sentinel) */
export const GALLERY_FIT: Transform = { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 };
/** The area the drawing fits into: the page less the margin all round (no bleed — the margin is white). */
export function galleryArtGeom(t: TemplateGeom): TemplateGeom {
  const m = mmToPx(GALLERY_MARGIN_MM, t.requiredDpi);
  return { printWidthPx: Math.max(1, t.printWidthPx - 2 * m), printHeightPx: Math.max(1, t.printHeightPx - 2 * m), bleedMm: 0, requiredDpi: t.requiredDpi };
}
/** Where the whole drawing sits on the PAGE (print-area px, the trimmed page — add the bleed for the file). */
export function galleryRect(t: TemplateGeom, src: { width: number; height: number }): { x: number; y: number; width: number; height: number } {
  const m = mmToPx(GALLERY_MARGIN_MM, t.requiredDpi);
  const r = computeLayerRect(galleryArtGeom(t), src, GALLERY_FIT);
  return { x: m + r.x, y: m + r.y, width: r.width, height: r.height };
}
