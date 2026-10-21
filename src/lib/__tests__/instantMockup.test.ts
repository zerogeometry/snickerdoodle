import { describe, expect, it } from 'vitest';
import { instantPlacement, type InstantContext } from '@/lib/instantMockup';
import { mockupKey } from '@/lib/mockupPrefetch';
import { clampTransform } from '@/server/print/geometry';

const ctx = (over: Partial<InstantContext> = {}): InstantContext => ({
  blankUrl: 'b', maskUrl: null, overlayUrl: null,
  quad: [[0.2, 0.1], [0.8, 0.1], [0.8, 0.9], [0.2, 0.9]],
  blankW: 1000, blankH: 1250, material: 'PAPER',
  print: { printWidthPx: 1500, printHeightPx: 2500, bleedMm: 0, requiredDpi: 300 },
  ...over,
});

describe('instant previews — the same placement as the photoreal mockup', () => {
  it('sizes the photo by its own aspect and finds the print area on it', () => {
    const p = instantPlacement(ctx(), 200, { width: 1000, height: 1000 }, clampTransform({ scale: 0 }));
    expect(p.height).toBe(250);
    expect(p.area.left).toBeCloseTo(40, 6);
    expect(p.area.top).toBeCloseTo(25, 6);
    expect(p.area.width).toBeCloseTo(120, 6);
    expect(p.area.height).toBeCloseTo(200, 6);
  });

  it('contain (the default): the whole drawing fits the print area, centred', () => {
    const p = instantPlacement(ctx(), 200, { width: 1000, height: 1000 }, clampTransform({ scale: 0 }));
    expect(p.image.width).toBeCloseTo(120, 0);
    expect(p.image.height).toBeCloseTo(120, 0);
    expect(p.image.centreX).toBeCloseTo(60, 0);
    expect(p.image.centreY).toBeCloseTo(100, 0);
  });

  it('cover: the drawing fills the print area (the print bleed is windowed off, like the compositor)', () => {
    const noBleed = instantPlacement(ctx(), 200, { width: 1000, height: 1000 }, clampTransform({ scale: 1 }));
    expect(noBleed.image.height).toBeCloseTo(200, 0);
    expect(noBleed.image.width).toBeCloseTo(200, 0);
    const bleed = instantPlacement(ctx({ print: { printWidthPx: 1500, printHeightPx: 2500, bleedMm: 3, requiredDpi: 300 } }), 200, { width: 1000, height: 1000 }, clampTransform({ scale: 1 }));
    expect(bleed.image.height).toBeGreaterThan(200); // covers the bleed too, which is cropped away
    expect(bleed.image.centreY).toBeCloseTo(100, 0);
  });

  it('a quarter turn swaps the drawing’s box; fabric reads it as ink (multiply)', () => {
    const p = instantPlacement(ctx({ material: 'LIGHT_FABRIC' }), 200, { width: 2000, height: 1000 }, clampTransform({ scale: 0, rotationDeg: 90 }));
    expect(p.image.rotationDeg).toBe(90);
    // a wide (2:1) drawing on its side: its own box stays wide (200×100); turned, it stands 100×200 —
    // exactly filling the 120×200 print area's height
    expect(p.image.width).toBeCloseTo(200, 0);
    expect(p.image.height).toBeCloseTo(100, 0);
    expect(p.blend).toBe('multiply');
  });

  it('the prefetch and the tile build the SAME key (a prefetched picture is always the one asked for)', () => {
    const tf = { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 };
    expect(mockupKey({ assetId: 'a', variantId: 'v', transform: tf, size: 'thumb', view: 'centre' })).toBe(
      mockupKey({ assetId: 'a', sourceObjectId: undefined, variantId: 'v', transform: { ...tf }, size: 'thumb', view: 'centre', fill: null, spanHalf: undefined }),
    );
    expect(mockupKey({ assetId: 'a', variantId: 'v', transform: tf })).not.toBe(mockupKey({ assetId: 'a', variantId: 'v', transform: { ...tf, scale: 1 } }));
  });
});
