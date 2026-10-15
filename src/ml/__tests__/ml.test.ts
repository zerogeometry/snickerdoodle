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
    const cut = (await removeBackground(await drawingOnWhite())).buffer;
    const px = await pixels(cut);
    expect(px(2, 2).a).toBe(0); // a corner of the white background → transparent
    expect(px(98, 98).a).toBe(0);
    const centre = px(50, 50);
    expect(centre.a).toBe(255); // the drawing stays fully opaque
    expect(centre.r).toBeGreaterThan(150); // …and keeps its colour
    expect(centre.g).toBeLessThan(120);
  });

  it('removes a DARK background too (border-connected, any solid colour)', async () => {
    const light = await sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 235, g: 220, b: 200 } } }).png().toBuffer();
    const onBlack = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 12, g: 10, b: 14 } } })
      .composite([{ input: light, left: 30, top: 30 }])
      .png()
      .toBuffer();
    const res = await removeBackground(onBlack);
    const px = await pixels(res.buffer);
    expect(px(2, 2).a).toBe(0); // black background gone
    expect(px(50, 50).a).toBe(255); // light subject kept
    expect(res.removedFraction).toBeGreaterThan(0.5);
  });

  it('clears paper ENCLOSED by the subject too (it would print as a white blob on a coloured tee)', async () => {
    const hole = await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer();
    const frame = await sharp({ create: { width: 60, height: 60, channels: 3, background: { r: 204, g: 34, b: 34 } } })
      .composite([{ input: hole, left: 20, top: 20 }])
      .png()
      .toBuffer();
    const img = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } } })
      .composite([{ input: frame, left: 20, top: 20 }])
      .png()
      .toBuffer();
    const res = await removeBackground(img);
    const px = await pixels(res.buffer);
    expect(px(2, 2).a).toBe(0); // outer white removed
    expect(px(50, 50).a).toBe(0); // the paper inside the red frame goes too (ink lift — no flood)
    expect(px(25, 25).a).toBe(255); // the frame itself stays
  });

  it('KEEPS a subject that runs to the paper edge (never treats an edge-touching drawing as background)', async () => {
    // A red block touching the TOP edge — the old top-buckets rule read its colour as "background"
    // off the border ring and flooded the whole drawing away. The dominant-colour rule keeps it.
    const block = await sharp({ create: { width: 40, height: 55, channels: 3, background: { r: 204, g: 34, b: 34 } } }).png().toBuffer();
    const img = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } } })
      .composite([{ input: block, left: 30, top: 0 }]) // touches the top border
      .png()
      .toBuffer();
    const res = await removeBackground(img);
    const px = await pixels(res.buffer);
    expect(px(50, 6).a).toBe(255); // inside the edge-touching block → kept opaque, not eaten
    expect(px(2, 50).a).toBe(0); // the white to the side is still removed
    expect(res.removedFraction).toBeLessThan(0.9); // the block survived (not flooded to ~everything)
  });

  it('fails honestly (removedFraction 0) on a busy background with no dominant colour', async () => {
    // Four different strong colours quartering the border → no single colour owns it → don't guess.
    const q = (r: number, g: number, b: number) => sharp({ create: { width: 50, height: 50, channels: 3, background: { r, g, b } } }).png().toBuffer();
    const img = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#000000' } })
      .composite([
        { input: await q(220, 30, 30), left: 0, top: 0 },
        { input: await q(30, 160, 40), left: 50, top: 0 },
        { input: await q(40, 60, 200), left: 0, top: 50 },
        { input: await q(230, 200, 30), left: 50, top: 50 },
      ])
      .png()
      .toBuffer();
    const res = await removeBackground(img);
    expect(res.removedFraction).toBe(0); // ambiguous ⇒ honest no-op (caller's gate then reports failure)
  });

  it('reports a tiny removedFraction when there is no clean background (honesty signal)', async () => {
    // A full-bleed solid: the border IS the subject → the flood would erase everything.
    const solid = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 204, g: 34, b: 34 } } }).png().toBuffer();
    const res = await removeBackground(solid);
    expect(res.removedFraction).toBeGreaterThan(0.95); // caller's honesty gate rejects this
  });

  it('a magic edit strips ALL metadata — no EXIF/GPS survives', async () => {
    const cut = (await removeBackground(await drawingOnWhite())).buffer;
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
    expect(r.removedFraction).toBeGreaterThan(0.5); // the white ground was removed
    expect((await sharp(r.buffer).metadata()).channels).toBe(4); // RGBA cutout
  });
});
