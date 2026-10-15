import { describe, expect, it } from 'vitest';
import {
  assessResolution,
  canvasSizePx,
  clampTransform,
  computeLayerRect,
  containScale,
  MAX_ZOOM,
  MIN_SCALE,
  MIN_FLOOR_DPI,
  minimumDpi,
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
  it('clamps a numeric scale to [MIN_SCALE, MAX_ZOOM]; zoom-out below cover is valid', () => {
    expect(clampTransform({ scale: 0.01 }).scale).toBe(MIN_SCALE);
    expect(clampTransform({ scale: 0.7 }).scale).toBe(0.7);
    expect(clampTransform({ scale: 99 }).scale).toBe(MAX_ZOOM);
    expect(clampTransform({ scale: Number.NaN }).scale).toBe(1); // missing/invalid → legacy cover
  });
  it('preserves scale ≤ 0 as the CONTAIN sentinel (never corrupted into a crop)', () => {
    expect(clampTransform({ scale: 0 }).scale).toBe(0);
    expect(clampTransform({ scale: -3 }).scale).toBe(0);
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

describe('containScale + the scale-0 CONTAIN sentinel — "fit the whole image"', () => {
  const portrait: TemplateGeom = { printWidthPx: 1000, printHeightPx: 1500, bleedMm: 0, requiredDpi: 300 };

  it('containScale is 1 when the aspects match, < 1 otherwise, rotation-aware', () => {
    expect(containScale(portrait, { width: 500, height: 750 })).toBe(1);
    expect(containScale(portrait, { width: 1000, height: 1000 })).toBeCloseTo(2 / 3, 5); // square on 2:3
    expect(containScale(portrait, { width: 1500, height: 1000 }, 90)).toBe(1); // rotated to match
  });

  it('scale 0 resolves to contain: the whole image inside the canvas, centred', () => {
    const r = computeLayerRect(portrait, { width: 1000, height: 1000 }, T({ scale: 0 }));
    expect(r).toMatchObject({ x: 0, y: 250, width: 1000, height: 1000 }); // fits width; centred in the 1500 height
    expect(r.width).toBeLessThanOrEqual(r.canvasWidth);
    expect(r.height).toBeLessThanOrEqual(r.canvasHeight);
  });

  it('scale 1 still cover-fits — legacy transforms are unchanged', () => {
    const r = computeLayerRect(portrait, { width: 1000, height: 1000 }, T({ scale: 1 }));
    expect(r.width).toBe(1500); // covers the height, overflows the width
    expect(r.x).toBe(-250);
  });

  it('zoomed out (below cover) the art can PAN within the margins, staying inside the canvas', () => {
    // square source contained in a 1000×1500 portrait canvas → 1000×1000, 500px vertical margin
    const centred = computeLayerRect(portrait, { width: 1000, height: 1000 }, T({ scale: 0 }));
    expect(centred).toMatchObject({ x: 0, y: 250 }); // offset 0 = centred (unchanged)
    // offsetY 1 slides it to the BOTTOM edge; offsetY -1 to the TOP — never off-canvas
    const down = computeLayerRect(portrait, { width: 1000, height: 1000 }, T({ scale: 0, offsetY: 1 }));
    expect(down.y).toBe(500); // top at 500 → bottom edge exactly at 1500 (canvas bottom)
    expect(down.y + down.height).toBeLessThanOrEqual(centred.canvasHeight);
    const up = computeLayerRect(portrait, { width: 1000, height: 1000 }, T({ scale: 0, offsetY: -1 }));
    expect(up.y).toBe(0); // top edge exactly at 0
  });

  it('the DPI gate resolves the sentinel too (contain needs FEWER source pixels than cover)', () => {
    const src = { width: 900, height: 900 };
    const cover = assessResolution(portrait, src, T({ scale: 1 }));
    const contain = assessResolution(portrait, src, T({ scale: 0 }));
    expect(contain.effectiveDpi).toBeGreaterThan(cover.effectiveDpi);
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

describe('minimumDpi — how much detail a print needs depends on how far away it’s seen', () => {
  const rect = (wIn: number, hIn: number, dpi: number): TemplateGeom => ({ printWidthPx: Math.round(wIn * dpi), printHeightPx: Math.round(hIn * dpi), bleedMm: 0, requiredDpi: dpi });
  const mug = rect(8.2, 3.9, 300);
  const card = rect(5, 7, 300);
  const frame11x14 = rect(11, 14, 300);
  const frame28x40 = rect(28, 40, 150);
  const bigBlanket = rect(60, 80, 150);

  it('hand-held things keep the old floor (4× enlargement at most)', () => {
    expect(minimumDpi(mug)).toBe(75);
    expect(minimumDpi(card)).toBe(75);
  });

  it('wall art and blankets, seen from further away, need less — never below the floor', () => {
    expect(minimumDpi(frame11x14)).toBeLessThan(75);
    expect(minimumDpi(frame11x14)).toBeGreaterThan(50);
    expect(minimumDpi(frame28x40)).toBeLessThan(minimumDpi(frame11x14));
    expect(minimumDpi(bigBlanket)).toBe(MIN_FLOOR_DPI);
  });

  it('is never stricter than the old flat rule (required ÷ 4)', () => {
    for (const t of [mug, card, frame11x14, frame28x40, bigBlanket, rect(4, 4, 150), rect(12, 12, 150)]) {
      expect(minimumDpi(t)).toBeLessThanOrEqual(t.requiredDpi / 4);
    }
  });

  it('between 2× and the floor it prints, flagged soft up close; below the floor it’s blocked', () => {
    // 11×14 at 300dpi from a 1024px-wide drawing: ~73dpi — soft up close, but it prints
    const soft = assessResolution(frame11x14, { width: 1024, height: 1303 }, T({ scale: 1 }));
    expect(soft.decision).toBe('UPSCALE');
    expect(soft.softUpClose).toBe(true);
    // a proper photo of the drawing: sharp at this size
    const crisp = assessResolution(frame11x14, { width: 3300, height: 4200 }, T({ scale: 1 }));
    expect(crisp.softUpClose).toBe(false);
    // a thumbnail on a big frame: blocked, however far away
    const tiny = assessResolution(frame28x40, { width: 400, height: 571 }, T({ scale: 1 }));
    expect(tiny.decision).toBe('BLOCK');
  });
});
