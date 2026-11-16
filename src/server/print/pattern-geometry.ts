/**
 * Pure maths for the 'pattern' magic edit (the seamless repeat) — no I/O, client-safe, so the
 * customize badge, the positioner, the order-time gate and the renderer share ONE answer.
 * The pixels are drawn by src/server/print/pattern.ts.
 */
import { isPatternProduct } from '@/lib/patterns';
import { frameGridForPx, isMultiPhotoFrameKey, slotBleedMm, slotPx, type FrameGrid } from '@/lib/multi-photo-frame';
import { heightChartArtGeom, isHeightChart } from './height-chart-geometry';
import { sockSideFor, type SockSide } from './sockTemplates';
import { GALLERY_FIT, type ResolutionAssessment, type TemplateGeom, type Transform, artWindowOf, assessResolution, canvasSizePx, galleryArtGeom, isGalleryProduct, mmToPx } from './geometry';

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
  /** SOCKS ONLY: every motif's centre, placed one by one along the sock's lanes (sockLayout) instead of
   * the repeating lattice — px at this layout's canvas size — and its turn (degrees clockwise, on top of
   * the transform's rotation) to follow the sock. */
  centres?: { x: number; y: number; angle: number }[];
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** The most of its cell a motif may fill when the spacing is tight — a gap always shows. */
const MAX_FILL = 0.9;
/** A narrow print's default motif, as a share of its column's width (see patternLayout). */
const NARROW_MOTIF_OF_CELL = 0.51;
/** Prints narrower than this wrap round (both socks: 300 mm round — the tube sock is designed upright,
 * 300 × 520 mm, since Prodigi's 16 Nov spec) and get one whole column per side; the flat sheets — tea
 * towel (695 mm), wrapping paper (700 mm) — keep the plain repeat. */
const NARROW_MAX_MM = 600;

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
  // a sock: its drawings line up along the sock itself, on Prodigi's template (sockLayout)
  const sock = sockSideFor(canvas, dpi);
  if (sock) return sockLayout(canvas, dpi, { width: sw, height: sh }, transform, sock);
  // A NARROW print (a sock: ankle and tube both ~300 mm round) shows ONE column per side at its default: two
  // columns round, each motif about half its column wide and centred on the side you see — so each
  // sock shows whole motifs with white either side, never slices of the next column at its edges
  // (founder, 23 Oct: "chopped up"; four-round always left slivers). That IS its 1.0× — the zoom
  // multiplies it and the shift starts from centred — so nudging either never jumps the pattern.
  // "The side you see" is a HALF of the file: Prodigi's sock templates put one side of the sock in the
  // left half and the other in the right, the file's middle line down the front of the foot and its outer
  // edges meeting at the back (src/server/print/sockTemplates.ts) — so column i sits at (i + ½)·cellW, the
  // middle of a side, never on the middle line (where it would be split round the front — 16 Nov 2026).
  const widthMm = (canvas.width / dpi) * 25.4;
  const narrow = widthMm < NARROW_MAX_MM;
  // one column = the side you see: half of the print round the sock
  const narrowCols = 2;
  const baseMm = narrow ? clamp((widthMm / narrowCols) * NARROW_MOTIF_OF_CELL, MOTIF_MM_MIN, MOTIF_MM_MAX) : PATTERN_MOTIF_MM;
  // narrow prints space columns by the motif's share of its column, so 1.0× lands on narrowCols
  const colFill = narrow ? NARROW_MOTIF_OF_CELL : PATTERN_FILL;
  const motifMm = clamp(baseMm * (transform.scale === 0 ? 1 : transform.scale), MOTIF_MM_MIN, MOTIF_MM_MAX);
  // the motif's box at this zoom: motifMm wide, as tall as the drawing's shape (capped for very
  // tall / very wide drawings, so they stay a sensible size)
  const boxW = mmToPx(motifMm, dpi);
  const boxH = boxW * clamp(sh / sw, 0.6, 1.6);
  const k = Math.min(boxW / sw, boxH / sh);
  const cols = Math.max(2, 2 * Math.round(canvas.width / (boxW / colFill) / 2)); // EVEN → the half-drop wraps
  const cellW = canvas.width / cols;
  const kW = Math.min(k, (cellW * MAX_FILL) / sw); // a narrow print caps the motif to its column
  const rows = Math.max(1, Math.round(canvas.height / ((sh * kW) / PATTERN_FILL)));
  const stripH = Math.max(1, Math.round(canvas.height / rows));
  const fit = Math.min(kW, (stripH * MAX_FILL) / sh);
  return {
    cols, rows, cellW, stripH,
    motifW: Math.max(1, Math.round(sw * fit)),
    motifH: Math.max(1, Math.round(sh * fit)),
    // (an even number of columns → each half of a narrow print, one side of the sock, holds whole columns, mid-side)
    phaseX: Math.round((transform.offsetX * cellW) / 2),
    phaseY: Math.round((transform.offsetY * stripH) / 2),
  };
}

