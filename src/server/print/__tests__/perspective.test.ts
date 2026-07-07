import { describe, expect, it } from 'vitest';
import { invert3, perspectiveWarp, squareToQuad, type Quad } from '../perspective';

function apply(H: number[], x: number, y: number): [number, number] {
  const w = H[6]! * x + H[7]! * y + H[8]!;
  return [(H[0]! * x + H[1]! * y + H[2]!) / w, (H[3]! * x + H[4]! * y + H[5]!) / w];
}
const near = (a: [number, number], b: [number, number]) => {
  expect(a[0]).toBeCloseTo(b[0], 4);
  expect(a[1]).toBeCloseTo(b[1], 4);
};

describe('squareToQuad — the unit square maps to the quad corners', () => {
  it('maps (0,0)(1,0)(1,1)(0,1) → TL,TR,BR,BL (perspective quad)', () => {
    const q: Quad = [[10, 20], [110, 25], [105, 130], [8, 120]];
    const H = squareToQuad(q);
    near(apply(H, 0, 0), q[0] as [number, number]);
    near(apply(H, 1, 0), q[1] as [number, number]);
    near(apply(H, 1, 1), q[2] as [number, number]);
    near(apply(H, 0, 1), q[3] as [number, number]);
  });
  it('the tin lid quad round-trips its corners exactly', () => {
    const q: Quad = [[452, 232], [682, 321], [452, 618], [209, 513]]; // detected from printmap.png
    const H = squareToQuad(q);
    near(apply(H, 0, 0), [452, 232]);
    near(apply(H, 1, 1), [452, 618]);
  });
  it('a parallelogram gives a pure affine map (no perspective term)', () => {
    const H = squareToQuad([[0, 0], [100, 0], [100, 50], [0, 50]]);
    expect(H[6]).toBe(0);
    expect(H[7]).toBe(0);
  });
});

describe('invert3', () => {
  it('H · H⁻¹ = I', () => {
    const H = squareToQuad([[10, 20], [110, 25], [105, 130], [8, 120]]);
    const Hi = invert3(H)!;
    const mul = (A: number[], B: number[]) =>
      Array.from({ length: 9 }, (_, k) => {
        const r = Math.floor(k / 3) * 3, c = k % 3;
        return A[r]! * B[c]! + A[r + 1]! * B[c + 3]! + A[r + 2]! * B[c + 6]!;
      });
    const I = mul(H, Hi);
    [I[0], I[4], I[8]].forEach((v) => expect(v).toBeCloseTo(1, 6));
    [I[1], I[2], I[3], I[5], I[6], I[7]].forEach((v) => expect(v).toBeCloseTo(0, 6));
  });
  it('returns null for a singular matrix', () => {
    expect(invert3([1, 2, 3, 2, 4, 6, 1, 1, 1])).toBeNull(); // row1 = 2·row0
  });
});

describe('perspectiveWarp — the design lands inside the quad, in the right orientation', () => {
  it('fills the quad opaque, leaves outside transparent', () => {
    const srcW = 4, srcH = 4;
    const design = Buffer.alloc(srcW * srcH * 4);
    for (let i = 0; i < srcW * srcH; i++) {
      design[i * 4] = 200; design[i * 4 + 1] = 50; design[i * 4 + 2] = 50; design[i * 4 + 3] = 255;
    }
    const quad: Quad = [[10, 10], [30, 10], [30, 30], [10, 30]];
    const out = perspectiveWarp({ design, srcW, srcH, quad, canvasW: 40, canvasH: 40 });
    const a = (x: number, y: number, ch: number) => out[(y * 40 + x) * 4 + ch]!;
    expect(a(20, 20, 3)).toBe(255); // centre opaque
    expect(a(20, 20, 0)).toBeGreaterThan(150); // red
    expect(a(2, 2, 3)).toBe(0); // outside transparent
    expect(a(38, 38, 3)).toBe(0);
  });

  it('a corner colour lands at the matching quad corner (TL,TR,BR,BL)', () => {
    // 2×2 design: TL red, TR green, BL yellow, BR blue.
    const design = Buffer.from([
      220, 40, 40, 255, 40, 180, 40, 255,
      220, 200, 40, 255, 40, 40, 200, 255,
    ]);
    const quad: Quad = [[10, 10], [110, 10], [110, 110], [10, 110]];
    const out = perspectiveWarp({ design, srcW: 2, srcH: 2, quad, canvasW: 120, canvasH: 120 });
    const at = (x: number, y: number) => [out[(y * 120 + x) * 4]!, out[(y * 120 + x) * 4 + 1]!, out[(y * 120 + x) * 4 + 2]!];
    const tl = at(14, 14); expect(tl[0]!).toBeGreaterThan(tl[1]!); expect(tl[0]!).toBeGreaterThan(tl[2]!); // red
    const tr = at(106, 14); expect(tr[1]!).toBeGreaterThan(tr[0]!); expect(tr[1]!).toBeGreaterThan(tr[2]!); // green
    const br = at(106, 106); expect(br[2]!).toBeGreaterThan(br[0]!); expect(br[2]!).toBeGreaterThan(br[1]!); // blue
    const bl = at(14, 106); expect(bl[0]!).toBeGreaterThan(150); expect(bl[1]!).toBeGreaterThan(150); expect(bl[2]!).toBeLessThan(120); // yellow
  });
});
