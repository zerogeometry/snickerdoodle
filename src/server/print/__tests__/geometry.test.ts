import { describe, expect, it } from 'vitest';
import {
  assessResolution,
  canvasSizePx,
  clampTransform,
  computeLayerRect,
  type TemplateGeom,
  type Transform,
} from '@/server/print/geometry';

const sq = (printPx: number, dpi = 300, bleedMm = 0): TemplateGeom => ({
  printWidthPx: printPx,
  printHeightPx: printPx,
  bleedMm,
  requiredDpi: dpi,
});
const T = (over: Partial<Transform> = {}): Transform => ({ scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, ...over });

describe('clampTransform — the server-authoritative clamp', () => {
  it('clamps scale to [1, 4]', () => {
    expect(clampTransform({ scale: 0.2 }).scale).toBe(1);
    expect(clampTransform({ scale: 99 }).scale).toBe(4);
    expect(clampTransform({ scale: Number.NaN }).scale).toBe(1);
  });
  it('clamps offsets to [-1, 1]', () => {
    expect(clampTransform({ offsetX: -5, offsetY: 5 })).toMatchObject({ offsetX: -1, offsetY: 1 });
  });
  const rot: Array<[number, number]> = [
    [0, 0],
    [90, 90],
    [180, 180],
    [270, 270],
    [44, 0],
    [46, 90],
    [360, 0],
    [-90, 270],
  ];
  for (const [input, expected] of rot) {
    it(`snaps rotation ${input}° → ${expected}°`, () => expect(clampTransform({ rotationDeg: input }).rotationDeg).toBe(expected));
  }
});

describe('canvasSizePx — print area + bleed', () => {
  it('adds bleed on every side', () => {
    const c = canvasSizePx({ printWidthPx: 2000, printHeightPx: 3000, bleedMm: 3, requiredDpi: 300 });
    expect(c.bleedPx).toBe(35); // 3mm @ 300dpi
    expect(c).toMatchObject({ width: 2070, height: 3070 });
  });
});

describe('computeLayerRect — cover-fit', () => {
  it('a matching square source exactly covers the canvas, centred', () => {
    const r = computeLayerRect(sq(1000), { width: 1000, height: 1000 }, T());
    expect(r).toMatchObject({ x: 0, y: 0, width: 1000, height: 1000, canvasWidth: 1000, canvasHeight: 1000 });
  });
  it('zoom enlarges and the extract window stays inside the drawn art', () => {
    const r = computeLayerRect(sq(1000), { width: 1000, height: 1000 }, T({ scale: 2 }));
    expect(r.width).toBe(2000);
    // canvas window in layer coords = (-x, -y); must be ≥ 0 and fit
    expect(-r.x).toBeGreaterThanOrEqual(0);
    expect(-r.x + r.canvasWidth).toBeLessThanOrEqual(r.width);
  });
  it('always covers the canvas (drawn art ≥ canvas in both dims)', () => {
    for (const s of [{ width: 800, height: 1600 }, { width: 3000, height: 1000 }, { width: 500, height: 500 }]) {
      const r = computeLayerRect({ printWidthPx: 1200, printHeightPx: 1800, bleedMm: 3, requiredDpi: 300 }, s, T());
      expect(r.width).toBeGreaterThanOrEqual(r.canvasWidth);
      expect(r.height).toBeGreaterThanOrEqual(r.canvasHeight);
    }
  });
  it('rotation 90 swaps the effective source aspect', () => {
    const land = { width: 2000, height: 1000 };
    const r = computeLayerRect(sq(1000), land, T({ rotationDeg: 90 }));
    // effective source becomes 1000×2000 (portrait) → cover a 1000² canvas
    expect(r.height).toBeGreaterThanOrEqual(r.width);
  });
});

describe('assessResolution — the DPI gate', () => {
  const t = sq(2000); // needs 2000px across at 300dpi

  it('a big enough source → OK, no upscale', () => {
    const a = assessResolution(t, { width: 3000, height: 3000 }, T());
    expect(a).toMatchObject({ decision: 'OK', tier: 0 });
    expect(a.effectiveDpi).toBeGreaterThanOrEqual(300);
  });
  it('2× short → UPSCALE tier 0 (classical)', () => {
    const a = assessResolution(t, { width: 1000, height: 1000 }, T());
    expect(a).toMatchObject({ decision: 'UPSCALE', tier: 0 });
    expect(a.effectiveDpi).toBe(150);
    expect(a.upscaleFactor).toBeCloseTo(2, 5);
  });
  it('~3.3× short → UPSCALE tier 1 (ML)', () => {
    const a = assessResolution(t, { width: 600, height: 600 }, T());
    expect(a).toMatchObject({ decision: 'UPSCALE', tier: 1 });
  });
  it('far too small → BLOCK', () => {
    const a = assessResolution(t, { width: 300, height: 300 }, T());
    expect(a.decision).toBe('BLOCK');
  });
  it('zooming a big source in can drop it below the DPI requirement', () => {
    const ok = assessResolution(t, { width: 3000, height: 3000 }, T());
    const zoomed = assessResolution(t, { width: 3000, height: 3000 }, T({ scale: 4 }));
    expect(ok.decision).toBe('OK');
    expect(zoomed.effectiveDpi).toBeLessThan(ok.effectiveDpi);
  });
});
