/**
 * CYLINDER mockup tier — wrap a flat design onto the visible print SURFACE of a mug, defined by a
 * founder-authored PRINTMAP (an alpha shape on the product photo: full print height, curved
 * top/bottom, spanning the visible front arc of the circumference). Pure pixel math, no I/O, so
 * it's exhaustively unit-testable and the child's design never leaves the process.
 *
 * The printmap does the vertical work: at each output column the design fills the printmap's own
 * top→bottom span, so a horizontal design line follows the mug's curved contour (a real cylinder
 * bow, not a synthetic one) and foreshortens where the surface turns away. The horizontal work is
 * the cylinder projection: a surface point at angle θ projects to screen x = sin(θ), so the design
 * column for a screen position is found by inverting that (arcsin) — the art compresses toward the
 * printmap's left/right edges exactly as it curves around the mug.
 *
 * How much of the design shows: the printmap spans `visibleArcDeg` of the circumference while the
 * full upload wraps `printedArcDeg` (209mm ≈ 292° on an 11oz mug), so the front shows the central
 * visibleArcDeg/printedArcDeg of the design and the rest wraps out of view. The BACK view uses
 * centerDeg=180 on the flopped photo (mirror keeps the art un-reversed).
 */

export interface CylinderWarpInput {
  /** RGBA raw pixels of the design — the FULL printed wrap (srcW × srcH × 4). */
  design: Buffer;
  srcW: number;
  srcH: number;
  /** Printmap ALPHA (single channel, pmW × pmH, on the product-photo canvas): opaque = the visible
   * printable surface. Its per-column vertical span is the cylinder's contour; its horizontal
   * extent is the visible arc. */
  printAlpha: Buffer;
  pmW: number;
  pmH: number;
  /** Arc of the circumference the printmap spans (e.g. ~144° for ~40%). */
  visibleArcDeg: number;
  /** Arc the full printed wrap covers (e.g. ~292° for a 209mm print on an 11oz mug). */
  printedArcDeg: number;
  /** Which surface angle sits at the printmap centre: 0 = front, 180 = back. */
  centerDeg: number;
  /** Mirror the horizontal parameter — used with a flopped photo so the BACK view's art reads the
   * right way round (handle on the left) instead of left-right reversed. */
  mirror?: boolean;
}

/** Normalise an angle in degrees to (−180, 180]. */
function norm180(deg: number): number {
  let d = (((deg + 180) % 360) + 360) % 360 - 180;
  if (d <= -180) d += 360;
  return d;
}

/**
 * Warp the design onto the printmap surface → a fresh RGBA raw buffer (pmW × pmH × 4), transparent
 * wherever the printmap is (off the printable surface, or off the printed arc). Bilinear-samples.
 */
export function cylinderWarp(i: CylinderWarpInput): Buffer {
  const { design, srcW, srcH, printAlpha, pmW, pmH, visibleArcDeg, printedArcDeg, centerDeg, mirror } = i;
  const out = Buffer.alloc(pmW * pmH * 4); // all-zero = transparent
  if (srcW < 2 || srcH < 2 || pmW < 2 || pmH < 2 || printedArcDeg <= 0) return out;

  // Per-column vertical span of the printmap + its overall horizontal extent (one pass).
  const top = new Int32Array(pmW).fill(-1);
  const bot = new Int32Array(pmW).fill(-1);
  let x0 = pmW, x1 = -1;
  for (let x = 0; x < pmW; x++) {
    let t = -1, b = -1;
    for (let y = 0; y < pmH; y++) {
      if (printAlpha[y * pmW + x]! > 24) { if (t < 0) t = y; b = y; }
    }
    top[x] = t; bot[x] = b;
    if (t >= 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
  }
  if (x1 < x0) return out; // empty printmap

  const cx = (x0 + x1) / 2;
  const halfW = Math.max(1, (x1 - x0) / 2);
  const sinHalf = Math.sin((Math.min(179, Math.max(1, visibleArcDeg)) / 2) * (Math.PI / 180));

  for (let x = x0; x <= x1; x++) {
    const yt = top[x]!, yb = bot[x]!;
    if (yt < 0) continue;
    // Horizontal: screen x → surface angle θ → design column u (per column).
    let p = (x - cx) / halfW; // −1..1 across the printmap
    if (mirror) p = -p;
    const s = p * sinHalf;
    if (s < -1 || s > 1) continue;
    const thetaDeg = Math.asin(s) * (180 / Math.PI);
    const u = 0.5 + norm180(centerDeg + thetaDeg) / printedArcDeg;
    if (u < 0 || u > 1) continue; // off the printed arc (the handle gap)
    const fx = u * (srcW - 1);
    const ix = Math.floor(fx);
    const tx = fx - ix;
    const ix1 = ix + 1 < srcW ? ix + 1 : ix;

    const h = yb - yt;
    for (let y = yt; y <= yb; y++) {
      // Vertical: fill this column's printmap span → the design follows the curved contour.
      const v = h > 0 ? (y - yt) / h : 0;
      const fy = v * (srcH - 1);
      const iy = Math.floor(fy);
      const ty = fy - iy;
      const iy1 = iy + 1 < srcH ? iy + 1 : iy;
      const o00 = (iy * srcW + ix) * 4, o10 = (iy * srcW + ix1) * 4;
      const o01 = (iy1 * srcW + ix) * 4, o11 = (iy1 * srcW + ix1) * 4;
      const o = (y * pmW + x) * 4;
      for (let ch = 0; ch < 4; ch++) {
        const tv = design[o00 + ch]! * (1 - tx) + design[o10 + ch]! * tx;
        const bv = design[o01 + ch]! * (1 - tx) + design[o11 + ch]! * tx;
        out[o + ch] = Math.round(tv * (1 - ty) + bv * ty);
      }
    }
  }
  return out;
}
