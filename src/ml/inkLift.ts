import sharp from 'sharp';

/**
 * INK LIFT — background removal for children's art on paper.
 *
 * Generic "cut out the subject" models are trained on photos of objects; a drawing isn't an object
 * on a backdrop, it's INK LAID OVER PAPER. So instead of segmenting, we model the paper and lift the
 * ink off it:
 *
 *  1. PAPER MODEL — find the paper's colour family from the photo border (the dominant border
 *     colour), collect every pixel in the image that is paper-like (same chromaticity, any
 *     brightness — so shadows and bright patches count), and build a smooth PAPER FIELD: the colour
 *     the paper would be at every point, under that photo's uneven light. Cells with no visible
 *     paper (inside a big painted area) are filled by diffusing from their neighbours.
 *  2. COLOUR-TO-ALPHA against that local paper colour — per pixel, the smallest opacity of an ink
 *     that, laid over the local paper, produces the observed colour. So:
 *       · paper ENCLOSED by the drawing (inside a house, between arms) goes too — no flood needed;
 *       · a pencil/felt-tip edge becomes soft, partly-transparent ink (no paper-coloured halo);
 *       · shadowed paper is still paper (it matches its LOCAL paper colour).
 *  3. INK COLOUR — recover what the ink itself looks like with the paper taken out (un-mixing), so
 *     a crayon keeps its colour on black or navy instead of carrying the paper's tint.
 *  4. FINISH by material — below the paper's own texture noise → fully clear; above a "solid"
 *     level → fully opaque with the colour as seen on paper (so solid crayon looks like crayon);
 *     in between, a smooth soft edge. `firm` (dark-fabric garment printing, where faint
 *     semi-transparent pixels print badly) uses a lower solid level and trims the faintest edge.
 *
 * Deterministic, CPU-only, in-process: one image in, one RGBA PNG out, no metadata. Returns null
 * when there is no paper to model (e.g. a full-bleed painting where the "background" is paint) —
 * that's a judgement for the parent (tap-to-remove), not something to guess.
 */

export interface InkLiftOptions {
  /** 'soft' (prints, mugs, cushions) or 'firm' (dark-fabric garment printing). */
  edge?: 'soft' | 'firm';
  /** Keep paper that is fully ENCLOSED by the drawing (the whites of eyes, a snowman, a cloud
   * outline) as solid paper-white instead of clearing it. On white paper we can't tell "meant to
   * be white" from "paper showing through", so it's the parent's choice; default = clear it. */
  keepEnclosedPaper?: boolean;
  /** CLEAN-UP (founder, 26 Oct — "one click, ready to go"): after the lift, sweep away what a parent
   * would otherwise tap off with "remove colour · just that patch": paper-ish leftovers (a darker
   * corner, fibres, a pink halo round cotton wool) that touch the cleared background, growing only
   * through colours close to the paper and stopping at outlines; then faint paper-coloured specks.
   * Default ON. */
  cleanup?: boolean;
}

export interface InkLiftResult {
  buffer: Buffer;
  width: number;
  height: number;
  /** Fraction of the image made (mostly) transparent. */
  removedFraction: number;
  /** The paper colour the lift was measured against (median of the paper field), for diagnostics. */
  paper: { r: number; g: number; b: number };
}

const ANALYSIS_EDGE = 900; // paper-model resolution (the field is smooth, so this is plenty)
const GRID = 24; // paper-field cells along the longer side (fewer for small images — see gridFor)
const MAX_PIXELS = 40_000_000;

type RGB = [number, number, number];

/** Chromaticity + brightness of a colour: paper under shadow keeps its chromaticity, loses brightness. */
function chroma(r: number, g: number, b: number): { cr: number; cg: number; l: number } {
  const s = r + g + b + 1;
  return { cr: r / s, cg: g / s, l: s / 3 };
}

/** Why liftInk declined (null): DARK paper (light-on-dark art — a plain colour flood is safe there)
 * or NO paper at all (painted / busy background — a judgement for the parent, never automatic). */
export interface InkLiftDiagnosis {
  declined?: 'dark-paper' | 'no-paper';
}

/**
 * Lift the drawing off its paper. A photo of a sheet lying ON A TABLE has two backgrounds: the first
 * pass models the table as "paper" and lifts the sheet off it. If what's left is one big sheet whose
 * edge is mostly a single colour, that sheet is the real paper — so we lift again with the table filled
 * in as sheet colour, and both go (founder, 26 Oct: "ready to go on the first click").
 */
