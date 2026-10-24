import { describe, expect, it } from 'vitest';
import { isZoomWheel, wheelZoomFactor } from '../wheelZoom';

describe('wheel over the print layout', () => {
  it('a plain wheel is NOT a zoom (the page scrolls); ctrl / ⌘ / a trackpad pinch is', () => {
    expect(isZoomWheel({ ctrlKey: false, metaKey: false })).toBe(false);
    expect(isZoomWheel({ ctrlKey: true, metaKey: false })).toBe(true); // ctrl + wheel, or a trackpad pinch
    expect(isZoomWheel({ ctrlKey: false, metaKey: true })).toBe(true); // ⌘ + wheel
  });

  it('a wheel notch is one gentle step; a pinch delta is small and smooth; up zooms in', () => {
    expect(wheelZoomFactor(-100)).toBeCloseTo(1.06);
    expect(wheelZoomFactor(100)).toBeCloseTo(1 / 1.06);
    expect(wheelZoomFactor(-2)).toBeGreaterThan(1);
    expect(wheelZoomFactor(-2)).toBeLessThan(1.03);
    expect(wheelZoomFactor(0)).toBe(1);
  });
});
