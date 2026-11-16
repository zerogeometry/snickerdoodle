import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { definedPrintSpecs } from '@/server/catalogue';
import { renderArtWindowFace } from '../artWindow';
import { artWindowFrac, artWindowOf, canvasSizePx, mmToPx, SACK_PRINT_BOX_MM } from '../geometry';
import { assessPrintResolution } from '../pattern-geometry';
import { printFileSize } from '../printFile';

/** The print-accuracy fixes of 16 Nov 2026 (reports/print-accuracy-2026-11-16). Synthetic art only. */
const spec = (sku: string) => {
  const s = definedPrintSpecs().find((x) => x.sku === sku);
  if (!s) throw new Error(`no spec ${sku}`);
  return s;
};

describe('christmas sack — the drawing prints inside Prodigi’s 28×32 cm box', () => {
  const t = spec('sack').template;

  it('the file is still Prodigi’s full 3779×5905 px', () => {
    expect(printFileSize('sack', spec('sack').attributes, t)).toEqual({ w: 3779, h: 5905 });
  });

  it('the box is 280×320 mm, centred across, 40 mm down', () => {
    const win = artWindowOf('sack', t)!;
    expect(win.geom.printWidthPx).toBe(mmToPx(SACK_PRINT_BOX_MM.w, 300)); // 3307
    expect(win.geom.printHeightPx).toBe(mmToPx(SACK_PRINT_BOX_MM.h, 300)); // 3780
    expect(win.x).toBe(Math.round((3779 - win.geom.printWidthPx) / 2));
    expect(win.y).toBe(mmToPx(40, 300));
    // the sack's gate dpi carries over to the box
    expect(win.geom.gateDpi).toBe(t.gateDpi);
    const f = artWindowFrac('sack', t)!;
    expect(f.x0).toBeCloseTo(1 - f.x1, 3); // centred
    expect(f.y1).toBeLessThan(0.75); // the bottom ~14 cm of the file never prints
  });

  it('no other product has an art window', () => {
    for (const k of ['framedPrint', 'mug', 'cushion', 'teaTowel', 'heightChart']) expect(artWindowOf(k, t)).toBeNull();
  });

  it('the resolution gate judges the box, not the whole file', () => {
    const src = { width: 1200, height: 900 };
    const fit = { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 as const };
    // the drawing is drawn smaller in the box than across the whole file → more dpi from the same pixels
    expect(assessPrintResolution(t, src, fit, 'sack').effectiveDpi).toBeGreaterThan(assessPrintResolution(t, src, fit, 'framedPrint').effectiveDpi);
  });

  it('renders white outside the box and the drawing (or its base colour) inside it', async () => {
    const red = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#d62728' } }).png().toBuffer();
    const scale = 0.1;
    const f = await renderArtWindowFace(red, 'sack', t, { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 }, { scale, groundHex: '#2f5da8' });
    const { data, info } = await f.pipeline.raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([Math.round(3779 * scale), Math.round(5905 * scale)]);
    const at = (x: number, y: number) => Array.from(data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3));
    expect(at(2, 2)).toEqual([255, 255, 255]); // top-left corner: unprinted
    expect(at(Math.round(info.width / 2), info.height - 5)).toEqual([255, 255, 255]); // the bottom: unprinted
    const win = artWindowOf('sack', { ...t, printWidthPx: info.width, printHeightPx: info.height, requiredDpi: t.requiredDpi * scale })!;
    const [r, g, b] = at(win.x + Math.round(win.geom.printWidthPx / 2), win.y + Math.round(win.geom.printHeightPx / 2));
    expect(r).toBeGreaterThan(200); // the drawing, mid-box
    expect(g).toBeLessThan(70);
    expect(b).toBeLessThan(70);
  });
});

describe('tube socks — Prodigi’s 16 Nov size (6141×3543), designed upright', () => {
  it('designs on 300 × 520 mm and sends Prodigi the landscape file', () => {
    const s = spec('socks-tube');
    expect([s.template.printWidthPx, s.template.printHeightPx]).toEqual([3543, 6141]);
    expect(printFileSize('socks', s.attributes, s.template)).toEqual({ w: 6141, h: 3543 });
  });
  it('the ankle sock (square) is never turned', () => {
    const s = spec('socks');
    expect(printFileSize('socks', s.attributes, s.template)).toEqual({ w: 3543, h: 3543 });
  });
});

describe('the finished size vs the file — trim/seam (bleed) that never shows', () => {
  it.each([
    ['playingCards', 3, { w: 820, h: 1122 }],
    ['cushion-12square', 6, { w: 1875, h: 1875 }],
    ['cushion', 6, { w: 2008, h: 1725 }], // the heart (the default cushion)
    ['blanket-medium-landscape', 10, { w: 5905, h: 3838 }],
  ] as const)('%s: %d mm edge, and the canvas is still Prodigi’s exact file', (sku, bleed, file) => {
    const s = definedPrintSpecs().find((x) => x.sku === sku)!;
    expect(s, sku).toBeTruthy();
    expect(s.template.bleedMm).toBe(bleed);
    const c = canvasSizePx(s.template);
    expect({ w: c.width, h: c.height }).toEqual(file);
  });
});
