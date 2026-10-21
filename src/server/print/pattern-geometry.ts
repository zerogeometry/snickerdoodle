/**
 * Pure maths for the 'pattern' magic edit (the seamless repeat) — no I/O, client-safe, so the
 * customize badge, the positioner, the order-time gate and the renderer share ONE answer.
 * The pixels are drawn by src/server/print/pattern.ts.
 */
import { isPatternProduct } from '@/lib/patterns';
import { assessResolution, canvasSizePx, mmToPx, type ResolutionAssessment, type TemplateGeom, type Transform } from './geometry';

/** The motif's default printed size, and how much of its cell it fills (the rest is breathing room). */
export const PATTERN_MOTIF_MM = 90;
export const PATTERN_FILL = 0.72;
const MOTIF_MM_MIN = 30;
const MOTIF_MM_MAX = 300;

export interface PatternLayout {
  cols: number;
  rows: number;
  /** One cell — exact (fractional) width, and the whole-pixel strip height. */
  cellW: number;
  stripH: number;
  /** The drawn motif (the source, rotated, contained in the cell's fill box), in px. */
  motifW: number;
  motifH: number;
  /** Phase shift of the whole pattern, in px. */
  phaseX: number;
  phaseY: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Where every motif goes. The canvas width is an EVEN number of whole columns (so a half-drop
 * repeat meets itself exactly when a sock or a roll wraps round) and the height whole rows.
 * The transform maps onto the repeat: scale (0 = default) → motif size · offset → shifts the
 * pattern · rotation → turns each motif.
 */
export function patternLayout(canvas: { width: number; height: number }, dpi: number, src: { width: number; height: number }, transform: Transform): PatternLayout {
  const rotated = transform.rotationDeg % 180 !== 0;
  const sw = rotated ? src.height : src.width;
  const sh = rotated ? src.width : src.height;
  const motifMm = clamp(PATTERN_MOTIF_MM * (transform.scale === 0 ? 1 : transform.scale), MOTIF_MM_MIN, MOTIF_MM_MAX);
  const targetCellW = mmToPx(motifMm, dpi) / PATTERN_FILL;
  const cols = Math.max(2, 2 * Math.round(canvas.width / targetCellW / 2)); // EVEN → the half-drop wraps
  const cellW = canvas.width / cols;
  const targetCellH = cellW * clamp(sh / sw, 0.6, 1.6); // tall drawings get taller cells
  const rows = Math.max(1, Math.round(canvas.height / targetCellH));
  const stripH = Math.max(1, Math.round(canvas.height / rows));
  const fit = Math.min((cellW * PATTERN_FILL) / sw, (stripH * PATTERN_FILL) / sh);
  return {
    cols, rows, cellW, stripH,
    motifW: Math.max(1, Math.round(sw * fit)),
    motifH: Math.max(1, Math.round(sh * fit)),
    phaseX: Math.round((transform.offsetX * cellW) / 2),
    phaseY: Math.round((transform.offsetY * stripH) / 2),
  };
}

/**
 * The DPI gate, pattern-aware. For a repeat-pattern product what's printed at size is ONE motif,
 * so resolution is judged on the motif — a 5 m roll needs no bigger a photo than a pair of socks.
 * Every other product: the ordinary whole-canvas assessResolution.
 */
export function assessPrintResolution(t: TemplateGeom, src: { width: number; height: number }, transform: Transform, productKey?: string | null): ResolutionAssessment {
  if (!isPatternProduct(productKey)) return assessResolution(t, src, transform);
  const layout = patternLayout(canvasSizePx(t), t.requiredDpi, src, transform);
  return assessResolution(
    { printWidthPx: layout.motifW, printHeightPx: layout.motifH, bleedMm: 0, requiredDpi: t.requiredDpi },
    src,
    { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: transform.rotationDeg },
  );
}
