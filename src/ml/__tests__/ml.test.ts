import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { removeBackground, runImageOp, upscale } from '../client';

/** A 100×100 white image with a solid red 40×40 square at (30,30). */
async function drawingOnWhite(): Promise<Buffer> {
  const square = await sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 204, g: 34, b: 34 } } }).png().toBuffer();
  return sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{ input: square, left: 30, top: 30 }])
    .png()
    .toBuffer();
}

async function pixels(buf: Buffer) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return (x: number, y: number) => {
    const i = (y * info.width + x) * info.channels;
    return { r: data[i]!, g: data[i + 1]!, b: data[i + 2]!, a: data[i + 3]! };
  };
}

describe('self-hosted image ops (the magic edits)', () => {
  it('removeBackground keys out the near-white background, keeps the drawing opaque', async () => {
    const cut = await removeBackground(await drawingOnWhite());
    const px = await pixels(cut);
    expect(px(2, 2).a).toBe(0); // a corner of the white background → transparent
    expect(px(98, 98).a).toBe(0);
    const centre = px(50, 50);
    expect(centre.a).toBe(255); // the drawing stays fully opaque
    expect(centre.r).toBeGreaterThan(150); // …and keeps its colour
    expect(centre.g).toBeLessThan(120);
  });

  it('a magic edit strips ALL metadata — no EXIF/GPS survives', async () => {
    const cut = await removeBackground(await drawingOnWhite());
    const meta = await sharp(cut).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it('upscale resamples to the exact target size', async () => {
    const up = await upscale(await drawingOnWhite(), 300, 240);
    const meta = await sharp(up).metadata();
    expect(meta.width).toBe(300);
    expect(meta.height).toBe(240);
  });

  it('runImageOp returns one re-encoded PNG with a content hash (single image in → single image out)', async () => {
    const r = await runImageOp({ kind: 'BG_REMOVE' }, await drawingOnWhite());
    expect(r.contentType).toBe('image/png');
    expect(r.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(r.byteSize).toBeGreaterThan(0);
    expect((await sharp(r.buffer).metadata()).channels).toBe(4); // RGBA cutout
  });
});