/**
 * The SAME repeat at a smaller size — for previews (the mockup compositor, the positioner). The
 * layout is decided ONCE at print size (columns, rows, motif size), then every length is scaled,
 * so a preview can never round to a different number of columns than the print file has.
 */
/** The smallest a sock's drawing gets when zoomed out (mm across). */
const SOCK_MOTIF_MM_MIN = 15;
/** A sock's default drawing: this share of the lane's typical width at most (a clear edge either side)… */
const SOCK_MOTIF_OF_LANE = 0.86;
/** …and a touch under the biggest that still fits two along the sock, so they have room to breathe. */
const SOCK_DEFAULT_OF_MAX = 0.92;
/** Space between drawings: along the sock, this share of a drawing's height; across (two lines), of its width. */
const SOCK_GAP_ALONG = 0.25;
const SOCK_GAP_ACROSS = 0.22;

/**
 * THE SOCK REPEAT (founder, 16 Nov 2026), on Prodigi's own template (sockTemplates.ts): the file is one
 * sock's two sides, so the drawings line up ALONG each side — toe to cuff, parallel to the floor when you
 * walk — each centred on the sock's own middle at its height, and the right side is the left's mirror
 * image in PLACE (the drawing itself never mirrored: it always reads the right way round). Every drawing
 * sits wholly inside the sock's safe lane — clear of the outline, the heel and the toe patch — so nothing
 * runs over an edge or a seam. At its default zoom: one line of drawings up each side, as big as the lane
 * comfortably takes. Zoom out: smaller drawings, more of them — and, once two fit side by side, two lines.
 * Each drawing is turned a little to follow the sock's own line (the ankle sock's foot slants), mirrored on
 * the other side. Zoom in: never past the size that still fits. A drag doesn't move it (always centred).
 */
/** The biggest drawing that fits two along a sock, per sock + drawing shape (it's searched for, once). */
const sockMaxCache = new Map<string, number>();

