import sharp from 'sharp';
import { detectSheet } from './inkLift';

/**
 * TRIM THE TABLE (founder, 26 Oct): a drawing photographed lying on a table, desk or carpet is cropped
 * to the sheet — and squared up if the photo was taken at an angle — the moment it's uploaded, so the
 * table never reaches a mug and "remove background" only has the paper to lift.
 *
 * Careful by design ("rather delete a little too little than way too much"): it acts only when it is
 * SURE — the surface shows all round the sheet, the sheet is a clean four-sided shape, and there's
 * something worth trimming. Otherwise it returns null and the photo is used exactly as uploaded.
 * The original is never touched (the crop is a separate derivative; the parent can undo it).
 *
 * Quick: the sheet is found on a ≤700px copy (the remover's own sheet finder), and the full-size photo
 * is touched once — a plain crop for a straight sheet, a perspective resample for a tilted one.
 */

export type Quad = [[number, number], [number, number], [number, number], [number, number]]; // TL, TR, BR, BL — fractions of the photo

type Found = { quad: Quad; surface: [number, number, number]; paper: [number, number, number]; /** found by scanning — no colour-based edge trim */ noTrim?: boolean };

/** Where the sheet is (corners as fractions of the upright photo), or null when it isn't sure. */
export async function findSheetQuad(input: Buffer): Promise<Found | null> {
  return (await byColour(input)) ?? (await byTableScan(input));
}

