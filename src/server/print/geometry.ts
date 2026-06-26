/**
 * Pure print-geometry + DPI math (proposal/04 §4.1–4.2). No I/O — exhaustively
 * unit-testable. The server is the ONLY authority on placement and resolution;
 * the client merely *proposes* a normalised transform.
 *
 * Model: the art is COVER-fit to the full bleed canvas (print area + bleed), so a
 * keepsake fills the product with no white border and Prodigi's own crop is a
 * no-op. `scale` zooms in; `offset` pans within the resulting slack; `rotationDeg`
 * is snapped to 0/90/180/270 (the launch decision).
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
  scale: number; // ≥ 1 zoom (1 = cover-fit)
  offsetX: number; // -1..1 pan within slack
  offsetY: number; // -1..1
  rotationDeg: Rotation;
}

export const MAX_ZOOM = 4;
export const MAX_UPSCALE = 4; // beyond this we can't reach print quality → BLOCK
const TIER0_MAX = 2; // classical resample handles up to 2×; above that needs ML (tier 1)

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

/** Clamp a client-proposed transform to the valid range — the server-authoritative step. */
export function clampTransform(input: RawTransform | null | undefined): Transform {
  const t = input ?? {};
  return {
    scale: clamp(Number.isFinite(t.scale) ? (t.scale as number) : 1, 1, MAX_ZOOM),
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

/** Where the (rotated, scaled) source is drawn on the full bleed canvas. */
export function computeLayerRect(t: TemplateGeom, src: { width: number; height: number }, transform: Transform): LayerRect {
  const { width: CW, height: CH } = canvasSizePx(t);
  const rotated = transform.rotationDeg % 180 !== 0;
  const sw = rotated ? src.height : src.width; // effective source dims after rotation
  const sh = rotated ? src.width : src.height;

  const base = Math.max(CW / sw, CH / sh); // cover-fit the canvas
  const drawW = Math.round(sw * base * transform.scale);
  const drawH = Math.round(sh * base * transform.scale);

  const slackX = Math.max(0, drawW - CW);
  const slackY = Math.max(0, drawH - CH);
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
}

/**
 * The DPI gate. Given the source pixels and the chosen placement, what real DPI
 * does the print get, and can we reach the product's requirement?
 *  - source big enough              → OK (no upscale)
 *  - within 2×                      → UPSCALE tier 0 (classical resample)
 *  - within 4×                      → UPSCALE tier 1 (CPU ML super-resolution, P2)
 *  - more than 4× short             → BLOCK (can't fake print quality)
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

  if (effectiveDpi >= requiredDpi) return { decision: 'OK', tier: 0, effectiveDpi, requiredDpi, upscaleFactor: 1 };
  const upscaleFactor = requiredDpi / effectiveDpi;
  if (upscaleFactor <= TIER0_MAX) return { decision: 'UPSCALE', tier: 0, effectiveDpi, requiredDpi, upscaleFactor };
  if (upscaleFactor <= MAX_UPSCALE) return { decision: 'UPSCALE', tier: 1, effectiveDpi, requiredDpi, upscaleFactor };
  return { decision: 'BLOCK', tier: -1, effectiveDpi, requiredDpi, upscaleFactor };
}