export async function liftInk(input: Buffer, opts: InkLiftOptions = {}, diag: InkLiftDiagnosis = {}): Promise<InkLiftResult | null> {
  if (opts.cleanup === false) return liftOnce(input, opts, diag);
  // Look for the sheet on a PLAIN first pass (the clean-up would already nibble the sheet's edge) — on a
  // reduced copy: it only has to FIND the sheet, and that keeps a 12-megapixel photo quick.
  const full = await sharp(input, { limitInputPixels: MAX_PIXELS }).rotate().flatten({ background: '#ffffff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const FW = full.info.width, FH = full.info.height;
  const DETECT_EDGE = 1400;
  const small = Math.max(FW, FH) > DETECT_EDGE
    ? await sharp(full.data, { raw: { width: FW, height: FH, channels: 3 } }).resize(DETECT_EDGE, DETECT_EDGE, { fit: 'inside' }).png({ compressionLevel: 1 }).toBuffer()
    : input;
  // 1) FIND THE SHEET DIRECTLY on any non-white surface (a dark desk, walnut, carpet, wood): the paper's
  //    colour from the middle of the photo, the big connected region of it (drawing included), shaped like
  //    a sheet. This doesn't depend on the surface being liftable — a dark table makes the lift decline.
  const direct = await detectSheet(small);
  if (direct) {
    const sheetFull = new Uint8Array(FW * FH);
    for (let y = 0; y < FH; y++) {
      const sy = Math.min(direct.h - 1, Math.floor((y * direct.h) / FH));
      for (let x = 0; x < FW; x++) sheetFull[y * FW + x] = direct.sheet[sy * direct.w + Math.min(direct.w - 1, Math.floor((x * direct.w) / FW))]!;
    }
    const outside = new Uint8Array(FW * FH);
    for (let k = 0; k < outside.length; k++) outside[k] = sheetFull[k] ? 0 : 1;
    const surface = growMask(outside, FW, FH, Math.max(3, Math.round(Math.min(FW, FH) / 130))); // + the sheet's own cut edge / shadow
    const filled = Buffer.from(full.data);
    for (let k = 0; k < surface.length; k++) {
      if (!surface[k]) continue;
      filled[k * 3] = direct.colour[0]; filled[k * 3 + 1] = direct.colour[1]; filled[k * 3 + 2] = direct.colour[2];
    }
    const png0 = await sharp(filled, { raw: { width: FW, height: FH, channels: 3 } }).png({ compressionLevel: 1 }).toBuffer();
    const lifted = await liftOnce(png0, opts, {});
    if (lifted) return dropEdgeDebris(lifted, surface);
  }

  // 2) Otherwise: a plain first lift, then look for a sheet left behind on a liftable (incl. white) surface.
  const first = await liftOnce(small, { ...opts, cleanup: false, keepEnclosedPaper: false }, diag);
  if (!first) return null;
  // A WHITE first background means the art was on white paper already — a big painted shape on it must
  // never be mistaken for "a sheet" and lifted away. Tables (wood, dark, textured) are what we're after.
  const p0 = first.paper;
  const whitePaper = Math.min(p0.r, p0.g, p0.b) > 200 && Math.max(p0.r, p0.g, p0.b) - Math.min(p0.r, p0.g, p0.b) < 25;
  // (a coloured sheet on a WHITE desk still counts — but only when it's unmistakably a sheet: strict mode)
  const found = await sheetOnTable(first, whitePaper);
  if (!found) return liftOnce(input, opts, {});
  // the table mask at FULL size (nearest neighbour from the detection copy)
  const table = new Uint8Array(FW * FH);
  for (let y = 0; y < FH; y++) {
    const sy = Math.min(first.height - 1, Math.floor((y * first.height) / FH));
    for (let x = 0; x < FW; x++) table[y * FW + x] = found.table[sy * first.width + Math.min(first.width - 1, Math.floor((x * first.width) / FW))]!;
  }
  const sheet = { table, colour: found.colour };
  const fill = Buffer.from(full.data);
  for (let k = 0; k < sheet.table.length; k++) {
    if (!sheet.table[k]) continue;
    fill[k * 3] = sheet.colour[0]; fill[k * 3 + 1] = sheet.colour[1]; fill[k * 3 + 2] = sheet.colour[2];
  }
  const png = await sharp(fill, { raw: { width: FW, height: FH, channels: 3 } }).png({ compressionLevel: 1 }).toBuffer();
  const second = await liftOnce(png, opts, {});
  if (!second) return liftOnce(input, opts, {});
  return dropEdgeDebris(second, sheet.table);
}

/**
 * After a sheet-on-table lift: bits of the table / the sheet's cut edge can survive as thin strips
 * along where the table was. Drop any kept blob that lies MOSTLY (≥ 60 %) within a margin round the
 * table area — a drawing that merely touches the edge (grass along the bottom) stays.
 */
async function dropEdgeDebris(res: InkLiftResult, table: Uint8Array): Promise<InkLiftResult> {
  const { width: W, height: H } = res;
  const N = W * H;
  const px = await sharp(res.buffer).raw().toBuffer();
  const M = Math.max(4, Math.round(Math.min(W, H) / 60));
  // margin = table dilated by M (separable max)
  const tmp = new Uint8Array(N), near = new Uint8Array(N);
  for (let y = 0; y < H; y++) {
    let last = -1e9;
    for (let x = 0; x < W; x++) { if (table[y * W + x]) last = x; if (x - last <= M) tmp[y * W + x] = 1; }
    last = 1e9;
    for (let x = W - 1; x >= 0; x--) { if (table[y * W + x]) last = x; if (last - x <= M) tmp[y * W + x] = 1; }
  }
  for (let x = 0; x < W; x++) {
    let last = -1e9;
    for (let y = 0; y < H; y++) { if (tmp[y * W + x]) last = y; if (y - last <= M) near[y * W + x] = 1; }
    last = 1e9;
    for (let y = H - 1; y >= 0; y--) { if (tmp[y * W + x]) last = y; if (last - y <= M) near[y * W + x] = 1; }
  }
  const seen = new Uint8Array(N);
  let changed = false;
  let removedPx = 0;
  for (let s0 = 0; s0 < N; s0++) {
    if (seen[s0] || px[s0 * 4 + 3]! < 32) continue;
    const blob: number[] = [];
    const st = [s0];
    seen[s0] = 1;
    let inMargin = 0;
    while (st.length) {
      const k = st.pop()!;
      blob.push(k);
      inMargin += near[k]!;
      const x = k % W;
      if (x > 0 && !seen[k - 1] && px[(k - 1) * 4 + 3]! >= 32) { seen[k - 1] = 1; st.push(k - 1); }
      if (x < W - 1 && !seen[k + 1] && px[(k + 1) * 4 + 3]! >= 32) { seen[k + 1] = 1; st.push(k + 1); }
      if (k >= W && !seen[k - W] && px[(k - W) * 4 + 3]! >= 32) { seen[k - W] = 1; st.push(k - W); }
      if (k < N - W && !seen[k + W] && px[(k + W) * 4 + 3]! >= 32) { seen[k + W] = 1; st.push(k + W); }
    }
    if (inMargin / blob.length < 0.6) continue;
    for (const k of blob) { px[k * 4 + 3] = 0; removedPx++; }
    changed = true;
  }
  if (!changed) return res;
  const buffer = await sharp(px, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 6 }).toBuffer();
  return { ...res, buffer, removedFraction: Math.min(1, res.removedFraction + removedPx / N) };
}

/**
 * Is the first pass's result a SHEET on a table? = the kept pixels just inside the cleared border are
 * dominated (≥ 60 %) by one colour family and that region is large (≥ 35 % of the picture). Returns the
 * table mask (border-connected cleared pixels) and the sheet's colour.
 */
async function sheetOnTable(first: InkLiftResult, strict = false): Promise<{ table: Uint8Array; colour: [number, number, number] } | null> {
  const { width: W, height: H } = first;
  const px = await sharp(first.buffer).raw().toBuffer();
  const N = W * H;
  const table = new Uint8Array(N);
  const stack: number[] = [];
  const seed = (k: number) => {
    if (!table[k] && px[k * 4 + 3]! < 128) {
      table[k] = 1;
      stack.push(k);
    }
  };
  for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
  while (stack.length) {
    const k = stack.pop()!;
    const x = k % W;
    if (x > 0) seed(k - 1);
    if (x < W - 1) seed(k + 1);
    if (k >= W) seed(k - W);
    if (k < N - W) seed(k + W);
  }
  let tableArea = 0;
  for (let k = 0; k < N; k++) tableArea += table[k]!;
  if (tableArea < N * 0.03 || tableArea > N * 0.65) return null; // no table border, or nothing left to be a sheet
  // The edge ring: solid kept pixels a few px inside the table boundary.
  const D = Math.max(3, Math.round(Math.min(W, H) / 60)); // a little way IN — past the sheet's own edge shadow
  const ring: number[] = [];
  for (let y = D; y < H - D; y += 2) {
    for (let x = D; x < W - D; x += 2) {
      const k = y * W + x;
      if (table[k] || px[k * 4 + 3]! < 250) continue;
      if (table[k - D] || table[k + D] || table[k - D * W] || table[k + D * W]) ring.push(k);
    }
  }
  if (ring.length < 50) return null;
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (const k of ring) {
    const r = px[k * 4]!, g = px[k * 4 + 1]!, b = px[k * 4 + 2]!;
    const c = chroma(r, g, b);
    const key = (Math.round(c.cr * 30) << 12) | (Math.round(c.cg * 30) << 6) | Math.round(c.l / 24);
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(key, e);
  }
  const top = [...buckets.values()].sort((a, b) => b.n - a.n)[0]!;
  // neighbouring buckets of the same family count too (light falls off across a sheet)
  const tc = chroma(top.r / top.n, top.g / top.n, top.b / top.n);
  let fam = 0;
  for (const k of ring) {
    const c = chroma(px[k * 4]!, px[k * 4 + 1]!, px[k * 4 + 2]!);
    if (Math.hypot(c.cr - tc.cr, c.cg - tc.cg) < 0.03 && Math.abs(c.l - tc.l) < tc.l * 0.35) fam++;
  }
  if (fam / ring.length < (strict ? 0.75 : 0.6)) return null; // real sheets measure ~0.68–0.72, drawings' own edges ~0.2–0.35
  // …and it must LOOK like a sheet: large, and nearly rectangular (a big painted heart or blob on white
  // paper has a one-colour edge too, but it's neither — and lifting it as "paper" would erase it).
  if ((N - tableArea) < N * 0.45) return null;
  // What to paint over as "table" before the second pass: the cleared table itself, everything outside
  // the sheet's extent (wood-grain streaks the first pass kept), and a thin band along the sheet's edge
  // (its own shadow / cut edge).
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (const k of ring) {
    const x = k % W, y = (k - x) / W;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const bboxArea = Math.max(1, (x1 - x0 + 1) * (y1 - y0 + 1));
  let inBox = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!table[y * W + x]) inBox++;
  if (inBox / bboxArea < (strict ? 0.9 : 0.8)) return null; // photographed sheets ~0.85–0.9 (slightly turned); a circle is 0.785
  const fill = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < x0 - D || x > x1 + D || y < y0 - D || y > y1 + D) fill[y * W + x] = 1;
  const B = Math.max(3, Math.round(Math.min(W, H) / 130));
  // dilate the table by B (separable max), then add it
  const tmp = new Uint8Array(N);
  for (let y = 0; y < H; y++) {
    let last = -1e9;
    for (let x = 0; x < W; x++) { if (table[y * W + x]) last = x; if (x - last <= B) tmp[y * W + x] = 1; }
    last = 1e9;
    for (let x = W - 1; x >= 0; x--) { if (table[y * W + x]) last = x; if (last - x <= B) tmp[y * W + x] = 1; }
  }
  for (let x = 0; x < W; x++) {
    let last = -1e9;
    for (let y = 0; y < H; y++) { if (tmp[y * W + x]) last = y; if (y - last <= B) fill[y * W + x] = 1; }
    last = 1e9;
    for (let y = H - 1; y >= 0; y--) { if (tmp[y * W + x]) last = y; if (last - y <= B) fill[y * W + x] = 1; }
  }
  return { table: fill, colour: [Math.round(top.r / top.n), Math.round(top.g / top.n), Math.round(top.b / top.n)] };
}

