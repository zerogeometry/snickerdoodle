import { describe, expect, it } from 'vitest';
import { minAreaRectCorners } from '../seedMockups';

/** A filled, rotated, ROUNDED rectangle (a playing card) as an alpha plane. */
function roundedCard(W: number, H: number, cx: number, cy: number, w: number, h: number, deg: number, r: number) {
  const a = new Uint8Array(W * H);
  const t = (deg * Math.PI) / 180, cs = Math.cos(t), sn = Math.sin(t);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      // into the card's own frame
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const u = Math.abs(dx * cs + dy * sn), v = Math.abs(-dx * sn + dy * cs);
      const qx = u - (w / 2 - r), qy = v - (h / 2 - r);
      const inside = qx <= 0 || qy <= 0 ? u <= w / 2 && v <= h / 2 : Math.hypot(qx, qy) <= r;
      if (inside) a[y * W + x] = 255;
    }
  return a;
}

describe('minAreaRectCorners — a tilted card’s TRUE corners (the art reaches the straight edges)', () => {
  const W = 800, H = 800, cx = 420, cy = 380, w = 300, h = 420, deg = 8.6, r = 26;
  const alpha = roundedCard(W, H, cx, cy, w, h, deg, r);
  const corners = minAreaRectCorners(alpha, W, H, 1)!;

  it('finds the sharp corners, not points on the rounded arcs, in TL, TR, BR, BL order', () => {
    const t = (deg * Math.PI) / 180, cs = Math.cos(t), sn = Math.sin(t);
    const at = (u: number, v: number) => [(cx + u * cs - v * sn) / W, (cy + u * sn + v * cs) / H];
    const expected = [at(-w / 2, -h / 2), at(w / 2, -h / 2), at(w / 2, h / 2), at(-w / 2, h / 2)];
    corners.forEach(([x, y], i) => {
      expect(Math.abs(x - expected[i]![0]!) * W, `corner ${i} x`).toBeLessThan(2.5);
      expect(Math.abs(y - expected[i]![1]!) * H, `corner ${i} y`).toBeLessThan(2.5);
    });
  });

  it('keeps the card’s proportions (so the print file isn’t squashed)', () => {
    const d = (p: number[], q: number[]) => Math.hypot((p[0]! - q[0]!) * W, (p[1]! - q[1]!) * H);
    expect(d(corners[0]!, corners[1]!) / d(corners[1]!, corners[2]!)).toBeCloseTo(w / h, 2);
  });

  it('returns null for an empty print area', () => {
    expect(minAreaRectCorners(new Uint8Array(100), 10, 10)).toBeNull();
  });
});
