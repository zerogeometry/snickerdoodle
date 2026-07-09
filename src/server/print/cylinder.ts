/**
 * CYLINDER mockup tier — wrap a flat design around the visible face of a mug photographed
 * head-on, so the art curves with the ceramic (compresses toward the mug's edges) instead of
 * sitting flat. Pure pixel math (an orthographic cylinder projection), no I/O, so it's
 * exhaustively unit-testable and the child's design never leaves the process.
 *
 * Geometry: the mug is a cylinder seen orthographically. A surface point at angle θ (θ=0 is the
 * point facing the camera) projects to screen x = cx + (bandW/2)·sin(θ)/sin(A), where the visible
 * front face spans the arc [−A, +A] and fills the band's width. Inverting per OUTPUT pixel:
 * sin(θ) = p·sin(A) with p the pixel's signed position across the band, θ = asin(...). The design
 * is the FULL printed wrap (its width = wrapDeg of circumference); the design column for a surface
 * angle is u = 0.5 + normalise(centerDeg + θ)/wrapDeg. Angles off the printed arc (the handle gap)
 * fall outside [0,1] → transparent, so the bare mug shows exactly where nothing prints.
 *
 * The back view (centerDeg=180 on a horizontally-flopped photo, mirror=true so the art itself is
 * NOT mirrored) shows the two ends of the wrap meeting around the handle — physically honest.
 */

export interface CylinderWarpInput {
  /** RGBA raw pixels of the design — the FULL printed wrap (srcW × srcH × 4). */
  design: Buffer;
  srcW: number;
  srcH: number;
  /** The visible print band on the product photo, in canvas px (axis-aligned). */
  band: { x: number; y: number; w: number; h: number };
  canvasW: number;
  canvasH: number;
  /** Visible front arc of the mug that the band spans, in degrees (e.g. 160). */
  arcDeg: number;
  /** Total arc the printed wrap covers, in degrees (e.g. 290 for a 209mm wrap). */
  wrapDeg: number;
  /** Which surface angle sits at the band centre: 0 = front, 180 = back. */
  centerDeg: number;
  /** Mirror the horizontal parameter — used with a flopped photo so the BACK view's art
   * reads the right way round (handle on the left) instead of being left-right reversed. */
  mirror?: boolean;
}

/** Normalise an angle in degrees to (−180, 180]. */
function norm180(deg: number): number {
  let d = ((deg + 180) % 360 + 360) % 360 - 180;
  if (d <= -180) d += 360;
  return d;
}

/**
 * Warp the design onto the mug's visible face → a fresh RGBA raw buffer (canvasW × canvasH × 4),
 * transparent everywhere the design doesn't cover (off-arc, off-band). Iterates only the band's
 * bounding box; bilinear-samples the design.
 */
export function cylinderWarp(i: CylinderWarpInput): Buffer {
  const { design, srcW, srcH, band, canvasW, canvasH, arcDeg, wrapDeg, centerDeg, mirror } = i;
  const out = Buffer.alloc(canvasW * canvasH * 4); // all-zero = transparent
  if (srcW < 2 || srcH < 2 || band.w < 2 || band.h < 2 || wrapDeg <= 0) return out;

  const sinA = Math.sin((Math.min(179, Math.max(1, arcDeg)) / 2) * (Math.PI / 180));
  const cx = band.x + band.w / 2;
  const halfW = band.w / 2;

  const bx0 = Math.max(0, Math.floor(band.x));
  const by0 = Math.max(0, Math.floor(band.y));
  const bx1 = Math.min(canvasW, Math.ceil(band.x + band.w));
  const by1 = Math.min(canvasH, Math.ceil(band.y + band.h));

  for (let x = bx0; x < bx1; x++) {
    // Horizontal: screen x → surface angle θ (per column, so compute once).
    let p = (x + 0.5 - cx) / halfW; // signed position across the band, −1..1
    if (mirror) p = -p;
    const s = p * sinA;
    if (s < -1 || s > 1) continue; // beyond the silhouette edge
    const thetaDeg = Math.asin(s) * (180 / Math.PI);
    const u = 0.5 + norm180(centerDeg + thetaDeg) / wrapDeg;
    if (u < 0 || u > 1) continue; // off the printed arc (the handle gap) → bare mug shows
    const fx = u * (srcW - 1);
    const ix = Math.floor(fx);
    const tx = fx - ix;
    const ix1 = ix + 1 < srcW ? ix + 1 : ix;

    for (let y = by0; y < by1; y++) {
      const v = (y + 0.5 - band.y) / band.h; // linear vertical (the front face is near-straight)
      if (v < 0 || v > 1) continue;
      const fy = v * (srcH - 1);
      const iy = Math.floor(fy);
      const ty = fy - iy;
      const iy1 = iy + 1 < srcH ? iy + 1 : iy;
      const o00 = (iy * srcW + ix) * 4, o10 = (iy * srcW + ix1) * 4;
      const o01 = (iy1 * srcW + ix) * 4, o11 = (iy1 * srcW + ix1) * 4;
      const o = (y * canvasW + x) * 4;
      for (let ch = 0; ch < 4; ch++) {
        const top = design[o00 + ch]! * (1 - tx) + design[o10 + ch]! * tx;
        const bot = design[o01 + ch]! * (1 - tx) + design[o11 + ch]! * tx;
        out[o + ch] = Math.round(top * (1 - ty) + bot * ty);
      }
    }
  }
  return out;
}
