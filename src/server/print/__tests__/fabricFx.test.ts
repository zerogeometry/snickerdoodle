import { describe, expect, it } from 'vitest';
import { applyFabricFx, hardLight, MATERIAL_FX, meanLuma } from '../fabricFx';

/** Build a W×H RGBA buffer filled with one colour. */
function rgba(W: number, H: number, [r, g, b, a]: [number, number, number, number]): Buffer {
  const buf = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    buf[i * 4] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = a;
  }
  return buf;
}

/** Single-channel buffer at a constant value. */
function gray(W: number, H: number, v: number): Buffer {
  return Buffer.alloc(W * H, v);
}

describe('fabricFx — the honesty guarantee: a flat region is an identity op', () => {
  it('uniform blank (ANY level, e.g. a pure-white frame window) changes nothing', () => {
    const W = 16;
    const H = 16;
    const design = rgba(W, H, [200, 120, 60, 255]);
    for (const level of [0, 128, 255]) {
      const out = applyFabricFx({
        design,
        width: W,
        height: H,
        blankGray: gray(W, H, level),
        blankGrayBlur: gray(W, H, level),
        displaceStrength: 8,
        shadeAmount: 1,
      });
      expect(Buffer.compare(out, design)).toBe(0); // byte-identical
    }
  });

  it('zero strengths are a strict no-op even over a textured blank', () => {
    const W = 8;
    const H = 8;
    const design = rgba(W, H, [10, 200, 90, 255]);
    const textured = Buffer.from(Array.from({ length: W * H }, (_, i) => (i * 37) % 256));
    const out = applyFabricFx({
      design,
      width: W,
      height: H,
      blankGray: textured,
      blankGrayBlur: textured,
      displaceStrength: 0,
      shadeAmount: 0,
    });
    expect(Buffer.compare(out, design)).toBe(0);
  });
});

describe('fabricFx — displacement', () => {
  it('shifts sampling along the fold field by the expected amount', () => {
    // Design: left half red, right half blue, sharp vertical edge at x=8.
    const W = 16;
    const H = 4;
    const design = Buffer.alloc(W * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4;
        design[o] = x < 8 ? 255 : 0; // red left
        design[o + 2] = x < 8 ? 0 : 255; // blue right
        design[o + 3] = 255;
      }
    // Fold field: uniformly brighter than its mean is impossible — so make a two-band
    // field (dark band, bright band) and check the bright band pulls samples FORWARD.
    const blur = Buffer.alloc(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) blur[y * W + x] = y < 2 ? 64 : 192; // mean = 128
    const out = applyFabricFx({
      design,
      width: W,
      height: H,
      blankGray: gray(W, H, 128), // no shading
      blankGrayBlur: blur,
      displaceStrength: 4, // (192−128)/128·4 = +2px in the bright band
      shadeAmount: 0,
    });
    // In the bright band (y=3), the pixel at x=7 samples from (9, y+2→clamped) — blue.
    const o = (3 * W + 7) * 4;
    expect(out[o + 2]).toBeGreaterThan(200); // blue now
    expect(out[o]).toBeLessThan(60);
    // In the dark band (y=0), x=8 samples from x−2=6 — red.
    const o2 = (0 * W + 8) * 4;
    expect(out[o2]).toBeGreaterThan(200); // red now
  });
});

describe('fabricFx — shading', () => {
  it('darkens art under the blank’s shadows, keeps highlights lifting, never touches transparent margins', () => {
    const W = 8;
    const H = 2;
    // top row: opaque grey art; bottom row: fully transparent
    const design = Buffer.alloc(W * H * 4);
    for (let x = 0; x < W; x++) {
      const o = x * 4;
      design[o] = 180;
      design[o + 1] = 180;
      design[o + 2] = 180;
      design[o + 3] = 255;
    }
    // blank: left half deep shadow (40), right half bright highlight (216); mean 128
    const g = Buffer.alloc(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = x < 4 ? 40 : 216;
    const out = applyFabricFx({
      design,
      width: W,
      height: H,
      blankGray: g,
      blankGrayBlur: gray(W, H, 128),
      displaceStrength: 0,
      shadeAmount: 1,
    });
    const shadowPx = out[1 * 4]!; // x=1, opaque row
    const lightPx = out[6 * 4]!; // x=6
    expect(shadowPx).toBeLessThan(180); // shadow darkens the art
    expect(lightPx).toBeGreaterThan(180); // highlight lifts it
    // transparent margin untouched (alpha 0 everywhere on row 2)
    for (let x = 0; x < W; x++) expect(out[(W + x) * 4 + 3]).toBe(0);
  });

  it('hardLight is EXACT identity at the neutral point, black at 0, white at 255', () => {
    for (const d of [0, 60, 128, 200, 255]) expect(hardLight(d, 128)).toBe(d);
    expect(hardLight(200, 0)).toBe(0);
    expect(hardLight(60, 255)).toBe(255);
  });

  it('meanLuma averages a flat buffer to its level', () => {
    expect(meanLuma(gray(10, 10, 77))).toBe(77);
  });
});

describe('MATERIAL_FX — material honesty', () => {
  it('rigid surfaces never displace the art', () => {
    expect(MATERIAL_FX.CERAMIC!.disp).toBe(0);
    expect(MATERIAL_FX.GLOSS!.disp).toBe(0);
  });
  it('fabrics fold the most', () => {
    expect(MATERIAL_FX.LIGHT_FABRIC!.disp).toBeGreaterThan(MATERIAL_FX.PAPER!.disp);
  });
});