async function liftOnce(input: Buffer, opts: InkLiftOptions = {}, diag: InkLiftDiagnosis = {}): Promise<InkLiftResult | null> {
  const edge = opts.edge ?? 'soft';
  const src = sharp(input, { limitInputPixels: MAX_PIXELS }).rotate();
  const meta = await src.metadata();
  if (!meta.width || !meta.height) throw new Error('unreadable image');

  // ── 1. Paper model at analysis resolution ─────────────────────────────────────
  const small = await sharp(input, { limitInputPixels: MAX_PIXELS })
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize(ANALYSIS_EDGE, ANALYSIS_EDGE, { fit: 'inside', withoutEnlargement: true })
    .median(3)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = small.info;
  const d = small.data;

  // The paper's colour family = the dominant colour on the border ring.
  const ring: number[] = [];
  const inset = Math.max(1, Math.round(Math.min(W, H) * 0.01)); // skip the very edge (vignette / camera fringe)
  for (let x = inset; x < W - inset; x += 2) ring.push((inset * W + x) * 3, ((H - 1 - inset) * W + x) * 3);
  for (let y = inset; y < H - inset; y += 2) ring.push((y * W + inset) * 3, (y * W + W - 1 - inset) * 3);
  const buckets = new Map<number, { n: number; cr: number; cg: number; l: number }>();
  for (const i of ring) {
    const c = chroma(d[i]!, d[i + 1]!, d[i + 2]!);
    const key = (Math.round(c.cr * 40) << 8) | Math.round(c.cg * 40);
    const e = buckets.get(key) ?? { n: 0, cr: 0, cg: 0, l: 0 };
    e.n++;
    e.cr += c.cr;
    e.cg += c.cg;
    e.l += c.l;
    buckets.set(key, e);
  }
  const top = [...buckets.values()].sort((a, b) => b.n - a.n)[0];
  if (!top) {
    diag.declined = 'no-paper';
    return null;
  }
  const pcr = top.cr / top.n;
  const pcg = top.cg / top.n;
  const pl = top.l / top.n;
  // Coverage of the border by that chromaticity family: low ⇒ no paper visible at the edge ⇒ the
  // "background" is paint or a busy scene — a judgement call, not an automatic lift.
  let fam = 0;
  for (const i of ring) {
    const c = chroma(d[i]!, d[i + 1]!, d[i + 2]!);
    if (Math.hypot(c.cr - pcr, c.cg - pcg) < 0.03 && c.l > pl * 0.45) fam++;
  }
  if (fam / ring.length < 0.4) {
    diag.declined = 'no-paper';
    return null;
  }
  if (pl < 60) {
    diag.declined = 'dark-paper'; // black card — colour-to-alpha against dark needs light ink; not this path
    return null;
  }

  // Every paper-like pixel in the image (same chromaticity family, plausibly lit).
  const isPaper = (i: number) => {
    const c = chroma(d[i]!, d[i + 1]!, d[i + 2]!);
    return Math.hypot(c.cr - pcr, c.cg - pcg) < 0.025 && c.l > pl * 0.5 && c.l <= pl * 1.35 + 2;
  };

  // ── Paper field: per-cell median of paper pixels, holes diffused from neighbours, smoothed ──
  // Each cell needs enough pixels to measure the paper: ~12px+ per cell, so a small image gets a
  // coarser field instead of declining for lack of samples.
  const cell = Math.max(W, H) / Math.max(2, Math.min(GRID, Math.floor(Math.max(W, H) / 12)));
  const GW = Math.ceil(W / cell);
  const GH = Math.ceil(H / cell);
  const field: (RGB | null)[] = new Array(GW * GH).fill(null);
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) {
      const rs: number[] = [], gs: number[] = [], bs: number[] = [];
      const x0 = Math.floor(gx * cell), x1 = Math.min(W, Math.floor((gx + 1) * cell));
      const y0 = Math.floor(gy * cell), y1 = Math.min(H, Math.floor((gy + 1) * cell));
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const i = (y * W + x) * 3;
          if (isPaper(i)) {
            rs.push(d[i]!);
            gs.push(d[i + 1]!);
            bs.push(d[i + 2]!);
          }
        }
      }
      const area = ((x1 - x0) * (y1 - y0)) / 4;
      if (rs.length >= Math.max(4, area * 0.08)) {
        // upper-median: paper is the BRIGHT end of what's left (ink only ever darkens it)
        const q = (a: number[]) => a.sort((p, n) => p - n)[Math.floor(a.length * 0.6)]!;
        field[gy * GW + gx] = [q(rs), q(gs), q(bs)];
      }
    }
  }
  const known = field.filter(Boolean).length;
  if (known < Math.max(4, GW * GH * 0.15)) {
    diag.declined = 'no-paper';
    return null;
  }
  // Diffuse into empty cells (inside large painted areas) from known neighbours.
  for (let pass = 0; pass < GW + GH && field.some((f) => f === null); pass++) {
    const next = field.slice();
    for (let gy = 0; gy < GH; gy++) {
      for (let gx = 0; gx < GW; gx++) {
        if (field[gy * GW + gx]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
          const nx = gx + dx, ny = gy + dy;
          if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
          const f = field[ny * GW + nx];
          if (f) {
            r += f[0];
            g += f[1];
            b += f[2];
            n++;
          }
        }
        if (n) next[gy * GW + gx] = [r / n, g / n, b / n];
      }
    }
    field.splice(0, field.length, ...next);
  }
  // Light 3×3 smoothing so the field has no cell seams.
  const smooth: RGB[] = field.map((_, k) => {
    const gx = k % GW, gy = Math.floor(k / GW);
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const f = field[(gy + dy) * GW + (gx + dx)];
        if (gx + dx < 0 || gy + dy < 0 || gx + dx >= GW || gy + dy >= GH || !f) continue;
        r += f[0];
        g += f[1];
        b += f[2];
        n++;
      }
    }
    // (a corner with no estimate anywhere near falls back to the paper colour found on the border)
    if (!n || !Number.isFinite(r + g + b)) {
      const t = top!;
      const L = t.l / t.n, cr = t.cr / t.n, cg = t.cg / t.n; // chromaticity + brightness of the border paper
      const sum = L * 3;
      return [cr * sum, cg * sum, Math.max(0, sum - cr * sum - cg * sum)];
    }
    return [r / n, g / n, b / n];
  });

  // ── 2–4. Full-resolution lift ──────────────────────────────────────────────────
  const full = await src.flatten({ background: '#ffffff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const FW = full.info.width, FH = full.info.height;
  const px = full.data;
  const out = Buffer.alloc(FW * FH * 4);
  const sx = W / FW, sy = H / FH;

  // Bilinear sample of the paper field at analysis coords.
  const paperAt = (ax: number, ay: number): RGB => {
    const fx = Math.min(GW - 1, Math.max(0, ax / cell - 0.5));
    const fy = Math.min(GH - 1, Math.max(0, ay / cell - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = Math.min(GW - 1, x0 + 1), y1 = Math.min(GH - 1, y0 + 1);
    const tx = fx - x0, ty = fy - y0;
    const a = smooth[y0 * GW + x0]!, b = smooth[y0 * GW + x1]!, c = smooth[y1 * GW + x0]!, e = smooth[y1 * GW + x1]!;
    return [0, 1, 2].map((k) => (a[k]! * (1 - tx) + b[k]! * tx) * (1 - ty) + (c[k]! * (1 - tx) + e[k]! * tx) * ty) as RGB;
  };

  // LIGHTER-than-paper ink (white paint, chalk) only makes sense on mid/dark paper like kraft. On
  // white or cream paper, a pixel brighter than its local paper estimate is a highlight or grain —
  // and because (c - q) / (255 - q) explodes as q nears white, counting it would sprinkle "white
  // ink" specks over every bright patch. So: lighter ink is lifted only when the paper is darkish.
  const paperLum = (top.l / top.n);
  const allowLight = paperLum < 185;

  // Colour-to-alpha of one pixel against its local paper colour.
  const rawAlpha = (r: number, g: number, b: number, p: RGB) => {
    let a = 0;
    const ch = [r, g, b];
    for (let k = 0; k < 3; k++) {
      const c = ch[k]!, q = p[k]!;
      const ak = c < q ? (q - c) / Math.max(1, q) : allowLight && c > q ? (c - q) / Math.max(40, 255 - q) : 0;
      if (ak > a) a = ak;
    }
    return Math.min(1, a);
  };

  // Paper texture noise floor: how much "ink" plain paper shows (95th percentile on paper pixels).
  const noise: number[] = [];
  for (let k = 0; k < W * H; k += 7) {
    const i = k * 3;
    if (!isPaper(i)) continue;
    const p = paperAt(k % W, Math.floor(k / W));
    noise.push(rawAlpha(d[i]!, d[i + 1]!, d[i + 2]!, p));
  }
  noise.sort((a, b) => a - b);
  const floor = Math.min(0.2, Math.max(0.04, (noise[Math.floor(noise.length * 0.95)] ?? 0.06) * 1.25));
  const solid = edge === 'firm' ? Math.max(floor + 0.12, 0.3) : Math.max(floor + 0.2, 0.42);
  const smoothstep = (t: number) => t * t * (3 - 2 * t);

  // Pass 1 — raw ink opacity of every pixel against its local paper.
  const N = FW * FH;
  const A = new Float32Array(N);
  for (let y = 0; y < FH; y++) {
    const ay = (y + 0.5) * sy;
    for (let x = 0; x < FW; x++) {
      const i = (y * FW + x) * 3;
      A[y * FW + x] = rawAlpha(px[i]!, px[i + 1]!, px[i + 2]!, paperAt((x + 0.5) * sx, ay));
    }
  }

  // CORE vs EDGE. A pale crayon fill is "mostly transparent" as colour-to-alpha sees it, but a
  // parent expects it SOLID on a dark tee. So the inside of any filled area / thick stroke (ink all
  // around it, found by eroding the clearly-inked mask) is made fully opaque in its as-seen colour;
  // only true edges and fine lines (pencil, felt-tip outlines) stay soft.
  const R = Math.max(2, Math.round(Math.min(FW, FH) / 400));
  const inked = new Uint8Array(N);
  const coreThreshold = Math.min(0.9, floor * 1.6);
  for (let k = 0; k < N; k++) inked[k] = A[k]! > coreThreshold ? 1 : 0;
  const tmp = new Uint8Array(N);
  const core = new Uint8Array(N);
  for (let y = 0; y < FH; y++) {
    // horizontal min (erosion) via a running count of zeros in the window
    let zeros = 0;
    for (let x = -R; x < FW; x++) {
      const add = x + R;
      if (add < FW && !inked[y * FW + add]) zeros++;
      if (add >= FW) zeros++; // outside the image counts as not-inked
      const drop = x - R - 1;
      if (drop >= 0 && !inked[y * FW + drop]) zeros--;
      if (drop >= FW) zeros--;
      if (x >= 0) tmp[y * FW + x] = zeros === 0 && x - R >= 0 ? 1 : 0;
    }
  }
  for (let x = 0; x < FW; x++) {
    let zeros = 0;
    for (let y = -R; y < FH; y++) {
      const add = y + R;
      if (add < FH && !tmp[add * FW + x]) zeros++;
      if (add >= FH) zeros++;
      const drop = y - R - 1;
      if (drop >= 0 && !tmp[drop * FW + x]) zeros--;
      if (drop >= FH) zeros--;
      if (y >= 0) core[y * FW + x] = zeros === 0 && y - R >= 0 ? 1 : 0;
    }
  }

  // Pass 2 — finish.
  let removed = 0;
  for (let y = 0; y < FH; y++) {
    const ay = (y + 0.5) * sy;
    for (let x = 0; x < FW; x++) {
      const k = y * FW + x;
      const i = k * 3;
      const o = k * 4;
      const r = px[i]!, g = px[i + 1]!, b = px[i + 2]!;
      const a = A[k]!;
      let t: number;
      if (core[k]) {
        t = 1;
      } else {
        t = (a - floor) / (solid - floor);
        t = t <= 0 ? 0 : t >= 1 ? 1 : smoothstep(t);
        if (edge === 'firm' && t < 0.18) t = 0; // faint fringe prints badly on dark fabric
      }
      if (t < 0.5) removed++;
      if (t === 0) continue; // fully clear (out is zero-filled)
      // Un-mixed ink colour (paper taken out) for soft edges; the colour as seen for solid ink.
      const p = paperAt((x + 0.5) * sx, ay);
      const am = Math.max(a, 0.02);
      const ur = Math.min(255, Math.max(0, p[0] + (r - p[0]) / am));
      const ug = Math.min(255, Math.max(0, p[1] + (g - p[1]) / am));
      const ub = Math.min(255, Math.max(0, p[2] + (b - p[2]) / am));
      out[o] = Math.round(ur * (1 - t) + r * t);
      out[o + 1] = Math.round(ug * (1 - t) + g * t);
      out[o + 2] = Math.round(ub * (1 - t) + b * t);
      out[o + 3] = Math.round(t * 255);
    }
  }

  const paperMid = smooth[Math.floor(smooth.length / 2)]!;

  // The BACKGROUND = cleared pixels that reach the image border through other cleared pixels
  // (everything else that's cleared is paper ENCLOSED by the drawing).
  const reach = new Uint8Array(N);
  {
    const stack: number[] = [];
    const seed = (k: number) => {
      if (!reach[k] && out[k * 4 + 3]! < 128) {
        reach[k] = 1;
        stack.push(k);
      }
    };
    for (let x = 0; x < FW; x++) { seed(x); seed((FH - 1) * FW + x); }
    for (let y = 0; y < FH; y++) { seed(y * FW); seed(y * FW + FW - 1); }
    while (stack.length) {
      const k = stack.pop()!;
      const x = k % FW;
      if (x > 0) seed(k - 1);
      if (x < FW - 1) seed(k + 1);
      if (k >= FW) seed(k - FW);
      if (k < N - FW) seed(k + FW);
    }
  }

  if (opts.cleanup ?? true) removed += cleanupResidue(px, out, reach, FW, FH, (x, y) => paperAt((x + 0.5) * sx, (y + 0.5) * sy));

  // Optional: paper enclosed by the drawing stays, as clean paper colour.
  if (opts.keepEnclosedPaper) {
    // white-ish paper reads as clean white; coloured paper (kraft) keeps its own colour
    const fill: RGB = paperLum >= 185 ? [255, 255, 255] : [paperMid[0], paperMid[1], paperMid[2]];
    for (let k = 0; k < N; k++) {
      const o = k * 4;
      if (reach[k] || out[o + 3]! >= 255) continue;
      // blend under any soft ink edge so outlines stay crisp
      const a = out[o + 3]! / 255;
      out[o] = Math.round(out[o]! * a + fill[0] * (1 - a));
      out[o + 1] = Math.round(out[o + 1]! * a + fill[1] * (1 - a));
      out[o + 2] = Math.round(out[o + 2]! * a + fill[2] * (1 - a));
      out[o + 3] = 255;
      removed--;
    }
  }
  const buffer = await sharp(out, { raw: { width: FW, height: FH, channels: 4 } }).png({ compressionLevel: 6 }).toBuffer();
  return {
    buffer,
    width: FW,
    height: FH,
    removedFraction: removed / (FW * FH),
    paper: { r: Math.round(paperMid[0]), g: Math.round(paperMid[1]), b: Math.round(paperMid[2]) },
  };
}


// ── CLEAN-UP ─────────────────────────────────────────────────────────────────────
// sRGB → CIELAB (D65), for perceptual "how close to the paper" distances.
const LIN = new Float32Array(256).map((_, c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : Math.pow((c / 255 + 0.055) / 1.055, 2.4)));
function lab(r: number, g: number, b: number): [number, number, number] {
  const R = LIN[r]!, G = LIN[g]!, B = LIN[b]!;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const fy = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const fz = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Lab of a colour quantised to 6 bits a channel (262 144 entries, filled as they're first met) —
 * converting 12 million pixels one by one was most of a big photo's time; the rounding moves a colour
 * by ≲ 2 Lab units, far below the clean-up's tolerances. */
const LAB_Q = new Float32Array(262144 * 3).fill(Number.NaN);
function labQ(r: number, g: number, b: number, outArr: Float32Array, at: number): void {
  const q = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
  let o = q * 3;
  if (Number.isNaN(LAB_Q[o]!)) {
    const c = lab(((r >> 2) << 2) + 2, ((g >> 2) << 2) + 2, ((b >> 2) << 2) + 2);
    LAB_Q[o] = c[0]; LAB_Q[o + 1] = c[1]; LAB_Q[o + 2] = c[2];
  }
  outArr[at] = LAB_Q[o++]!; outArr[at + 1] = LAB_Q[o++]!; outArr[at + 2] = LAB_Q[o]!;
}

/** Lab distance below which a leftover still counts as "paper" (a darker/lighter shade, fibres, a tint). */
export const CLEANUP_PAPER_DE = 24;
/** A step this big between two neighbouring pixels is an OUTLINE — the sweep never crosses it. */
export const CLEANUP_EDGE_DE = 16;
/** Faint specks: kept blobs smaller than this fraction of the shorter side (squared) … */
const SPECK_SIDE = 1 / 70;
/** … whose average colour is this close to the paper are dust/fibres, not drawing (snowflakes are far). */
const SPECK_DE = 30;

/**
 * Sweep paper-ish leftovers into the background, then clear faint specks. Mutates `out` (RGBA) and
 * `reach` (background mask). Returns how many pixels it cleared.
 *
 * 1. GROW from the background into any kept/soft pixel whose colour is within CLEANUP_PAPER_DE of
 *    the LOCAL paper colour, moving only between neighbours less than CLEANUP_EDGE_DE apart — so it
 *    behaves like the parent's "remove colour · just that patch" tapped all round the drawing:
 *    it eats a darker corner or a pink fringe, and stops dead at an outline. Paper enclosed by the
 *    drawing is never reached (it's walled in), so "keep the white inside shapes" still works.
 * 2. SPECKS: small kept blobs (not touching anything big) whose mean colour is close to the paper.
 */
function cleanupResidue(
  px: Buffer,
  out: Buffer,
  reach: Uint8Array,
  W: number,
  H: number,
  paperAt: (x: number, y: number) => [number, number, number],
): number {
  const N = W * H;
  // Per-pixel Lab and distance to the local paper (paper sampled per 8×8 block — the field is smooth).
  const L = new Float32Array(N * 3);
  const dP = new Float32Array(N);
  const BLK = 8;
  const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  // the median paper over the picture, for any block whose local estimate is missing
  const mid = paperAt(Math.floor(W / 2), Math.floor(H / 2));
  const fallbackLab = Number.isFinite(mid[0]) ? lab(clamp255(mid[0]), clamp255(mid[1]), clamp255(mid[2])) : lab(255, 255, 255);
  for (let by = 0; by < H; by += BLK) {
    for (let bx = 0; bx < W; bx += BLK) {
      const p = paperAt(Math.min(W - 1, bx + BLK / 2), Math.min(H - 1, by + BLK / 2));
      // a missing paper estimate must never read as "ink" (NaN compares false everywhere)
      const ok = Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]);
      const pl = ok ? lab(clamp255(p[0]), clamp255(p[1]), clamp255(p[2])) : fallbackLab;
      for (let y = by; y < Math.min(H, by + BLK); y++) {
        for (let x = bx; x < Math.min(W, bx + BLK); x++) {
          const k = y * W + x, i = k * 3;
          labQ(px[i]!, px[i + 1]!, px[i + 2]!, L, i);
          const d0 = L[i]! - pl[0], d1 = L[i + 1]! - pl[1], d2 = L[i + 2]! - pl[2];
          dP[k] = Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2);
        }
      }
    }
  }
  const step = (a: number, b: number) => Math.hypot(L[a * 3]! - L[b * 3]!, L[a * 3 + 1]! - L[b * 3 + 1]!, L[a * 3 + 2]! - L[b * 3 + 2]!);

  let cleared = 0;
  // Solid ink, grown by 2px — the anti-aliased edge of a line or shape lives in here and is never
  // touched by the clean-up (it's the line's own softness, not leftover paper).
  // genuine ink only: solid AND clearly not paper (a solid patch of a lighter paper shade isn't ink);
  // grown by 2px with a separable (row, then column) max — linear time on a 12-megapixel photo
  const nearInk = new Uint8Array(N);
  {
    const rowGrown = new Uint8Array(N);
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const k = row + x;
        if (out[k * 4 + 3]! < 200 || dP[k]! < CLEANUP_PAPER_DE) continue;
        for (let dx = Math.max(0, x - 2); dx <= Math.min(W - 1, x + 2); dx++) rowGrown[row + dx] = 1;
      }
    }
    for (let k = 0; k < N; k++) {
      if (!rowGrown[k]) continue;
      const x = k % W, y = (k - x) / W;
      for (let dy = Math.max(0, y - 2); dy <= Math.min(H - 1, y + 2); dy++) nearInk[dy * W + x] = 1;
    }
  }

  // 1. Grow the background through paper-close colours, never across an outline.
  // seed only from background pixels on its EDGE (next to something kept) — the inside can't grow
  const stack: number[] = [];
  for (let k = 0; k < N; k++) {
    if (!reach[k]) continue;
    const x = k % W;
    if ((x > 0 && !reach[k - 1]) || (x < W - 1 && !reach[k + 1]) || (k >= W && !reach[k - W]) || (k < N - W && !reach[k + W])) stack.push(k);
  }
  const tryGrow = (from: number, k: number) => {
    if (reach[k] || nearInk[k]) return;
    if (dP[k]! >= CLEANUP_PAPER_DE || step(from, k) >= CLEANUP_EDGE_DE) return;
    reach[k] = 1;
    if (out[k * 4 + 3]! >= 128) cleared++;
    out[k * 4] = 0; out[k * 4 + 1] = 0; out[k * 4 + 2] = 0; out[k * 4 + 3] = 0;
    stack.push(k);
  };
  while (stack.length) {
    const k = stack.pop()!;
    const x = k % W;
    if (x > 0) tryGrow(k, k - 1);
    if (x < W - 1) tryGrow(k, k + 1);
    if (k >= W) tryGrow(k, k - W);
    if (k < N - W) tryGrow(k, k + W);
  }

  // 1a. Anything left FAINT in the background (alpha < 128 already counted it as background, but a
  // lighter/darker patch of paper keeps a see-through tint — the corner a parent taps away) goes fully.
  for (let k = 0; k < N; k++) {
    const o = k * 4;
    if (!reach[k] || nearInk[k] || out[o + 3] === 0 || dP[k]! >= CLEANUP_PAPER_DE) continue;
    out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0;
  }

  // 1b. DECONTAMINATE the fringe. Where ink fades into the paper (fluffy cotton wool, a soft crayon
  // edge) the photo's pixels are ink MIXED with paper — kept as seen, white cotton wool on red paper
  // grows a pink outline. For each kept pixel in a thin band along the background, take the most
  // ink-like colour close by (the furthest from the paper) as the ink, and re-express the pixel as
  // that ink at partial opacity: the rim becomes white fading out, not pink.
  {
    const F = Math.max(4, Math.round(Math.min(W, H) / 40)); // fringe depth (a fluffy edge is ~2–3 % of the picture)
    const dist = new Uint16Array(N).fill(65535);
    let frontier: number[] = [];
    for (let k = 0; k < N; k++) {
      if (!reach[k]) continue;
      dist[k] = 0;
      const x = k % W;
      if ((x > 0 && !reach[k - 1]) || (x < W - 1 && !reach[k + 1]) || (k >= W && !reach[k - W]) || (k < N - W && !reach[k + W])) frontier.push(k);
    }
    const visit = (n: number, d: number, next: number[]) => {
      if (dist[n] !== 65535) return;
      dist[n] = d;
      next.push(n);
    };
    for (let d = 1; d <= F && frontier.length; d++) {
      const next: number[] = [];
      for (const k of frontier) {
        const x = k % W;
        if (x > 0) visit(k - 1, d, next);
        if (x < W - 1) visit(k + 1, d, next);
        if (k >= W) visit(k - W, d, next);
        if (k < N - W) visit(k + W, d, next);
      }
      frontier = next;
    }
    // The ink for each fringe pixel = the nearest SOLID pixel just inside the fringe: spread each such
    // pixel's index outward through the fringe in one breadth-first sweep (no per-pixel searching).
    const src = new Int32Array(N).fill(-1);
    let wave: number[] = [];
    for (let k = 0; k < N; k++) {
      if (dist[k] !== 65535 || out[k * 4 + 3]! < 250) continue;
      const x = k % W;
      const edge = (x > 0 && dist[k - 1]! <= F) || (x < W - 1 && dist[k + 1]! <= F) || (k >= W && dist[k - W]! <= F) || (k < N - W && dist[k + W]! <= F);
      if (edge) { src[k] = k; wave.push(k); }
    }
    for (let d = 0; d <= F && wave.length; d++) {
      const next: number[] = [];
      const pass = (n: number, from: number) => {
        if (src[n] !== -1 || dist[n] === 0 || dist[n]! > F) return;
        src[n] = src[from]!;
        next.push(n);
      };
      for (const k of wave) {
        const x = k % W;
        if (x > 0) pass(k - 1, k);
        if (x < W - 1) pass(k + 1, k);
        if (k >= W) pass(k - W, k);
        if (k < N - W) pass(k + W, k);
      }
      wave = next;
    }
    const upd: Array<[number, number, number, number, number]> = [];
    for (let k = 0; k < N; k++) {
      const d = dist[k]!;
      if (d === 0 || d > F || out[k * 4 + 3] === 0) continue;
      const x = k % W, y = (k - x) / W;
      const best = src[k]!;
      if (best < 0 || dP[best]! < CLEANUP_PAPER_DE * 1.5) continue; // no clearly different ink nearby
      const pp = paperAt(x, y);
      const c = [px[k * 3]!, px[k * 3 + 1]!, px[k * 3 + 2]!];
      const ink = [px[best * 3]!, px[best * 3 + 1]!, px[best * 3 + 2]!];
      let num = 0, den = 0;
      for (let ch = 0; ch < 3; ch++) {
        num += (c[ch]! - pp[ch]!) * (ink[ch]! - pp[ch]!);
        den += (ink[ch]! - pp[ch]!) ** 2;
      }
      const a = den > 0 ? Math.min(1, Math.max(0, num / den)) : 1;
      // only if the pixel really IS that ink mixed with paper (it lies near the paper→ink line);
      // anything else (a highlight, a different colour) is left exactly as it was
      let res = 0;
      for (let ch = 0; ch < 3; ch++) res += (c[ch]! - (pp[ch]! + a * (ink[ch]! - pp[ch]!))) ** 2;
      if (Math.sqrt(res) > 28) continue;
      upd.push([k, ink[0]!, ink[1]!, ink[2]!, Math.round(Math.min(out[k * 4 + 3]!, a * 255))]);
    }
    for (const [k, r, g, b, a] of upd) {
      const o = k * 4;
      if (a < 8) { out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0; continue; }
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
    }
  }

  // 2. Specks: 8-connected kept blobs, small, and paper-close on average.
  const maxArea = Math.max(6, Math.round((Math.min(W, H) * SPECK_SIDE) ** 2));
  const label = new Int32Array(N).fill(-1);
  const blob: number[] = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (label[s0] !== -1 || out[s0 * 4 + 3]! < 32) continue;
    blob.length = 0;
    const st = [s0];
    label[s0] = s0;
    let sum = 0, big = false;
    while (st.length) {
      const k = st.pop()!;
      blob.push(k);
      sum += dP[k]!;
      if (blob.length > maxArea) big = true;
      const x = k % W, y = (k - x) / W;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const n = ny * W + nx;
          if (label[n] !== -1 || out[n * 4 + 3]! < 32) continue;
          label[n] = s0;
          st.push(n);
        }
      }
    }
    if (big || sum / blob.length >= SPECK_DE) continue;
    for (const k of blob) {
      if (out[k * 4 + 3]! >= 128) cleared++;
      out[k * 4 + 3] = 0;
      reach[k] = 1;
    }
  }
  return cleared;
}