/** 1) By colour — the sheet is a region of paper colour clearly different from the table (the remover's finder). */
async function byColour(input: Buffer): Promise<Found | null> {
  const found = await detectSheet(input);
  if (!found || found.touchesFrame) return null; // the sheet runs off the photo — nothing to trim safely
  const { sheet, w: W, h: H } = found;
  // the sheet's four corners: the extremes along the diagonals
  let tl = [0, 0], tr = [0, 0], br = [0, 0], bl = [0, 0];
  let sMin = Infinity, sMax = -Infinity, dMin = Infinity, dMax = -Infinity, area = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!sheet[y * W + x]) continue;
      area++;
      const s = x + y, d = x - y;
      if (s < sMin) { sMin = s; tl = [x, y]; }
      if (s > sMax) { sMax = s; br = [x + 1, y + 1]; }
      if (d > dMax) { dMax = d; tr = [x + 1, y]; }
      if (d < dMin) { dMin = d; bl = [x, y + 1]; }
    }
  }
  const quad = [tl, tr, br, bl] as [number, number][];
  // a clean four-sided sheet: its outline fills the quadrilateral through its corners
  const quadArea = Math.abs(quad.reduce((acc, p, i) => { const q = quad[(i + 1) % 4]!; return acc + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  if (quadArea <= 0 || area / quadArea < 0.95 || area / quadArea > 1.05) return null;
  // worth trimming: the sheet isn't (nearly) the whole photo already
  if (area / (W * H) > 0.93) return null;
  // corners clear of the photo's edge (all round = the surface is visible all round)
  const m = Math.min(W, H) * 0.01;
  if (quad.some(([x, y]) => x < m || y < m || x > W - m || y > H - m)) return null;
  // a hair inside the sheet's edge: its cut edge and its shadow go with the table
  const cx = quad.reduce((a, p) => a + p[0], 0) / 4, cy = quad.reduce((a, p) => a + p[1], 0) / 4;
  const inset = 0.012;
  return {
    quad: quad.map(([x, y]) => [(x + (cx - x) * inset * 2) / W, (y + (cy - y) * inset * 2) / H]) as Quad,
    surface: found.surface,
    paper: found.colour,
  };
}

/** Map the unit square onto a quadrilateral (TL, TR, BR, BL) — Heckbert's square-to-quad. */
function squareToQuad(q: [number, number][]): (u: number, v: number) => [number, number] {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q as [[number, number], [number, number], [number, number], [number, number]];
  const dx3 = x0 - x1 + x2 - x3, dy3 = y0 - y1 + y2 - y3;
  let a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    a = x1 - x0; b = x2 - x1; c = x0; d = y1 - y0; e = y2 - y1; f = y0; g = 0; h = 0;
  } else {
    const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
    const den = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
    a = x1 - x0 + g * x1; b = x3 - x0 + h * x3; c = x0;
    d = y1 - y0 + g * y1; e = y3 - y0 + h * y3; f = y0;
  }
  return (u, v) => { const z = g * u + h * v + 1; return [(a * u + b * v + c) / z, (d * u + e * v + f) / z]; };
}

/** The trimmed photo's encoding: it IS a photo (the upload's own kind), so a high-quality JPEG with full
 * colour detail (no chroma subsampling — crayon edges stay crisp) — a few MB where a PNG was ~20MB, so it
 * stores, downloads and decodes for every mockup far quicker. */
const PHOTO_JPEG = { quality: 95, chromaSubsampling: '4:4:4' } as const;

export interface SheetCrop {
  /** the cropped (and squared-up) drawing, JPEG */
  buffer: Buffer;
  width: number;
  height: number;
  quad: Quad;
  /** squared up from a tilted photo (vs a plain crop) */
  straightened: boolean;
}

/** Crop the photo to the sheet (squaring it up if tilted), or null when it isn't sure. */
export async function cropToSheet(input: Buffer): Promise<SheetCrop | null> {
  const found = await findSheetQuad(input);
  if (!found) return null;
  const { quad } = found;
  const meta = await sharp(input).rotate().metadata();
  // (orientation applied: width/height of the UPRIGHT photo)
  const upright = [5, 6, 7, 8].includes(meta.orientation ?? 1);
  const FW = (upright ? meta.height : meta.width) ?? 0, FH = (upright ? meta.width : meta.height) ?? 0;
  if (!FW || !FH) return null;
  const P = quad.map(([x, y]) => [x * FW, y * FH]) as [number, number][];
  const len = (p: [number, number], q: [number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const outW = Math.round((len(P[0]!, P[1]!) + len(P[3]!, P[2]!)) / 2);
  const outH = Math.round((len(P[0]!, P[3]!) + len(P[1]!, P[2]!)) / 2);
  // straight enough for a plain crop? (corners within ~0.6 % of an upright rectangle)
  const tol = Math.max(FW, FH) * 0.006;
  const straight = Math.abs(P[0]![1] - P[1]![1]) < tol && Math.abs(P[3]![1] - P[2]![1]) < tol && Math.abs(P[0]![0] - P[3]![0]) < tol && Math.abs(P[1]![0] - P[2]![0]) < tol;
  if (straight) {
    const left = Math.round(Math.max(P[0]![0], P[3]![0])), top = Math.round(Math.max(P[0]![1], P[1]![1]));
    const right = Math.round(Math.min(P[1]![0], P[2]![0])), bottom = Math.round(Math.min(P[3]![1], P[2]![1]));
    const raw = await sharp(input).rotate().extract({ left, top, width: right - left, height: bottom - top }).removeAlpha().raw().toBuffer();
    return finish(raw, right - left, bottom - top, found, false);
  }
  // tilted: resample the sheet square (bilinear)
  const { data: src } = await sharp(input).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const map = squareToQuad(P);
  const out = Buffer.alloc(outW * outH * 3);
  for (let y = 0; y < outH; y++) {
    const v = (y + 0.5) / outH;
    for (let x = 0; x < outW; x++) {
      const [sx, sy] = map((x + 0.5) / outW, v);
      const fx = Math.min(FW - 1.001, Math.max(0, sx - 0.5)), fy = Math.min(FH - 1.001, Math.max(0, sy - 0.5));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const i00 = (y0 * FW + x0) * 3, i10 = i00 + 3, i01 = i00 + FW * 3, i11 = i01 + 3;
      const o = (y * outW + x) * 3;
      for (let c = 0; c < 3; c++) {
        out[o + c] = Math.round((src[i00 + c]! * (1 - tx) + src[i10 + c]! * tx) * (1 - ty) + (src[i01 + c]! * (1 - tx) + src[i11 + c]! * tx) * ty);
      }
    }
  }
  return finish(out, outW, outH, found, true);
}

/** sRGB → Lab (D65) */
function lab(r: number, g: number, b: number): [number, number, number] {
  const f = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = f(r), G = f(g), B = f(b);
  const t = (v: number) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  const X = t((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047), Y = t(R * 0.2126 + G * 0.7152 + B * 0.0722), Z = t((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}

/**
 * Last look along each edge: a line that still shows the desk (a sliver where the sheet's edge wasn't
 * quite straight, its shadow) is trimmed off — line by line, at most 4 % per side, and only while the
 * line is noticeably desk, so drawing running to the sheet's edge is never cut.
 */
async function finish(raw: Buffer, W: number, H: number, found: Found, straightened: boolean): Promise<SheetCrop> {
  if (found.noTrim) {
    const buffer = await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).jpeg(PHOTO_JPEG).toBuffer();
    return { buffer, width: W, height: H, quad: found.quad, straightened };
  }
  const sl = lab(...found.surface), pl = lab(...found.paper);
  const deskShare = (x0: number, y0: number, dx: number, dy: number, n: number) => {
    let desk = 0, seen = 0;
    for (let i = 0; i < n; i += 2) {
      const x = x0 + dx * i, y = y0 + dy * i, k = (y * W + x) * 3;
      const q = lab(raw[k]!, raw[k + 1]!, raw[k + 2]!);
      const ds = Math.hypot(q[0] - sl[0], q[1] - sl[1], q[2] - sl[2]), dp = Math.hypot(q[0] - pl[0], q[1] - pl[1], q[2] - pl[2]);
      seen++;
      if (ds < 18 && ds < dp) desk++;
    }
    return desk / Math.max(1, seen);
  };
  const maxX = Math.round(W * 0.04), maxY = Math.round(H * 0.04), LIMIT = 0.04;
  let top = 0, bottom = H - 1, left = 0, right = W - 1;
  // keep trimming a side while its outermost remaining line still looks like desk
  for (let guard = 0; guard < maxX + maxY; guard++) {
    let moved = false;
    if (top < maxY && deskShare(left, top, 1, 0, right - left + 1) > LIMIT) { top++; moved = true; }
    if (H - 1 - bottom < maxY && deskShare(left, bottom, 1, 0, right - left + 1) > LIMIT) { bottom--; moved = true; }
    if (left < maxX && deskShare(left, top, 0, 1, bottom - top + 1) > LIMIT) { left++; moved = true; }
    if (W - 1 - right < maxX && deskShare(right, top, 0, 1, bottom - top + 1) > LIMIT) { right--; moved = true; }
    if (!moved) break;
  }
  const w = right - left + 1, h = bottom - top + 1;
  const buffer = await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).extract({ left, top, width: w, height: h }).jpeg(PHOTO_JPEG).toBuffer();
  return { buffer, width: w, height: h, quad: found.quad, straightened };
}


/**
 * 2) By SCANNING IN from each side — for paper close in colour to the table (kraft or parchment on light
 * wood) or dark card. Each side learns its own table from the photo's outer band there (all the shades
 * the wood shows), then for every column / row finds where that table ends. A real sheet edge makes those
 * depths line up on one straight line (fitted robustly); paper the table's colour, a drawing, or no table
 * at all gives scattered depths — and that side is left alone. Only a confident side is trimmed, never
 * more than a quarter of the photo, so a mistake can't cut into the drawing.
 */
const STEP = 8; // a lasting colour step this big (Lab) marks the sheet's edge
async function byTableScan(input: Buffer): Promise<Found | null> {
  const { data: d, info } = await sharp(input, { limitInputPixels: 40_000_000 }).rotate().flatten({ background: '#ffffff' })
    .resize(480, 480, { fit: 'inside', withoutEnlargement: true }).median(3).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const CELL = 5, GD = Math.ceil(300 / CELL);
  const labCache = new Map<number, [number, number, number]>();
  const labAt = (k: number) => {
    let q = labCache.get(k);
    if (!q) { q = lab(d[k * 3]!, d[k * 3 + 1]!, d[k * 3 + 2]!); labCache.set(k, q); }
    return q;
  };
  const key = (k: number) => {
    const q = labAt(k);
    return (Math.floor(q[0] / CELL) * GD + Math.floor((q[1] + 128) / CELL)) * GD + Math.floor((q[2] + 128) / CELL);
  };
  type Side = 'top' | 'bottom' | 'left' | 'right';
  const horiz = (s: Side) => s === 'top' || s === 'bottom';
  /** pixel index at distance `i` in from side `s`, position `t` along it */
  const px = (s: Side, t: number, i: number) =>
    s === 'top' ? i * W + t : s === 'bottom' ? (H - 1 - i) * W + t : s === 'left' ? t * W + i : t * W + (W - 1 - i);

  const scan = (s: Side, step = false) => {
    const S = horiz(s) ? W : H, D = horiz(s) ? H : W;
    const band = Math.max(3, Math.round(D * 0.02));
    // this side's table: the colours its outer band shows (seen ≥ 3 times), and their neighbours
    const seen = new Map<number, number>();
    let ringPx = 0, top = 0;
    for (let t = 0; t < S; t += 2) for (let i = 0; i < band; i++) { const k = key(px(s, t, i)); const n = (seen.get(k) ?? 0) + 1; seen.set(k, n); ringPx++; }
    const table = new Set<number>();
    for (const [k, n] of seen) {
      if (n < 3) continue;
      top += n;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) table.add(k + (a * GD + b) * GD + c);
    }
    if (top / ringPx < 0.9) return null; // the band isn't one surface (a busy scene)
    // where the table ends, per column: the first point with 4 non-table pixels running
    const maxD = Math.round(D * 0.25);
    const ts: number[] = [], ds: number[] = [];
    for (let t = Math.round(S * 0.06); t < S * 0.94; t += 2) {
      let run = 0, end = -1;
      for (let i = 0; i < maxD + 4; i++) {
        if (step) break;
        if (table.has(key(px(s, t, i)))) run = 0;
        else if (++run === 4) { end = i - 3; break; }
      }
      if (step) {
        // where the colour first steps and STAYS changed: the difference between the 6 px either side
        // (a grain line is thin — the windows average it away; the sheet's edge is a lasting change)
        let bestI = -1;
        const bestV = STEP;
        for (let i = band; i < maxD; i++) {
          let o0 = 0, o1 = 0, o2 = 0, n0 = 0, n1 = 0, n2 = 0;
          for (let j = 1; j <= 6; j++) {
            const a = labAt(px(s, t, Math.max(0, i - j))), b = labAt(px(s, t, i + j));
            o0 += a[0]; o1 += a[1]; o2 += a[2]; n0 += b[0]; n1 += b[1]; n2 += b[2];
          }
          const v = Math.hypot(o0 - n0, o1 - n1, o2 - n2) / 6;
          if (v > bestV) { bestI = i; break; } // the FIRST lasting step from the border: the sheet comes before the drawing
        }
        end = bestI < 0 ? maxD + 1 : bestI;
      }
      if (end < 0) end = maxD + 1; // table all the way in (or paper the table's colour)
      ts.push(t); ds.push(end);
    }
    // robust straight line through the depths (Theil–Sen on a sample)
    const slopes: number[] = [];
    for (let a = 0; a < ts.length; a += 3) for (let b = a + 7; b < ts.length; b += 7) slopes.push((ds[b]! - ds[a]!) / (ts[b]! - ts[a]!));
    slopes.sort((x, y) => x - y);
    const sl = slopes[slopes.length >> 1] ?? 0;
    const icpts = ts.map((t, i) => ds[i]! - sl * (t - S / 2)).sort((x, y) => x - y);
    const c = icpts[icpts.length >> 1]!;
    const tol = Math.max(2, D * 0.012);
    const fit = ts.filter((t, i) => Math.abs(ds[i]! - (c + sl * (t - S / 2))) <= tol).length / ts.length;
    // confident: most of the side agrees on one line, it's a real strip, not too steep, inside the limit
    if (fit < 0.75 || Math.abs(sl) > 0.15) return null;
    const lo = Math.min(c + sl * (-S / 2), c + sl * (S / 2)), hi = Math.max(c + sl * (-S / 2), c + sl * (S / 2));
    if (hi < band || hi > maxD) return null;
    void lo;
    return { c: c + Math.max(1, Math.round(D * 0.008)), sl }; // a hair past the edge: its cut and shadow go too
  };

  const lines: Record<Side, { c: number; sl: number } | null> = { top: scan('top'), bottom: scan('bottom'), left: scan('left'), right: scan('right') };
  // A side whose light makes the paper look like the table (colours shared): find the sheet's edge as a
  // lasting colour STEP instead — with the same straight-line test, so it's only trimmed when sure.
  if (Object.values(lines).some(Boolean)) {
    for (const x of ['top', 'bottom', 'left', 'right'] as Side[]) if (!lines[x]) lines[x] = scan(x, true);
  }
  const found = (Object.keys(lines) as Side[]).filter((s) => lines[s]);
  if (!found.length) return null;
  // lines in photo coordinates: y = a + b·x for top/bottom, x = a + b·y for left/right
  const hLine = (s: 'top' | 'bottom') => {
    const l = lines[s];
    if (!l) return { a: s === 'top' ? 0 : H, b: 0 };
    return s === 'top' ? { a: l.c - l.sl * (W / 2), b: l.sl } : { a: H - l.c + l.sl * (W / 2), b: -l.sl };
  };
  const vLine = (s: 'left' | 'right') => {
    const l = lines[s];
    if (!l) return { a: s === 'left' ? 0 : W, b: 0 };
    return s === 'left' ? { a: l.c - l.sl * (H / 2), b: l.sl } : { a: W - l.c + l.sl * (H / 2), b: -l.sl };
  };
  const meet = (h: { a: number; b: number }, v: { a: number; b: number }): [number, number] => {
    let x = v.a, y = h.a;
    for (let i = 0; i < 10; i++) { y = h.a + h.b * x; x = v.a + v.b * y; }
    return [x, y];
  };
  const medianRgb = (keep: (k: number) => boolean): [number, number, number] => {
    const ch: number[][] = [[], [], []];
    for (let k = 0; k < W * H; k += 3) if (keep(k)) for (let c = 0; c < 3; c++) ch[c]!.push(d[k * 3 + c]!);
    return ch.map((v) => v.sort((a, b) => a - b)[v.length >> 1] ?? 0) as [number, number, number];
  };
  const T = hLine('top'), B = hLine('bottom'), Lf = vLine('left'), R = vLine('right');
  const quad = [meet(T, Lf), meet(T, R), meet(B, R), meet(B, Lf)];
  return {
    quad: quad.map(([x, y]) => [Math.min(1, Math.max(0, x / W)), Math.min(1, Math.max(0, y / H))]) as Quad,
    // for the last look along each edge: the table = the photo's outer band, the paper = its middle
    surface: medianRgb((k) => { const x = k % W, y = (k - x) / W; return x < W * 0.03 || y < H * 0.03 || x > W * 0.97 || y > H * 0.97; }),
    paper: medianRgb((k) => { const x = k % W, y = (k - x) / W; return x > W * 0.3 && x < W * 0.7 && y > H * 0.3 && y < H * 0.7; }),
  };
}
