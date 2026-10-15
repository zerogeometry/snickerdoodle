import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { applyGeometry, cleanGeometry, isIdentity, IDENTITY_GEOMETRY } from '@/server/studio-doc';

/** 40×20 white image with a red 4×4 block in the TOP-LEFT corner. */
async function marker(): Promise<Buffer> {
  const red = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer();
  return sharp({ create: { width: 40, height: 20, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{ input: red, left: 0, top: 0 }])
    .png()
    .toBuffer();
}
async function redAt(buf: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return data[i]! > 200 && data[i + 1]! < 60;
}

describe('studio geometry — rotate → flip → crop, identical on server and in the studio', () => {
  it('rotates clockwise: top-left goes to top-right, and the size swaps', async () => {
    const r = await applyGeometry(await marker(), { ...IDENTITY_GEOMETRY, rotate: 90 });
    expect([r.width, r.height]).toEqual([20, 40]);
    expect(await redAt(r.buffer, 18, 1)).toBe(true);
  });

  it('flips AFTER rotating (order matters)', async () => {
    const r = await applyGeometry(await marker(), { ...IDENTITY_GEOMETRY, rotate: 90, flipH: true });
    expect(await redAt(r.buffer, 1, 1)).toBe(true); // rotated to top-right, then mirrored back to top-left
    const v = await applyGeometry(await marker(), { ...IDENTITY_GEOMETRY, flipV: true });
    expect(await redAt(v.buffer, 1, 18)).toBe(true);
  });

  it('crops in fractions of the rotated+flipped picture', async () => {
    const r = await applyGeometry(await marker(), { ...IDENTITY_GEOMETRY, crop: { x: 0, y: 0, w: 0.5, h: 0.5 } });
    expect([r.width, r.height]).toEqual([20, 10]);
    expect(await redAt(r.buffer, 1, 1)).toBe(true);
  });

  it('never trusts the client: junk is cleaned to a safe recipe', () => {
    const g = cleanGeometry({ rotate: 45, flipH: 'yes', crop: { x: -1, y: 0.9, w: 5, h: NaN } });
    expect(g.rotate).toBe(0);
    expect(g.flipH).toBe(false);
    expect(g.crop.x).toBe(0);
    expect(g.crop.x + g.crop.w).toBeLessThanOrEqual(1);
    expect(g.crop.y + g.crop.h).toBeLessThanOrEqual(1);
    expect(g.crop.w).toBeGreaterThan(0);
    expect(isIdentity(cleanGeometry(undefined))).toBe(true);
  });
});
