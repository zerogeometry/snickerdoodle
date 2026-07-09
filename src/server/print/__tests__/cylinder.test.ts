import { describe, expect, it } from 'vitest';
import { cylinderWarp } from '../cylinder';

/** Design where each COLUMN carries a distinct red = its index, so a warped pixel's red tells us
 * which design column it sampled. GREEN carries the row, so green tells us which row it sampled. */
function rampDesign(w: number, h: number): Buffer {
  const buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      buf[o] = Math.round((x / (w - 1)) * 255); // red = column
      buf[o + 1] = Math.round((y / (h - 1)) * 255); // green = row
      buf[o + 3] = 255;
    }
  }
  return buf;
}

/** A single-channel printmap alpha (pmW × pmH). `span(x)` returns [top,bottom] opaque rows for
 * column x, or null for a bare column — lets a test author any surface contour. */
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

describe('cylinderWarp (printmap-driven)', () => {
  const pmW = 120, pmH = 80;
  const srcW = 256, srcH = 64;
  const design = rampDesign(srcW, srcH);
  // A rectangular printmap: columns 30..90 opaque, rows 20..60.
  const rectMap = printmap(pmW, pmH, (x) => (x >= 30 && x <= 90 ? [20, 60] : null));
  const base = { design, srcW, srcH, printAlpha: rectMap, pmW, pmH, visibleArcDeg: 180, printedArcDeg: 360, centerDeg: 0 };

  it('samples the design CENTRE at the printmap centre (θ=0 ⇒ u=0.5)', () => {
    const out = cylinderWarp(base);
    const cx = 60, cy = 40;
    expect(R(out, pmW, cx, cy)).toBeGreaterThan(118);
    expect(R(out, pmW, cx, cy)).toBeLessThan(138);
  });

  it('fills the printmap column top→bottom (green ramps over the opaque span)', () => {
    const out = cylinderWarp(base);
    const x = 60; // centre column, opaque rows 20..60
    expect(G(out, pmW, x, 21)).toBeLessThan(40); // near the top → low row
    expect(G(out, pmW, x, 59)).toBeGreaterThan(215); // near the bottom → high row
    expect(A(out, pmW, x, 20)).toBe(255);
    expect(A(out, pmW, x, 61)).toBe(0); // just below the printmap span → untouched
  });

  it('follows a CURVED contour — a taller centre column fills a taller span than an edge column', () => {
    // Barrel printmap: centre columns span more rows than the edges.
    const curved = printmap(pmW, pmH, (x) => {
      if (x < 30 || x > 90) return null;
      const t = Math.abs(x - 60) / 30; // 0 centre → 1 edge
      const pad = Math.round(t * 15);
      return [20 + pad, 60 - pad];
    });
    const out = cylinderWarp({ ...base, printAlpha: curved });
    // Centre column has content near the top row it occupies; edge column's top is lower on screen.
    // The design's TOP row (green≈0) appears at the column's own yTop → different screen y per column.
    const topOfCentre = (() => { for (let y = 0; y < pmH; y++) if (A(out, pmW, 60, y) === 255) return y; return -1; })();
    const topOfEdge = (() => { for (let y = 0; y < pmH; y++) if (A(out, pmW, 33, y) === 255) return y; return -1; })();
    expect(topOfCentre).toBeGreaterThanOrEqual(20);
    expect(topOfEdge).toBeGreaterThan(topOfCentre); // edge span starts lower → the contour bows
  });

  it('compresses horizontally toward the edges (non-linear arcsine)', () => {
    const out = cylinderWarp(base);
    const y = 40;
    const cx = 60, halfW = 30;
    // A quarter-width right of centre maps LESS far into the design than a linear map would.
    const qx = cx + Math.round(halfW / 2);
    const linearCol = 0.5 * 255 + 0.25 * 0.5 * 255; // ≈ 159
    expect(R(out, pmW, qx, y)).toBeLessThan(linearCol);
    expect(R(out, pmW, qx, y)).toBeGreaterThan(0.5 * 255);
  });

  it('off the printmap → transparent (the product photo shows)', () => {
    const out = cylinderWarp(base);
    expect(A(out, pmW, 5, 5)).toBe(0); // outside the opaque columns
    expect(A(out, pmW, 60, 5)).toBe(0); // above the opaque span
  });

  it('mirror flips the horizontal sampling (BACK view art reads un-reversed)', () => {
    const y = 40;
    const x = 60 + 20; // right of centre
    const normal = cylinderWarp(base);
    const mirrored = cylinderWarp({ ...base, mirror: true });
    const dN = R(normal, pmW, x, y) - 0.5 * 255;
    const dM = R(mirrored, pmW, x, y) - 0.5 * 255;
    expect(Math.sign(dN)).toBe(-Math.sign(dM));
  });

  it('shows only the central fraction of the design (visibleArc / printedArc)', () => {
    // visible 180° of a 360° wrap ⇒ the front shows the central half: design u ∈ [0.25, 0.75].
    const out = cylinderWarp(base);
    const y = 40;
    // leftmost opaque column samples near u=0.25 (red≈64), rightmost near u=0.75 (red≈191).
    expect(R(out, pmW, 31, y)).toBeLessThan(90);
    expect(R(out, pmW, 89, y)).toBeGreaterThan(165);
  });
});
