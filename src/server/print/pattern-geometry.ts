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

/** The motif's default printed size on a flat sheet (tea towel, wrapping paper). */
export const PATTERN_MOTIF_MM = 90;
/**
 * The space between neighbouring drawings on a flat sheet, in mm — FIXED, whatever the zoom (founder,
 * 19 Nov 2026: "it's only each instance of the print which should increase in size but the gap between
 * them should remain fairly steady"). Zooming changes the drawing; the gap stays put.
 */
export const PATTERN_GAP_MM = 30;
const MOTIF_MM_MIN = 30;
const MOTIF_MM_MAX = 300;

export interface PatternLayout {
  cols: number;
  rows: number;
  /** One cell (a drawing + its gap) across, and one strip (a drawing + its gap) down, in px. */
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

/**
 * Where every motif goes on a FLAT SHEET (tea towel, wrapping paper — a sock has its own, sockLayout).
 *  - The ZOOM sets the drawing's size directly (scale 0 = PATTERN_MOTIF_MM wide; a very tall or very wide
 *    drawing is capped so it stays a sensible size), so every zoom step changes the print.
 *  - The GAP between neighbouring drawings is fixed (PATTERN_GAP_MM), across and down, at every zoom —
 *    zooming only changes the drawings (founder, 19 Nov 2026). So one cell = one drawing + one gap, exactly,
 *    and the sheet holds as many as fit: smaller drawing → more of them, the spacing unchanged.
 *  - A half-drop repeat (every other column drops half a cell, the classic hand-designed repeat), CENTRED on
 *    the sheet: one whole drawing sits dead in the middle and the repeat runs out from it, so the sheet's
 *    two sides match, each edge cutting the repeat the same way (as printed repeat fabric does).
 * The transform maps onto the repeat: scale → drawing size · offset → shifts the pattern (±1 = ±½ cell) ·
 * rotation → turns each drawing.
 */
export function patternLayout(canvas: { width: number; height: number }, dpi: number, src: { width: number; height: number }, transform: Transform): PatternLayout {
  const rotated = transform.rotationDeg % 180 !== 0;
  const sw = rotated ? src.height : src.width;
  const sh = rotated ? src.width : src.height;
  // a sock: its drawings line up along the sock itself, on Prodigi's template (sockLayout)
  const sock = sockSideFor(canvas, dpi);
  if (sock) return sockLayout(canvas, dpi, { width: sw, height: sh }, transform, sock);
  const motifMm = clamp(PATTERN_MOTIF_MM * (transform.scale === 0 ? 1 : transform.scale), MOTIF_MM_MIN, MOTIF_MM_MAX);
  // the drawing's box at this zoom: motifMm wide, as tall as the drawing's shape (capped for very tall /
  // very wide drawings); the drawing is contained in it, never stretched
  const boxW = mmToPx(motifMm, dpi);
  const boxH = boxW * clamp(sh / sw, 0.6, 1.6);
  const fit = Math.min(boxW / sw, boxH / sh);
  const motifW = Math.max(1, Math.round(sw * fit));
  const motifH = Math.max(1, Math.round(sh * fit));
  const gap = Math.round(mmToPx(PATTERN_GAP_MM, dpi));
  // whole pixels, so every copy lands on the same pixel grid and the strip tiles exactly
  const cellW = motifW + gap;
  const stripH = motifH + gap;
  // centred: column 0 (not dropped) sits on the sheet's middle, with a drawing on its middle line —
  // then the shift. The phase is kept within one period of the repeat (two columns across, one strip
  // down), which draws the same picture.
  const phaseX = mod(Math.round(canvas.width / 2 - cellW / 2 + (transform.offsetX * cellW) / 2), 2 * cellW);
  const phaseY = mod(Math.round(canvas.height / 2 - stripH / 2 + (transform.offsetY * stripH) / 2), stripH);
  return {
    // how many columns / rows the sheet spans
    cols: Math.max(1, Math.ceil(canvas.width / cellW)),
    rows: Math.max(1, Math.ceil(canvas.height / stripH)),
    cellW, stripH, motifW, motifH, phaseX, phaseY,
  };
}

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** The smallest a sock's drawing gets when zoomed out (mm across). */
const SOCK_MOTIF_MM_MIN = 15;
/**
 * The space between a sock's drawings, in mm — along the sock and across (two lines side by side) — FIXED,
 * whatever the zoom: zooming changes the drawings, never the gap (founder, 19 Nov 2026).
 */
export const SOCK_GAP_MM = 10;
/** A sock's default drawing is never wider than this share of the lane's typical width (a clear edge either
 * side) — on the long tube sock, where two along is never the limit, this is what sets it. */
const SOCK_MOTIF_OF_LANE = 0.86;
/** Zooming in past the biggest pair to ONE drawing a side is offered only when that one is at least this
 * much bigger. */
const SOCK_ONE_GAIN = 1.04;
const SOCK_CEILING = 0.98;

/**
 * THE SOCK REPEAT (founder, 16 Nov 2026), on Prodigi's own template (sockTemplates.ts): the file is one
 * sock's two sides, so the drawings line up ALONG each side — toe to cuff, parallel to the floor when you
 * walk — each centred on the sock's own middle at its height, and the right side is the left's mirror
 * image in PLACE (the drawing itself never mirrored: it always reads the right way round). Every drawing
 * sits wholly inside the sock's safe lane — clear of the outline, the heel and the toe patch — so nothing
 * runs over an edge or a seam. At its default zoom: one line up each side of the BIGGEST drawings that still
 * fit two along it (founder, 19 Nov 2026: the old default — a touch smaller, with a gap that grew with
 * it — read as "two tiny little repeat prints"). Zoom in: bigger still, down to ONE drawing a side, as big
 * as the sock's clear lane takes, and never past it. Zoom out: smaller drawings, more of them — and, once
 * two fit side by side, two lines. The gap between drawings is the same at every zoom (SOCK_GAP_MM).
 * Each drawing is turned a little to follow the sock's own line (the ankle sock's foot slants), mirrored on
 * the other side. A drag doesn't move it (always centred).
 */
/** The biggest a sock's drawing may zoom to, and the biggest that fits two along it, per sock + drawing shape (searched for, once). */
const sockMaxCache = new Map<string, { max: number; two: number }>();

export function sockLayout(canvas: { width: number; height: number }, dpi: number, src: { width: number; height: number }, transform: Transform, sock: SockSide): PatternLayout {
  const W = canvas.width, H = canvas.height, HW = W / 2;
  const N = sock.lane.length, rowH = H / N;
  const ar = src.height / src.width;
  const gap = mmToPx(SOCK_GAP_MM, dpi);
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
    const h = w * ar, gapX = gap, pitch = h + gap;
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
  // the default: the biggest that still fits two along the sock (the ankle sock's clear stretch is the
  // foot between the heel's tip and the toe: ~12 cm). Zooming in carries on to the biggest ONE that fits.
  const widths = sock.lane.filter((x): x is readonly [number, number] => !!x).map((x) => (x[1] - x[0]) * HW).sort((a, b) => a - b);
  const typical = widths[Math.floor(widths.length / 2)] ?? HW / 2;
  const minW = mmToPx(SOCK_MOTIF_MM_MIN, dpi);
  const key = `${sock.halfMm.h}|${W}x${H}|${dpi}|${ar.toFixed(4)}`;
  let fit = sockMaxCache.get(key);
  if (fit === undefined) {
    const biggest = (n: number) => {
      let lo = minW, hi = widths[widths.length - 1] ?? HW;
      for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2;
        if (place(mid).rows.length >= n) lo = mid;
        else hi = mid;
      }
      return lo;
    };
    const two = biggest(2);
    const one = biggest(1);
    // where the lane's WIDTH is the limit (the tube sock), the biggest single drawing is barely bigger than
    // the biggest pair — it only fits at the lane's widest point — so zooming in stops at the pair instead
    // of collapsing to one drawing for no visible gain. And it stops a touch short of the very edge, where
    // a drawing only just squeezes in at one or two spots and the count would drop for nothing.
    fit = { max: (one > two * SOCK_ONE_GAIN ? one : two) * SOCK_CEILING, two };
    if (sockMaxCache.size > 64) sockMaxCache.delete(sockMaxCache.keys().next().value!);
    sockMaxCache.set(key, fit);
  }
  const wDefault = Math.min(typical * SOCK_MOTIF_OF_LANE, fit.two);
  const wMax = Math.max(wDefault, fit.max);
  const w = clamp(wDefault * (transform.scale === 0 ? 1 : transform.scale), Math.min(minW, wDefault), wMax);
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
      cellW: layout.cellW * k, // the same spacing, smaller — the same drawings in the same places
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
 * Exactly the pixels pattern.ts draws (its strip repeats every stripH), as a list a browser can draw.
 * (phaseX is within two columns and phaseY within one strip — patternLayout — so the ranges below
 * reach every copy that touches the canvas.)
 */
export function patternMotifCentres(layout: PatternLayout, canvas: { width: number; height: number }): { x: number; y: number; angle?: number }[] {
  if (layout.centres) return layout.centres; // a sock: placed one by one (sockLayout)
  const { cols, cellW, stripH, motifW, motifH, phaseX, phaseY } = layout;
  const out: { x: number; y: number }[] = [];
  const jMax = Math.ceil(canvas.height / stripH) + 2;
  for (let i = -3; i <= cols + 1; i++) {
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
