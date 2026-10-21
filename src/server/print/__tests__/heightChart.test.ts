import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { definedPriceList } from '@/server/catalogue';
import { renderHeightChartFace } from '../heightChart';
import {
  HANGER_MARGIN_MM,
  HEIGHT_CHART_FLOOR_CM,
  heightChartArtGeom,
  heightChartLayout,
  RULER_BAND_MM,
  rulerTicks,
  yForHeightCm,
} from '../height-chart-geometry';
import { assessPrintResolution } from '../pattern-geometry';

/**
 * The height chart is a MEASURING instrument: the printed ruler must be at true physical scale.
 * For every size we sell, render the real print file and read the tick marks back off the pixels —
 * each must sit within ±1 px of where (height − floor) × dpi / 2.54 says it should.
 */
const SIZES = definedPriceList()
  .filter((v) => v.productKey === 'heightChart' && v.px)
  .reduce((m, v) => m.set(`${v.px!.w}x${v.px!.h}`, v.px!), new Map<string, { w: number; h: number }>());
const DPI = 150; // Prodigi's spec for these canvases (1200×7200 = 8×48″)

/** Centres of the dark runs in one pixel column, BOTTOM-UP (the order rulerTicks lists them). */
function darkRunCentres(data: Buffer, width: number, height: number, channels: number, x: number, threshold = 128): number[] {
  const out: number[] = [];
  let start = -1;
  for (let y = 0; y <= height; y++) {
    const dark = y < height && data[(y * width + x) * channels]! < threshold;
    if (dark && start < 0) start = y;
    if (!dark && start >= 0) {
      out.push((start + y - 1) / 2);
      start = -1;
    }
  }
  return out.reverse();
}

describe('height chart ruler — true physical scale in the print file', () => {
  it('sells the four Prodigi canvases', () => {
    expect([...SIZES.keys()].sort()).toEqual(['1200x7200', '1200x9000', '1800x7200', '1800x9000']);
  });

  for (const [name, px] of SIZES) {
    it(`${name}: every cm and inch tick within ±1 px of true scale`, async () => {
      const t = { printWidthPx: px.w, printHeightPx: px.h, bleedMm: 0, requiredDpi: DPI };
      const src = await sharp({ create: { width: 600, height: 800, channels: 3, background: '#2f5da8' } }).png().toBuffer();
      const { png, width, height } = await renderHeightChartFace(src, t, { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 });
      expect({ width, height }).toEqual({ width: px.w, height: px.h }); // exactly Prodigi's file

      const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
      const lay = heightChartLayout({ width, height }, DPI);
      const ticks = rulerTicks(lay);

      // cm ticks on the chart's outer edge: read the column 2 px in
      const cmFound = darkRunCentres(data, info.width, info.height, info.channels, 2);
      expect(cmFound).toHaveLength(ticks.cm.length);
      ticks.cm.forEach((tk, i) => {
        expect(Math.abs(cmFound[i]! - yForHeightCm(tk.value, lay))).toBeLessThanOrEqual(1);
      });
      // 10 cm is exactly 10 / 2.54 × dpi px apart, end to end (no accumulated drift)
      const span = ticks.cm.at(-1)!.value - ticks.cm[0]!.value;
      expect(Math.abs(cmFound[0]! - cmFound.at(-1)! - (span / 2.54) * DPI)).toBeLessThanOrEqual(1); // bottom y − top y

      // inch ticks on the band's inner edge
      const inFound = darkRunCentres(data, info.width, info.height, info.channels, lay.bandPx - 3);
      expect(inFound).toHaveLength(ticks.inch.length);
      ticks.inch.forEach((tk, i) => {
        expect(Math.abs(inFound[i]! - yForHeightCm(tk.value * 2.54, lay))).toBeLessThanOrEqual(1);
      });
    });
  }

  it('starts the scale at the floor offset and keeps clear of the hangers', () => {
    const lay = heightChartLayout({ width: 1200, height: 7200 }, DPI);
    const { cm, inch } = rulerTicks(lay);
    const margin = (HANGER_MARGIN_MM / 25.4) * DPI;
    for (const t of [...cm, ...inch]) {
      expect(t.y).toBeGreaterThanOrEqual(margin);
      expect(t.y).toBeLessThanOrEqual(lay.height - margin);
    }
    // the bottom edge IS the floor offset; 100 cm sits (100 − floor) cm above it
    expect(yForHeightCm(HEIGHT_CHART_FLOOR_CM, lay)).toBe(7200);
    expect(yForHeightCm(100, lay)).toBeCloseTo(7200 - ((100 - HEIGHT_CHART_FLOOR_CM) / 2.54) * DPI, 6);
    expect(cm.find((t) => t.value === 100)?.label).toBe('100');
    expect(inch.find((t) => t.value === 48)?.label).toBe('4ft');
  });

  it('places the drawing beside the ruler, and judges its resolution on the art area', () => {
    const t = { printWidthPx: 1200, printHeightPx: 7200, bleedMm: 0, requiredDpi: DPI };
    const art = heightChartArtGeom(t);
    const band = Math.round((RULER_BAND_MM / 25.4) * DPI);
    expect(art.printWidthPx).toBe(1200 - band);
    expect(art.printHeightPx).toBe(7200);
    // the DPI gate uses the art area for a height chart (a narrower area ⇒ a higher effective dpi)
    const src = { width: 800, height: 600 };
    const tf = { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 as const };
    const chart = assessPrintResolution(t, src, tf, 'heightChart');
    const whole = assessPrintResolution(t, src, tf, 'framedPrint');
    expect(chart.effectiveDpi).toBeGreaterThan(whole.effectiveDpi);
  });

  it('a preview at a smaller scale draws the same ruler, proportionally', async () => {
    const t = { printWidthPx: 1200, printHeightPx: 7200, bleedMm: 0, requiredDpi: DPI };
    const src = await sharp({ create: { width: 600, height: 800, channels: 3, background: '#2f5da8' } }).png().toBuffer();
    const { png, width, height } = await renderHeightChartFace(src, t, { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 }, { scale: 0.25 });
    expect({ width, height }).toEqual({ width: 300, height: 1800 });
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    const lay = heightChartLayout({ width, height }, DPI * 0.25);
    const found = darkRunCentres(data, info.width, info.height, info.channels, 1, 200); // 1 px strokes antialias
    const want = rulerTicks(lay).cm;
    expect(found).toHaveLength(want.length);
    want.forEach((tk, i) => expect(Math.abs(found[i]! - tk.y)).toBeLessThanOrEqual(1));
  });
});