export function sockLayout(canvas: { width: number; height: number }, dpi: number, src: { width: number; height: number }, transform: Transform, sock: SockSide): PatternLayout {
  const W = canvas.width, H = canvas.height, HW = W / 2;
  const N = sock.lane.length, rowH = H / N;
  const ar = src.height / src.width;
  const rowsOf = (y0: number, y1: number) => [Math.max(0, Math.floor(y0 / rowH)), Math.min(N - 1, Math.ceil(y1 / rowH) - 1)] as const;
  /** The sock's own line at a height: the slope (px across per px down) of its outline's middle there. */
  const slopeAt = (y0: number, y1: number) => {
    const [r0, r1] = rowsOf(y0, y1);
    let n = 0, sy = 0, sx = 0, syy = 0, syx = 0;
    for (let r = r0; r <= r1; r++) {
      const o = sock.outline[r];
      if (!o) continue;
      const y = (r + 0.5) * rowH, x = ((o[0] + o[1]) / 2) * HW;
      n++; sy += y; sx += x; syy += y * y; syx += y * x;
    }
    const den = n * syy - sy * sy;
    return n < 3 || den === 0 ? 0 : clamp((n * syx - sy * sx) / den, -0.45, 0.45);
  };
  /**
   * A `gw` × `h` box (a drawing, or a line of them side by side) centred at height y, turned by `rad`
   * (clockwise) to follow the sock: the horizontal shift that centres it in the safe lane — every row it
   * touches — or null where it doesn't fit.
   */
  const fitAt = (y: number, gw: number, h: number, rad: number): number | null => {
    const cs = Math.cos(rad), sn = Math.sin(rad);
    const corners = [[-gw / 2, -h / 2], [gw / 2, -h / 2], [gw / 2, h / 2], [-gw / 2, h / 2]].map(([x, yy]) => [x! * cs - yy! * sn, x! * sn + yy! * cs] as const);
    const top = y + Math.min(...corners.map((c) => c[1])), bottom = y + Math.max(...corners.map((c) => c[1]));
    if (top < 0 || bottom > H) return null;
    // the box's own left/right at height Y (relative to its centre's x)
    const across = (Y: number): [number, number] => {
      const yy = Y - y;
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < 4; i++) {
        const a = corners[i]!, b = corners[(i + 1) % 4]!;
        if ((yy < Math.min(a[1], b[1])) || (yy > Math.max(a[1], b[1]))) continue;
        const x = a[1] === b[1] ? Math.min(a[0], b[0]) : a[0] + ((yy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
        const x2 = a[1] === b[1] ? Math.max(a[0], b[0]) : x;
        lo = Math.min(lo, x); hi = Math.max(hi, x2);
      }
      return [lo, hi];
    };
    const [r0, r1] = rowsOf(top, bottom);
    const centre = slopeCentre(y);
    let sLo = -Infinity, sHi = Infinity;
    for (let r = r0; r <= r1; r++) {
      const lane = sock.lane[r];
      if (!lane) return null;
      for (const Y of [Math.max(top, r * rowH), Math.min(bottom, (r + 1) * rowH)]) {
        const [lo, hi] = across(Y);
        if (!Number.isFinite(lo)) continue;
        sLo = Math.max(sLo, lane[0] * HW - (centre + lo));
        sHi = Math.min(sHi, lane[1] * HW - (centre + hi));
      }
    }
    return sHi >= sLo ? centre + (sLo + sHi) / 2 : null;
  };
  /** The middle of the safe lane at a height (where a box starts before it's centred). */
  function slopeCentre(y: number) {
    const r = clamp(Math.floor(y / rowH), 0, N - 1);
    const lane = sock.lane[r];
    return lane ? ((lane[0] + lane[1]) / 2) * HW : HW / 2;
  }
  /** Where `w`-wide drawings go along the lane: `lines` side by side, each line turned to the sock. */
  const place = (w: number) => {
    const h = w * ar, gapX = w * SOCK_GAP_ACROSS, pitch = h * (1 + SOCK_GAP_ALONG);
    const step = Math.max(1, rowH / 2);
    type Spot = { y: number; x: number; rad: number };
    const fits = (K: number) => {
      const out: Spot[] = [];
      for (let y = h / 2; y <= H - h / 2; y += step) {
        const rad = -Math.atan(slopeAt(y - h / 2, y + h / 2));
        const x = fitAt(y, K * w + (K - 1) * gapX, h, rad);
        if (x !== null) out.push({ y, x, rad });
      }
      return out;
    };
    // as many as the lane takes, a pitch apart: packed from the top and from the bottom (the same count
    // either way), then each drawing set midway between its two — the group centred along the sock
    const pack = (f: Spot[]): Spot[] => {
      const down: Spot[] = [], up: Spot[] = [];
      for (const q of f) if (!down.length || q.y - down[down.length - 1]!.y >= pitch - 0.5) down.push(q);
      for (let k = f.length - 1; k >= 0; k--) { const q = f[k]!; if (!up.length || up[up.length - 1]!.y - q.y >= pitch - 0.5) up.push(q); }
      up.reverse();
      if (up.length !== down.length) return down;
      const mid = down.map((d, k) => {
        const want = (d.y + up[k]!.y) / 2;
        return f.reduce((best, q) => (Math.abs(q.y - want) < Math.abs(best.y - want) ? q : best));
      });
      return mid.every((q, k) => k === 0 || q.y - mid[k - 1]!.y >= pitch - 0.5) ? mid : down;
    };
    // the number of lines side by side: whichever gives the most drawings (two lines need three or more
    // along the sock) — so zooming out never shows fewer
    let lines = 1;
    let spots = pack(fits(1));
    for (let K = 2; K <= 3; K++) {
      const sp = pack(fits(K));
      if (sp.length >= 3 && sp.length * K >= spots.length * lines) { lines = K; spots = sp; }
    }
    const rows: { rad: number; at: { x: number; y: number }[] }[] = [];
    for (const p of spots) {
      // the line's drawings side by side along the turned box
      const d = w + gapX, cs = Math.cos(p.rad), sn = Math.sin(p.rad);
      rows.push({ rad: p.rad, at: Array.from({ length: lines }, (_, i) => { const o = (i - (lines - 1) / 2) * d; return { x: p.x + o * cs, y: p.y + o * sn }; }) });
    }
    return { h, pitch, lines, rows };
  };
  // the biggest that still fits two along the sock — zooming in stops there; the default is a touch under it
  // (the ankle sock's clear stretch is the foot between the heel's tip and the toe: ~12 cm)
  const widths = sock.lane.filter((x): x is readonly [number, number] => !!x).map((x) => (x[1] - x[0]) * HW).sort((a, b) => a - b);
  const typical = widths[Math.floor(widths.length / 2)] ?? HW / 2;
  const minW = mmToPx(SOCK_MOTIF_MM_MIN, dpi);
  const key = `${sock.halfMm.h}|${W}x${H}|${dpi}|${ar.toFixed(4)}`;
  let wMax = sockMaxCache.get(key);
  if (wMax === undefined) {
    let lo = minW, hi = widths[widths.length - 1] ?? HW;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (place(mid).rows.length >= 2) lo = mid;
      else hi = mid;
    }
    wMax = lo;
    if (sockMaxCache.size > 64) sockMaxCache.delete(sockMaxCache.keys().next().value!);
    sockMaxCache.set(key, wMax);
  }
  const wDefault = Math.min(typical * SOCK_MOTIF_OF_LANE, wMax * SOCK_DEFAULT_OF_MAX);
  const w = clamp(wDefault * (transform.scale === 0 ? 1 : transform.scale), Math.min(minW, wMax), wMax);
  const p = place(w);
  const centres: { x: number; y: number; angle: number }[] = [];
  for (const r of p.rows) {
    const deg = (r.rad * 180) / Math.PI;
    // the right side is the left's mirror image in place; each drawing still reads the right way round
    for (const a of r.at) centres.push({ x: a.x, y: a.y, angle: deg }, { x: W - a.x, y: a.y, angle: -deg });
  }
  return {
    cols: 2 * p.lines,
    rows: p.rows.length,
    cellW: W / (2 * p.lines),
    stripH: Math.max(1, Math.round(p.pitch)),
    motifW: Math.max(1, Math.round(w)),
    motifH: Math.max(1, Math.round(p.h)),
    phaseX: 0,
    phaseY: 0,
    centres,
  };
}

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
      ...(layout.centres ? { centres: layout.centres.map((c) => ({ ...c, x: c.x * k, y: c.y * k })) } : {}),
    },
  };
}

