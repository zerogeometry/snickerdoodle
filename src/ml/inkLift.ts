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

export async function liftInk(input: Buffer, opts: InkLiftOptions = {}, diag: InkLiftDiagnosis = {}): Promise<InkLiftResult | null> {
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

  // Optional: paper enclosed by the drawing stays, as clean paper colour. "Enclosed" = cleared
  // pixels that can't reach the image border through other cleared pixels.
  if (opts.keepEnclosedPaper) {
    const reach = new Uint8Array(N);
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