/** A mask grown by r pixels (separable max). */
function growMask(m: Uint8Array, W: number, H: number, r: number): Uint8Array {
  const N = W * H;
  const tmp = new Uint8Array(N), out = new Uint8Array(N);
  for (let y = 0; y < H; y++) {
    let last = -1e9;
    for (let x = 0; x < W; x++) { if (m[y * W + x]) last = x; if (x - last <= r) tmp[y * W + x] = 1; }
    last = 1e9;
    for (let x = W - 1; x >= 0; x--) { if (m[y * W + x]) last = x; if (last - x <= r) tmp[y * W + x] = 1; }
  }
  for (let x = 0; x < W; x++) {
    let last = -1e9;
    for (let y = 0; y < H; y++) { if (tmp[y * W + x]) last = y; if (y - last <= r) out[y * W + x] = 1; }
    last = 1e9;
    for (let y = H - 1; y >= 0; y--) { if (tmp[y * W + x]) last = y; if (last - y <= r) out[y * W + x] = 1; }
  }
  return out;
}

/**
 * Find a SHEET OF PAPER photographed on a NON-WHITE surface (a dark desk, walnut, carpet, wood).
 *  1. the paper colour = the commonest colour family in the middle half of the photo (paper outnumbers
 *     a child's lines there), and the surface must NOT be white (white desks take the strict route);
 *  2. the sheet = the largest connected region of paper-coloured pixels, plus everything it encloses
 *     (the drawing on it);
 *  3. it must look like a sheet: ≥ 25 % of the photo, ≥ 75 % of its bounding box (a turned or
 *     slightly angled rectangle), and NOT the whole frame (a surface must show round it).
 * Returns the sheet mask at the copy's size and the paper colour, or null.
 */
