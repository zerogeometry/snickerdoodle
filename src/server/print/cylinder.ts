/**
 * CYLINDER mockup tier — wrap a flat design onto the visible print SURFACE of a mug, using three
 * founder-authored references plus the product's real dimensions. Pure pixel math, no I/O, so it's
 * exhaustively unit-testable and the child's design never leaves the process.
 *
 *   • PRINTMAP (alpha shape): the visible print surface on the photo — full print height, curved
 *     top/bottom. It does the VERTICAL work: at each column the design fills the printmap's own
 *     top→bottom span, so a horizontal design line follows the mug's curved contour (a REAL bow)
 *     and foreshortens where the surface turns away.
 *   • PRINTCIRCUMFERENCE (ellipse): the mug's circular section projected in the photo. Its centre +
 *     half-width give the EXACT screen-x → surface-angle map (x = cx + a·sinθ ⇒ θ = asin((x−cx)/a)),
 *     so the HORIZONTAL mapping is measured, not guessed.
 *   • PRINTED ARC: the design (cover-fit to the 209mm print) wraps the printed circumference —
 *     circumference minus the handle gap ≈ 292° on an 11oz mug (209mm of a ~258mm circumference).
 *
 * The design's RIGHT edge (u=1) is anchored at the printmap's right edge — the print boundary by
 * the handle — and u steps back by real arc from there. So the FRONT shows the design's right ~half
 * and the BACK (the flopped photo, anchored at its own near-handle edge, u=0) shows the left ~half:
 * the image spans the full printed circumference and the handle gap stays bare, exactly as it prints.
 */

export interface CylinderWarpInput {
  /** RGBA raw pixels of the design — the FULL printed wrap (srcW × srcH × 4). */
  design: Buffer;
  srcW: number;
  srcH: number;
  /** Printmap ALPHA (single channel, pmW × pmH), opaque = the visible printable surface. */
  printAlpha: Buffer;
  pmW: number;
  pmH: number;
  /** The printcircumference ellipse centre-x and half-width, NORMALISED to image width. The caller
   * mirrors cx for the BACK view (the photo is flopped). */
  ellipseCx: number;
  ellipseA: number;
  /** Arc the full printed wrap covers (e.g. ~292° for a 209mm print on an 11oz mug). */
  printedArcDeg: number;
  /** Which wrap view:
   *  • 'front'  — anchor u=1 at the printmap's right (near-handle) edge → shows the design's RIGHT half.
   *  • 'back'   — the photo/printmap are flopped (handle left); anchor u=0 at the left edge → LEFT half.
   *  • 'centre' — the design MIDDLE (u=0.5) faces the viewer at the front centre (θ=0), handle hidden. */
  mode: 'front' | 'back' | 'centre';
}

/** Surface angle (deg) of a screen column via the ellipse projection: x = cx + a·sinθ. */
function thetaAt(xPx: number, cxPx: number, aPx: number): number | null {
  const s = (xPx - cxPx) / aPx;
  if (s < -1 || s > 1) return null;
  return Math.asin(s) * (180 / Math.PI);
}

/**
 * Warp the design onto the printmap surface → a fresh RGBA raw buffer (pmW × pmH × 4), transparent
 * wherever the printmap is off / the design has wrapped out of view. Bilinear-samples.
 */
export function cylinderWarp(i: CylinderWarpInput): Buffer {
  const { design, srcW, srcH, printAlpha, pmW, pmH, ellipseCx, ellipseA, printedArcDeg, mode } = i;
  const out = Buffer.alloc(pmW * pmH * 4); // all-zero = transparent
  if (srcW < 2 || srcH < 2 || pmW < 2 || pmH < 2 || printedArcDeg <= 0 || ellipseA <= 0) return out;

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

  const cxPx = ellipseCx * pmW;
  const aPx = ellipseA * pmW;
  // Anchor the design in u-space. CENTRE puts the design middle (u=0.5) at the front centre (θ=0).
  // FRONT/BACK anchor the design's near-handle EDGE at the printmap's boundary on the handle side
  // (front → right edge u=1; back, flopped → left edge u=0) and step back by real arc.
  const anchorX = mode === 'back' ? x0 : x1;
  const anchorTheta = mode === 'centre' ? 0 : thetaAt(anchorX + 0.5, cxPx, aPx);
  if (anchorTheta === null) return out;
  const anchorU = mode === 'centre' ? 0.5 : mode === 'back' ? 0 : 1;

  for (let x = x0; x <= x1; x++) {
    const yt = top[x]!, yb = bot[x]!;
    if (yt < 0) continue;
    const theta = thetaAt(x + 0.5, cxPx, aPx);
    if (theta === null) continue;
    // u increases with the surface angle; a degree of arc is 1/printedArc of the design width.
    const u = anchorU + (theta - anchorTheta) / printedArcDeg;
    if (u < 0 || u > 1) continue; // wrapped out of view (past a print edge)
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
