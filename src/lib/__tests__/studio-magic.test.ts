import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { cleanMagic, magicKey, tidyWindow } from '@/lib/studio-magic';
import { applyMagicToImage } from '@/server/studio-doc';

const raw = async (png: Buffer) => sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

/** A dull, greyish "phone photo of a drawing": paper ~200, ink ~90, with salt-and-pepper specks. */
async function dullDrawing(w = 400, h = 300): Promise<Buffer> {
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const ink = x > 100 && x < 300 && y > 100 && y < 200;
      const v = ink ? 90 : 215;
      px[i] = v + 6;
      px[i + 1] = v;
      px[i + 2] = v - 8;
      px[i + 3] = x < 20 ? 0 : 255; // a see-through strip
      if ((x * 7 + y * 13) % 97 === 0) px[i] = px[i + 1] = px[i + 2] = 20; // a speck
    }
  return sharp(px, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

describe('magic edits — tidy the lines + brighten (self-hosted, deterministic)', () => {
  it('only real switches survive the browser-cleaning', () => {
    expect(cleanMagic({ tidy: true, brighten: 'yes', evil: true })).toEqual({ tidy: true });
    expect(cleanMagic({})).toBeNull();
    expect(magicKey({ tidy: true, brighten: true })).toBe('tb');
  });

  it('the tidy window scales with the picture (odd, so it has a middle) — the preview and print match in relative terms', () => {
    expect(tidyWindow(1600)).toBe(3);
    expect(tidyWindow(3200) % 2).toBe(1);
    expect(tidyWindow(3200)).toBeGreaterThan(tidyWindow(1600));
    expect(tidyWindow(20000)).toBe(7); // capped, so a huge scan stays quick
  });

  it('nothing on = the same bytes back', async () => {
    const b = await dullDrawing();
    expect(await applyMagicToImage(b, null)).toBe(b);
  });

  it('brighten lifts a dull photo to crisp whites without darkening the ink; alpha untouched', async () => {
    const before = await raw(await dullDrawing());
    const after = await raw(await applyMagicToImage(await dullDrawing(), { brighten: true }));
    const at = (d: typeof before, x: number, y: number) => d.data[(y * 400 + x) * 4]!;
    expect(at(after, 50, 50)).toBeGreaterThan(at(before, 50, 50)); // paper whiter
    expect(at(after, 50, 50)).toBeGreaterThan(240);
    expect(at(after, 200, 150)).toBeGreaterThanOrEqual(at(before, 200, 150)); // lift-only: never darker
    expect(at(after, 200, 150)).toBeLessThan(at(after, 50, 50) - 80); // …and the ink still reads as ink
    for (let i = 3; i < after.data.length; i += 4) expect(after.data[i]).toBe(before.data[i]);
  });

  it('tidy smooths away specks and whitens the paper, keeping the drawing', async () => {
    const after = await raw(await applyMagicToImage(await dullDrawing(), { tidy: true }));
    let specks = 0;
    for (let y = 30; y < 300; y++) for (let x = 30; x < 400; x++) if ((x * 7 + y * 13) % 97 === 0 && !(x > 95 && x < 305 && y > 95 && y < 205) && after.data[(y * 400 + x) * 4]! < 120) specks++;
    expect(specks).toBe(0);
    expect(after.data[(50 * 400 + 50) * 4]).toBe(255); // paper → white
    expect(after.data[(150 * 400 + 200) * 4]!).toBeLessThan(110); // the ink stays ink
  });

  it('tidy never bleaches colour: a sky-blue painting with no paper is left its colour', async () => {
    const sky = await sharp({ create: { width: 120, height: 80, channels: 4, background: { r: 143, g: 181, b: 214, alpha: 1 } } }).png().toBuffer();
    const out = await raw(await applyMagicToImage(sky, { tidy: true }));
    expect([...out.data.subarray(0, 3)]).toEqual([143, 181, 214]);
  });

  it('PREVIEW ≈ PRINT: edited small looks like the full-size edit made small', async () => {
    const big = await dullDrawing(1600, 1200);
    const small = await sharp(big).resize(400, 300, { fit: 'fill' }).png().toBuffer();
    const preview = await raw(await applyMagicToImage(small, { tidy: true, brighten: true }));
    const print = await raw(await sharp(await applyMagicToImage(big, { tidy: true, brighten: true })).resize(400, 300, { fit: 'fill' }).png().toBuffer());
    let diff = 0;
    for (let i = 0; i < preview.data.length; i += 4) diff += Math.abs(preview.data[i]! - print.data[i]!);
    expect(diff / (400 * 300)).toBeLessThan(8); // on average within a few levels
  });
});
