import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { pictureForEditing } from '../editingPicture';

const decode = (dataUrl: string) => Buffer.from(dataUrl.split(',')[1]!, 'base64');

/** A 40×20 picture: a solid square on the left; the right half see-through (or white, when opaque). */
async function drawing(seeThrough: boolean) {
  const base = sharp({ create: { width: 40, height: 20, channels: 4, background: seeThrough ? { r: 0, g: 0, b: 0, alpha: 0 } : { r: 255, g: 255, b: 255, alpha: 1 } } });
  const square = await sharp({ create: { width: 20, height: 20, channels: 4, background: { r: 200, g: 64, b: 42, alpha: 1 } } }).png().toBuffer();
  return base.composite([{ input: square, left: 0, top: 0 }]).png().toBuffer();
}

describe('pictureForEditing (a keepsake opened from Draw or a picker)', () => {
  it('keeps a see-through drawing see-through, never black', async () => {
    const pic = await pictureForEditing(await drawing(true));
    expect(pic.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    const { data, info } = await sharp(decode(pic.dataUrl)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
    expect(alphaAt(30, 10)).toBe(0); // the empty half: still clear, so the page's cream shows through
    expect(alphaAt(10, 10)).toBe(255); // the drawing itself
    expect(pic.aspect).toBe(2);
  });

  it('keeps an opaque picture (a photo, a drawing on paper) a JPEG', async () => {
    const pic = await pictureForEditing(await drawing(false));
    expect(pic.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
  });
});