async function detectSheet(input: Buffer): Promise<{ sheet: Uint8Array; colour: [number, number, number]; w: number; h: number } | null> {
  const { data: d, info } = await sharp(input, { limitInputPixels: MAX_PIXELS }).rotate().flatten({ background: '#ffffff' })
    .resize(700, 700, { fit: 'inside', withoutEnlargement: true }).median(3).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;
  // the surface: the border ring's median — skip white desks (the strict route handles those)
  const ring: number[] = [];
  for (let x = 0; x < W; x += 2) ring.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y += 2) ring.push(y * W, y * W + W - 1);
  const med = (ch: number) => ring.map((k) => d[k * 3 + ch]!).sort((a, b) => a - b)[Math.floor(ring.length / 2)]!;
  const sr = med(0), sg = med(1), sb = med(2);
  if (Math.min(sr, sg, sb) > 200 && Math.max(sr, sg, sb) - Math.min(sr, sg, sb) < 25) return null;

  // the paper colour: commonest chromaticity+lightness bucket in the middle half
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let y = Math.floor(H * 0.25); y < H * 0.75; y += 2) {
    for (let x = Math.floor(W * 0.25); x < W * 0.75; x += 2) {
      const i = (y * W + x) * 3;
      const c = chroma(d[i]!, d[i + 1]!, d[i + 2]!);
      const key = (Math.round(c.cr * 30) << 12) | (Math.round(c.cg * 30) << 6) | Math.round(c.l / 20);
      const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      e.n++; e.r += d[i]!; e.g += d[i + 1]!; e.b += d[i + 2]!;
      buckets.set(key, e);
    }
  }
  const top = [...buckets.values()].sort((a, b) => b.n - a.n)[0];
  if (!top) return null;
  const pc = chroma(top.r / top.n, top.g / top.n, top.b / top.n);
  if (pc.l < 70) return null; // paper is light-ish; a dark "sheet" is more likely the surface
  const sc = chroma(sr, sg, sb);
  // the surface must look different from the paper (else the "sheet" is just the whole photo)
  if (Math.hypot(sc.cr - pc.cr, sc.cg - pc.cg) < 0.02 && Math.abs(sc.l - pc.l) < pc.l * 0.18) return null;

  const isPaper = new Uint8Array(N);
  for (let k = 0; k < N; k++) {
    const c = chroma(d[k * 3]!, d[k * 3 + 1]!, d[k * 3 + 2]!);
    isPaper[k] = Math.hypot(c.cr - pc.cr, c.cg - pc.cg) < 0.035 && c.l > pc.l * 0.6 && c.l < pc.l * 1.3 + 4 ? 1 : 0;
  }
  // largest connected paper region
  const lab = new Int32Array(N).fill(-1);
  let bestId = -1, bestN = 0;
  for (let s0 = 0; s0 < N; s0++) {
    if (!isPaper[s0] || lab[s0] !== -1) continue;
    let n = 0;
    const st = [s0];
    lab[s0] = s0;
    while (st.length) {
      const k = st.pop()!;
      n++;
      const x = k % W;
      if (x > 0 && isPaper[k - 1] && lab[k - 1] === -1) { lab[k - 1] = s0; st.push(k - 1); }
      if (x < W - 1 && isPaper[k + 1] && lab[k + 1] === -1) { lab[k + 1] = s0; st.push(k + 1); }
      if (k >= W && isPaper[k - W] && lab[k - W] === -1) { lab[k - W] = s0; st.push(k - W); }
      if (k < N - W && isPaper[k + W] && lab[k + W] === -1) { lab[k + W] = s0; st.push(k + W); }
    }
    if (n > bestN) { bestN = n; bestId = s0; }
  }
  if (bestId < 0 || bestN < N * 0.15) return null;
  // the sheet = that region + everything it encloses (not reachable from the border without crossing it)
  const outside = new Uint8Array(N);
  const st: number[] = [];
  const seed = (k: number) => { if (!outside[k] && lab[k] !== bestId) { outside[k] = 1; st.push(k); } };
  for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
  while (st.length) {
    const k = st.pop()!;
    const x = k % W;
    if (x > 0) seed(k - 1);
    if (x < W - 1) seed(k + 1);
    if (k >= W) seed(k - W);
    if (k < N - W) seed(k + W);
  }
  const sheet = new Uint8Array(N);
  let area = 0, x0 = W, y0 = H, x1 = 0, y1 = 0, onBorder = 0;
  for (let k = 0; k < N; k++) {
    if (outside[k]) continue;
    sheet[k] = 1;
    area++;
    const x = k % W, y = (k - x) / W;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  for (const k of ring) onBorder += sheet[k]!;
  if (area < N * 0.25) return null; // too small to be the sheet
  if (onBorder / ring.length > 0.6) return null; // the sheet fills the frame — no surface to remove
  if (area / ((x1 - x0 + 1) * (y1 - y0 + 1)) < 0.75) return null; // not sheet-shaped
  return { sheet, colour: [Math.round(top.r / top.n), Math.round(top.g / top.n), Math.round(top.b / top.n)], w: W, h: H };
}
