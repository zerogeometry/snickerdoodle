import { describe, it, expect } from 'vitest';
import { shadeCushionFace, CUSHION_FACE_DEFAULTS } from '../cushionShade';

const fill = (n: number, v: number) => Buffer.alloc(n, v);

describe('shadeCushionFace', () => {
  it('is identity over the transparent surround (α=0 → fully transparent)', () => {
    const W = 4,
      H = 4;
    const out = shadeCushionFace({ alpha: fill(W * H, 0), dome: fill(W * H, 255), seam: fill(W * H, 255), width: W, height: H });
    expect(out.length).toBe(W * H * 4);
    expect(out.every((b) => b === 0)).toBe(true);
  });

  it('is DARKEN-ONLY, bounded by the floor, grey, and preserves alpha', () => {
    const W = 8,
      H = 8;
    // A dome gradient + a seam gradient + full alpha — the general case.
    const dome = Buffer.alloc(W * H);
    const seam = Buffer.alloc(W * H);
    for (let i = 0; i < W * H; i++) {
      dome[i] = (i * 255) / (W * H - 1);
      seam[i] = 255 - (i % 2) * 90;
    }
    const out = shadeCushionFace({ alpha: fill(W * H, 255), dome, seam, width: W, height: H });
    const floorV = Math.floor(CUSHION_FACE_DEFAULTS.floor * 255);
    for (let idx = 0; idx < W * H; idx++) {
      const o = idx * 4;
      expect(out[o]).toBeLessThanOrEqual(255); // never brightens
      expect(out[o]).toBeGreaterThanOrEqual(floorV); // never below the floor
      expect(out[o]).toBe(out[o + 1]); // neutral grey
      expect(out[o + 1]).toBe(out[o + 2]);
      expect(out[o + 3]).toBe(255); // alpha carried through
    }
  });

  it('a full dome with no seam/dir/weave is the identity (255) — the vivid centre', () => {
    const W = 2,
      H = 2;
    const params = { ...CUSHION_FACE_DEFAULTS, dirAmt: 0, weaveAmt: 0, seamAmt: 0 };
    const out = shadeCushionFace({ alpha: fill(4, 255), dome: fill(4, 255), seam: fill(4, 255), width: W, height: H }, params);
    for (let idx = 0; idx < 4; idx++) expect(out[idx * 4]).toBe(255);
  });

  it('darkens toward the edge — a low dome is darker than a high dome', () => {
    const W = 3,
      H = 1;
    const params = { ...CUSHION_FACE_DEFAULTS, dirAmt: 0, weaveAmt: 0, seamAmt: 0 };
    // edge (blurred to 0.5·255) vs centre (255)
    const dome = Buffer.from([128, 200, 255]);
    const out = shadeCushionFace({ alpha: fill(3, 255), dome, seam: fill(3, 255), width: W, height: H }, params);
    const edge = out[0]!;
    const mid = out[4]!;
    const centre = out[8]!;
    expect(edge).toBeLessThan(mid);
    expect(mid).toBeLessThan(centre);
    expect(centre).toBe(255); // full dome → identity
    expect(edge).toBeCloseTo(Math.round(255 * CUSHION_FACE_DEFAULTS.edgeLo), -1);
  });

  it('the sewn seam darkens the very edge', () => {
    const W = 2,
      H = 1;
    const params = { ...CUSHION_FACE_DEFAULTS, dirAmt: 0, weaveAmt: 0 };
    // both at full dome; pixel 0 is deep seam (0), pixel 1 is interior (255)
    const out = shadeCushionFace({ alpha: fill(2, 255), dome: fill(2, 255), seam: Buffer.from([0, 255]), width: W, height: H }, params);
    expect(out[0]!).toBeLessThan(out[4]!);
    expect(out[4]!).toBe(255);
  });
});
