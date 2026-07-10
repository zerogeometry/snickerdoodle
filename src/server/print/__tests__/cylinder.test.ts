import { describe, expect, it } from 'vitest';
import { cylinderWarp } from '../cylinder';

/** Design where RED encodes the column (which u it came from) and GREEN the row. */
function rampDesign(w: number, h: number): Buffer {
  const buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      buf[o] = Math.round((x / (w - 1)) * 255); // red = column (u)
      buf[o + 1] = Math.round((y / (h - 1)) * 255); // green = row (v)
      buf[o + 3] = 255;
    }
  }
  return buf;
}

/** Single-channel printmap alpha (pmW × pmH). `span(x)` → [top,bottom] opaque rows or null. */
function printmap(pmW: number, pmH: number, span: (x: number) => [number, number] | null): Buffer {
  const a = Buffer.alloc(pmW * pmH);
  for (let x = 0; x < pmW; x++) {
    const s = span(x);
    if (!s) continue;
    for (let y = s[0]; y <= s[1]; y++) a[y * pmW + x] = 255;
  }
  return a;
}

const A = (buf: Buffer, W: number, x: number, y: number) => buf[(y * W + x) * 4 + 3]!;
const R = (buf: Buffer, W: number, x: number, y: number) => buf[(y * W + x) * 4]!;
const G = (buf: Buffer, W: number, x: number, y: number) => buf[(y * W + x) * 4 + 1]!;

describe('cylinderWarp (printmap + ellipse, full-circumference wrap)', () => {
  const pmW = 200, pmH = 80;
  const srcW = 256, srcH = 64;
  const design = rampDesign(srcW, srcH);
  // Ellipse centred with the printmap; half-width a bit wider than the printmap so its edges map to
  // real angles inside ±90°. Printmap opaque columns 40..160, rows 20..60.
  const ellipseCx = 0.5, ellipseA = 0.42;
  const rectMap = printmap(pmW, pmH, (x) => (x >= 40 && x <= 160 ? [20, 60] : null));
  const base = { design, srcW, srcH, printAlpha: rectMap, pmW, pmH, ellipseCx, ellipseA, printedArcDeg: 292, mode: 'front' as const };

  const rowSpan = (out: Buffer, x: number): [number, number] => {
    let t = -1, b = -1;
    for (let y = 0; y < pmH; y++) if (A(out, pmW, x, y) === 255) { if (t < 0) t = y; b = y; }
    return [t, b];
  };

  it('anchors the design RIGHT edge (u=1) at the printmap right edge — the print boundary by the handle', () => {
    const out = cylinderWarp(base);
    expect(R(out, pmW, 159, 40)).toBeGreaterThan(245); // rightmost opaque column ≈ u=1 (red≈255)
  });

  it('FRONT shows the design RIGHT portion (u well above 0.5 across the surface)', () => {
    const out = cylinderWarp(base);
    const y = 40;
    // leftmost opaque column is still the RIGHT half of the design (u ≳ 0.45), not the centre.
    expect(R(out, pmW, 41, y)).toBeGreaterThan(110);
    // and u rises monotonically to the right toward 1.0
    expect(R(out, pmW, 100, y)).toBeGreaterThan(R(out, pmW, 41, y));
    expect(R(out, pmW, 159, y)).toBeGreaterThan(R(out, pmW, 100, y));
  });

  it('CENTRE puts the design middle (u=0.5) at the front centre', () => {
    const out = cylinderWarp({ ...base, mode: 'centre' });
    // centre column samples design centre (red≈128); it stays under 1.0 at the edges (not anchored).
    expect(R(out, pmW, 100, 40)).toBeGreaterThan(118);
    expect(R(out, pmW, 100, 40)).toBeLessThan(138);
    expect(R(out, pmW, 41, 40)).toBeLessThan(120); // left of centre → u<0.5
    expect(R(out, pmW, 159, 40)).toBeGreaterThan(135); // right of centre → u>0.5
  });

  it('BACK shows the design LEFT portion (anchored u=0 at its near-handle edge)', () => {
    const out = cylinderWarp({ ...base, mode: 'back', ellipseCx: 1 - ellipseCx });
    const y = 40;
    // Back anchors u=0 at the printmap's left (near-handle, flopped) edge → low red there.
    expect(R(out, pmW, 41, y)).toBeLessThan(20);
    // and u rises to the right but stays in the LEFT half (well under 1.0).
    expect(R(out, pmW, 159, y)).toBeGreaterThan(R(out, pmW, 41, y));
    expect(R(out, pmW, 159, y)).toBeLessThan(170);
  });

  it('compresses horizontally toward the edges (the ellipse arcsine projection)', () => {
    const out = cylinderWarp(base);
    const y = 40;
    // Equal screen steps near the edge cover MORE arc (u) than near the centre → non-linear.
    const duEdge = R(out, pmW, 159, y) - R(out, pmW, 149, y);
    const duCentre = R(out, pmW, 105, y) - R(out, pmW, 95, y);
    expect(duEdge).toBeGreaterThan(duCentre);
  });

  it('fills each printmap column top→bottom (green ramps over its span)', () => {
    const out = cylinderWarp(base);
    const x = 100;
    expect(G(out, pmW, x, 21)).toBeLessThan(40);
    expect(G(out, pmW, x, 59)).toBeGreaterThan(215);
  });

  it('follows a CURVED contour — a taller centre column starts higher than a shorter edge column', () => {
    const curved = printmap(pmW, pmH, (x) => {
      if (x < 40 || x > 160) return null;
      const t = Math.abs(x - 100) / 60;
      const pad = Math.round(t * 14);
      return [20 + pad, 60 - pad];
    });
    const out = cylinderWarp({ ...base, printAlpha: curved });
    expect(rowSpan(out, 100)[0]).toBeLessThan(rowSpan(out, 45)[0]); // centre top higher than edge top
  });

  it('off the printmap → transparent (the product photo shows)', () => {
    const out = cylinderWarp(base);
    expect(A(out, pmW, 5, 5)).toBe(0);
    expect(A(out, pmW, 100, 5)).toBe(0); // above the opaque span
  });
});