/**
 * Every motif's centre (px) that lands on the canvas — the half-drop lattice: column i at
 * (i + ½)·cellW + phaseX, row j at (j + ½)·stripH + phaseY, odd columns dropped half a strip.
 * Exactly the pixels pattern.ts tiles (its strip repeats every stripH; its width wraps every
 * cols·cellW), as a list a browser can draw.
 */
export function patternMotifCentres(layout: PatternLayout, canvas: { width: number; height: number }): { x: number; y: number; angle?: number }[] {
  if (layout.centres) return layout.centres; // a sock: placed one by one (sockLayout)
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
/**
 * ONE square of a multi photo frame as a print of its own: the 60 mm window (+ its bleed under a
 * mount) at the frame file's dpi. The tile renderer, the order-time gate and the builder's badges all
 * judge and place a square's drawing on this, so they can never disagree.
 */
export function frameSlotGeom(g: FrameGrid, frame: Pick<TemplateGeom, 'requiredDpi' | 'gateDpi'>): TemplateGeom {
  return { printWidthPx: slotPx(g), printHeightPx: slotPx(g), bleedMm: slotBleedMm(g), requiredDpi: frame.requiredDpi, ...(frame.gateDpi ? { gateDpi: frame.gateDpi } : {}) };
}

export function assessPrintResolution(t: TemplateGeom, src: { width: number; height: number }, transform: Transform, productKey?: string | null): ResolutionAssessment {
  // a multi photo frame: each drawing prints in its own 60 mm square — judged on that square
  if (isMultiPhotoFrameKey(productKey)) {
    const g = frameGridForPx(t.printWidthPx, t.printHeightPx);
    if (g) return assessResolution(frameSlotGeom(g, t), src, transform);
  }
  // A height chart prints the drawing in the ART AREA beside its ruler — judged on that area.
  if (isHeightChart(productKey)) return assessResolution(heightChartArtGeom(t), src, transform);
  // the calendar: the whole drawing inside the page's margin, whatever placement was sent
  if (isGalleryProduct(productKey)) return assessResolution(galleryArtGeom(t), src, GALLERY_FIT);
  // the christmas sack: the drawing prints inside Prodigi's 28×32 cm box — judged on that box
  const win = artWindowOf(productKey, t);
  if (win) return assessResolution(win.geom, src, transform);
  if (!isPatternProduct(productKey)) return assessResolution(t, src, transform);
  const layout = patternLayout(canvasSizePx(t), t.requiredDpi, src, transform);
  return assessResolution(
    { printWidthPx: layout.motifW, printHeightPx: layout.motifH, bleedMm: 0, requiredDpi: t.requiredDpi, gateDpi: t.gateDpi },
    src,
    { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: transform.rotationDeg },
  );
}
