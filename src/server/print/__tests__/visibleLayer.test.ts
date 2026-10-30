import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { computeLayerRect, type Transform } from '../geometry';
import { visibleLayerPart } from '../visibleLayer';

/** The old way: resize the WHOLE rotated layer, then crop the visible part (what 03-B3 broke on). */
async function wholeLayerPart(src: Buffer, rect: ReturnType<typeof computeLayerRect>) {
  const layer = await sharp(src).rotate(rect.rotationDeg).resize(rect.width, rect.height, { fit: 'fill' }).toBuffer();
  const ix = Math.max(0, -rect.x), iy = Math.max(0, -rect.y);
  const iw = Math.max(1, Math.min(rect.width - ix, rect.canvasWidth - Math.max(0, rect.x)));
  const ih = Math.max(1, Math.min(rect.height - iy, rect.canvasHeight - Math.max(0, rect.y)));
  return sharp(layer).extract({ left: ix, top: iy, width: iw, height: ih }).png().toBuffer();
}

async function meanAbsDiff(a: Buffer, b: Buffer): Promise<number> {
  const [ra, rb] = await Promise.all([sharp(a).removeAlpha().raw().toBuffer({ resolveWithObject: true }), sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true })]);
  expect([ra.info.width, ra.info.height]).toEqual([rb.info.width, rb.info.height]);
  let sum = 0;
  for (let i = 0; i < ra.data.length; i++) sum += Math.abs(ra.data[i]! - rb.data[i]!);
  return sum / ra.data.length;
}

// a smooth gradient with a few hard blocks — resampling differences show up as edge error only
async function drawing(w: number, h: number): Promise<Buffer> {
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    const block = ((x >> 6) + (y >> 6)) % 5 === 0;
    raw[i] = block ? 30 : (x * 255) / w;
    raw[i + 1] = block ? 90 : (y * 255) / h;
    raw[i + 2] = block ? 200 : 128;
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

const GEOM = { printWidthPx: 600, printHeightPx: 800, bleedMm: 0, requiredDpi: 300 };

describe('visibleLayerPart — cut from the source first, then resize (sweep 03-B3)', () => {
  const cases: Array<[string, Transform]> = [
    ['cover (the default fill)', { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 }],
    ['contain (zoomed out, white margins)', { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 }],
    ['zoomed in + panned', { scale: 2.5, offsetX: 0.6, offsetY: -0.4, rotationDeg: 0 }],
    ['turned 90° + zoomed', { scale: 1.7, offsetX: -0.3, offsetY: 0.5, rotationDeg: 90 }],
    ['turned 270° to the far corner', { scale: 3, offsetX: 1, offsetY: 1, rotationDeg: 270 }],
  ];
  for (const [name, t] of cases) {
    it(`${name}: the same pixels as resizing the whole layer`, async () => {
      const src = await drawing(900, 500);
      const rect = computeLayerRect(GEOM, { width: 900, height: 500 }, t);
      const got = await visibleLayerPart(src, { width: 900, height: 500 }, rect);
      expect(got.left).toBe(Math.max(0, rect.x));
      expect(got.top).toBe(Math.max(0, rect.y));
      expect(await meanAbsDiff(got.part, await wholeLayerPart(src, rect))).toBeLessThan(3); // of 255
    });
  }

  it('a zoom whose whole layer is far over sharp’s pixel limit still renders, bounded by the canvas', async () => {
    const big = { printWidthPx: 7200, printHeightPx: 9600, bleedMm: 0, requiredDpi: 300 }; // the 24×32″ frame
    const src = await drawing(3000, 1000); // a 3:1 panorama
    const rect = computeLayerRect(big, { width: 3000, height: 1000 }, { scale: 4, offsetX: 0.2, offsetY: 0, rotationDeg: 0 });
    expect(rect.width * rect.height).toBeGreaterThan(268_402_689); // what used to throw
    const got = await visibleLayerPart(src, { width: 3000, height: 1000 }, rect);
    expect([got.width, got.height]).toEqual([7200, 9600]);
    const meta = await sharp(got.part).metadata();
    expect([meta.width, meta.height]).toEqual([7200, 9600]);
  }, 120_000);
});
