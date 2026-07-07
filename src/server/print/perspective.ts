/**
 * PERSPECTIVE mockup tier — map a rectangular design onto a 4-corner quad on an angled
 * product photo (e.g. the jigsaw tin lid). Pure pixel math (a homography), no I/O, so it's
 * exhaustively unit-testable and the child's design never leaves the process.
 *
 * The design's own corners — TL,TR,BR,BL of its rectangle — map to the quad's corners. Every
 * OUTPUT pixel inside the quad is inverse-mapped through the homography back to a design (u,v)
 * and bilinear-sampled, so straight lines stay straight and the foreshortening is exact (no
 * two-triangle crease). Outside the quad the output is transparent (the product photo shows).
 */

export type Quad = [number, number][]; // TL, TR, BR, BL, in canvas px

/**
 * The homography (row-major 3×3) mapping the UNIT SQUARE (0,0)(1,0)(1,1)(0,1) → the quad
 * (TL,TR,BR,BL). Heckbert's classic square→quad construction; falls back to the affine case
 * when the quad is a parallelogram (no perspective term).
 */
export function squareToQuad(q: Quad): number[] {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q as [[number, number], [number, number], [number, number], [number, number]];
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    // affine (parallelogram)
    return [x1 - x0, x3 - x0, x0, y1 - y0, y3 - y0, y0, 0, 0, 1];
  }
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const h = (dx1 * dy3 - dx3 * dy1) / den;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}

/** Inverse of a row-major 3×3 matrix. Returns null if singular (a degenerate quad). */
export function invert3(m: number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = m as [number, number, number, number, number, number, number, number, number];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  return [
    A * inv, (c * h - b * i) * inv, (b * f - c * e) * inv,
    B * inv, (a * i - c * g) * inv, (c * d - a * f) * inv,
    C * inv, (b * g - a * h) * inv, (a * e - b * d) * inv,
  ];
}

export interface PerspectiveWarpInput {
  /** RGBA raw pixels of the design (srcW × srcH × 4). */
  design: Buffer;
  srcW: number;
  srcH: number;
  /** Destination corners TL,TR,BR,BL in canvas px. */
  quad: Quad;
  canvasW: number;
  canvasH: number;
}

/**
 * Warp the design onto the quad → a fresh RGBA raw buffer (canvasW × canvasH × 4), transparent
 * outside the quad. Iterates only the quad's bounding box; bilinear-samples the design.
 */
export function perspectiveWarp(i: PerspectiveWarpInput): Buffer {
  const { design, srcW, srcH, quad, canvasW, canvasH } = i;
  const out = Buffer.alloc(canvasW * canvasH * 4); // all-zero = transparent
  const Hinv = invert3(squareToQuad(quad));
  if (!Hinv || srcW < 2 || srcH < 2) return out; // degenerate → nothing drawn (caller falls back)
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = Hinv as [number, number, number, number, number, number, number, number, number];

  const xs = quad.map((p) => p[0]);
  const ys = quad.map((p) => p[1]);
  const bx0 = Math.max(0, Math.floor(Math.min(...xs)));
  const by0 = Math.max(0, Math.floor(Math.min(...ys)));
  const bx1 = Math.min(canvasW, Math.ceil(Math.max(...xs)));
  const by1 = Math.min(canvasH, Math.ceil(Math.max(...ys)));

  for (let y = by0; y < by1; y++) {
    for (let x = bx0; x < bx1; x++) {
      const w = m6 * x + m7 * y + m8;
      if (w === 0) continue;
      const u = (m0 * x + m1 * y + m2) / w;
      const v = (m3 * x + m4 * y + m5) / w;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue; // outside the design → leave transparent
      // Bilinear sample the design at (u·(srcW-1), v·(srcH-1)).
      const fx = u * (srcW - 1), fy = v * (srcH - 1);
      const ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = fx - ix, ty = fy - iy;
      const ix1 = ix + 1 < srcW ? ix + 1 : ix;
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
