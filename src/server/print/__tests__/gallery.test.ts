import { describe, expect, it } from 'vitest';
import { galleryRect, GALLERY_MARGIN_MM, isGalleryProduct, mmToPx } from '../geometry';
import { assessPrintResolution } from '../pattern-geometry';

// The calendar's gallery page (founder, 26 Oct): the WHOLE drawing, fitted by its longest side inside a
// 1 cm white margin — nothing cropped, every page the same.
const page = { printWidthPx: 3508, printHeightPx: 2480, bleedMm: 3, requiredDpi: 300 }; // A4 landscape
const m = mmToPx(GALLERY_MARGIN_MM, 300);

describe('the calendar gallery page', () => {
  it('only the calendar is a gallery page', () => {
    expect(isGalleryProduct('calendar')).toBe(true);
    expect(isGalleryProduct('calendar-a4')).toBe(true);
    expect(isGalleryProduct('framedPrint')).toBe(false);
  });

  it('a wide drawing touches the side margins and sits centred, never past the margin', () => {
    const r = galleryRect(page, { width: 4000, height: 1500 });
    expect(r.x).toBe(m);
    expect(r.x + r.width).toBeCloseTo(page.printWidthPx - m, -1);
    expect(r.y).toBeGreaterThan(m);
    expect(Math.abs(r.y - (page.printHeightPx - r.y - r.height))).toBeLessThanOrEqual(2); // centred
  });

  it('a tall drawing touches the top + bottom margins — the whole drawing, uncropped', () => {
    const r = galleryRect(page, { width: 1000, height: 3000 });
    expect(r.y).toBe(m);
    expect(r.y + r.height).toBeCloseTo(page.printHeightPx - m, -1);
    expect(r.width / r.height).toBeCloseTo(1000 / 3000, 2); // its own shape
  });

  it('the resolution check is judged on the area inside the margin, whatever placement is sent', () => {
    const a = assessPrintResolution(page, { width: 1000, height: 3000 }, { scale: 4, offsetX: 1, offsetY: 1, rotationDeg: 0 }, 'calendar');
    const b = assessPrintResolution(page, { width: 1000, height: 3000 }, { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 }, 'calendar');
    expect(a.effectiveDpi).toBe(b.effectiveDpi);
  });
});
