/**
 * Pure maths for the 'pattern' magic edit (the seamless repeat) — no I/O, client-safe, so the
 * customize badge, the positioner, the order-time gate and the renderer share ONE answer.
 * The pixels are drawn by src/server/print/pattern.ts.
 */
import { isPatternProduct } from '@/lib/patterns';
import { heightChartArtGeom, isHeightChart } from './height-chart-geometry';
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

/** The most of its cell a motif may fill when the spacing is tight — a gap always shows. */
const MAX_FILL = 0.9;
/** A narrow print's default motif, as a share of its column's width (see patternLayout). */
const NARROW_MOTIF_OF_CELL = 0.51;

/**
 * Where every motif goes. The ZOOM sets the motif's size directly (scale 0 = PATTERN_MOTIF_MM), so
 * every zoom step changes the print: smaller drawing → more of them.
 *  - Columns: an EVEN number of whole columns across (so a half-drop repeat meets itself exactly
 *    where a sock or a roll wraps round), as close as possible to the zoom's spacing.
 *  - Rows: their own whole number, from the motif's own height — so even on a narrow print (an
 *    ankle sock, where the even columns can only step 2 → 4 → 6) the count keeps rising as you
 *    zoom out.
 *  - The motif keeps its size unless its cell is tighter, and then it never fills more than
 *    MAX_FILL of it.
 * The transform maps onto the repeat: scale → motif size · offset → shifts the pattern ·
 * rotation → turns each motif.
 */
export function patternLayout(canvas: { width: number; height: number }, dpi: number, src: { width: number; height: number }, transform: Transform): PatternLayout {
  const rotated = transform.rotationDeg % 180 !== 0;
  const sw = rotated ? src.height : src.width;
  const sh = rotated ? src.width : src.height;
  // A NARROW print at its default zoom (an ankle sock, ~300 mm round) shows ONE column per side: two
  // columns round, each motif about half its column wide and centred on the side you see — so each
  // sock shows whole motifs with white either side, never slices of the next column at its edges
  // (founder, 23 Oct: "chopped up"; four-round always left slivers). Zooming still works.
  const widthMm = (canvas.width / dpi) * 25.4;
  const narrowDefault = transform.scale === 0 && widthMm < 3 * (PATTERN_MOTIF_MM / PATTERN_FILL);
  const motifMm = narrowDefault
    ? clamp((widthMm / 2) * NARROW_MOTIF_OF_CELL, MOTIF_MM_MIN, PATTERN_MOTIF_MM)
    : clamp(PATTERN_MOTIF_MM * (transform.scale === 0 ? 1 : transform.scale), MOTIF_MM_MIN, MOTIF_MM_MAX);
  // the motif's box at this zoom: motifMm wide, as tall as the drawing's shape (capped for very
  // tall / very wide drawings, so they stay a sensible size)
  const boxW = mmToPx(motifMm, dpi);
  const boxH = boxW * clamp(sh / sw, 0.6, 1.6);
  const k = Math.min(boxW / sw, boxH / sh);
  const cols = Math.max(2, 2 * Math.round(canvas.width / (boxW / PATTERN_FILL) / 2)); // EVEN → the half-drop wraps
  const cellW = canvas.width / cols;
  const kW = Math.min(k, (cellW * MAX_FILL) / sw); // a narrow print caps the motif to its column
  const rows = Math.max(1, Math.round(canvas.height / ((sh * kW) / PATTERN_FILL)));
  const stripH = Math.max(1, Math.round(canvas.height / rows));
  const fit = Math.min(kW, (stripH * MAX_FILL) / sh);
  return {
    cols, rows, cellW, stripH,
    motifW: Math.max(1, Math.round(sw * fit)),
    motifH: Math.max(1, Math.round(sh * fit)),
    // (a narrow default starts half a column across, so a whole motif sits mid-face)
    phaseX: Math.round(((transform.offsetX + (narrowDefault ? 1 : 0)) * cellW) / 2),
    phaseY: Math.round((transform.offsetY * stripH) / 2),
  };
}

/**
 * The SAME repeat at a smaller size — for previews (the mockup compositor, the positioner). The
 * layout is decided ONCE at print size (columns, rows, motif size), then every length is scaled,
 * so a preview can never round to a different number of columns than the print file has.
 */
export function scalePatternLayout(layout: PatternLayout, canvas: { width: number; height: number }, scale: number): { canvas: { width: number; height: number }; layout: PatternLayout } {
  const width = Math.max(1, Math.round(canvas.width * scale));
  const height = Math.max(1, Math.round(canvas.height * scale));
  const k = width / canvas.width; // the scale actually achieved on the width
  return {
    canvas: { width, height },
    layout: {
      cols: layout.cols,
      rows: layout.rows,
      cellW: width / layout.cols, // still exactly fills the (scaled) width → still seamless
      stripH: Math.max(1, Math.round(layout.stripH * k)),
      motifW: Math.max(1, Math.round(layout.motifW * k)),
      motifH: Math.max(1, Math.round(layout.motifH * k)),
      phaseX: Math.round(layout.phaseX * k),
      phaseY: Math.round(layout.phaseY * k),
    },
  };
}

/**
 * Every motif's centre (px) that lands on the canvas — the half-drop lattice: column i at
 * (i + ½)·cellW + phaseX, row j at (j + ½)·stripH + phaseY, odd columns dropped half a strip.
 * Exactly the pixels pattern.ts tiles (its strip repeats every stripH; its width wraps every
 * cols·cellW), as a list a browser can draw.
 */
export function patternMotifCentres(layout: PatternLayout, canvas: { width: number; height: number }): { x: number; y: number }[] {
  const { cols, cellW, stripH, motifW, motifH, phaseX, phaseY } = layout;
  const out: { x: number; y: number }[] = [];
  const jMax = Math.ceil(canvas.height / stripH) + 2;
  for (let i = -2; i <= cols + 1; i++) {
    const drop = ((i % 2) + 2) % 2 === 1 ? stripH / 2 : 0;
    const x = (i + 0.5) * cellW + phaseX;
    if (x + motifW / 2 <= 0 || x - motifW / 2 >= canvas.width) continue;
    for (let j = -2; j <= jMax; j++) {
      const y = (j + 0.5) * stripH + drop + phaseY;
      if (y + motifH / 2 <= 0 || y - motifH / 2 >= canvas.height) continue;
      out.push({ x, y });
    }
  }
  return out;
}

/**
 * The DPI gate, pattern- and height-chart-aware. For a repeat-pattern product what's printed at size is ONE motif,
 * so resolution is judged on the motif — a 5 m roll needs no bigger a photo than a pair of socks.
 * Every other product: the ordinary whole-canvas assessResolution.
 */
export function assessPrintResolution(t: TemplateGeom, src: { width: number; height: number }, transform: Transform, productKey?: string | null): ResolutionAssessment {
  // A height chart prints the drawing in the ART AREA beside its ruler — judged on that area.
  if (isHeightChart(productKey)) return assessResolution(heightChartArtGeom(t), src, transform);
  if (!isPatternProduct(productKey)) return assessResolution(t, src, transform);
  const layout = patternLayout(canvasSizePx(t), t.requiredDpi, src, transform);
  return assessResolution(
    { printWidthPx: layout.motifW, printHeightPx: layout.motifH, bleedMm: 0, requiredDpi: t.requiredDpi },
    src,
    { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: transform.rotationDeg },
  );
}
