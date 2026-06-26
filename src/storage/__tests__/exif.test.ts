import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { hasExif, stripExif } from '@/storage/exif';

/** A small JPEG carrying EXIF so we can prove the whole block (GPS included) is
 * stripped. GPS tags live inside the EXIF block, so removing EXIF removes GPS. */
async function jpegWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 16, height: 16, channels: 3, background: { r: 200, g: 120, b: 60 } } })
    .jpeg()
    .withExif({ IFD0: { Copyright: 'Snickerdoodle test', Make: 'TestCam' } })
    .toBuffer();
}

describe('stripExif — child-safety metadata removal', () => {
  it('removes the EXIF/GPS block from an uploaded image', async () => {
    const original = await jpegWithExif();
    expect(await hasExif(original)).toBe(true); // fixture really carries EXIF

    const cleaned = await stripExif(original);
    expect(await hasExif(cleaned.buffer)).toBe(false); // …and it's gone after ingest
  });

  it('keeps the image valid and reports type, size and a sha256', async () => {
    const cleaned = await stripExif(await jpegWithExif());
    expect(cleaned.contentType).toBe('image/jpeg');
    expect(cleaned.byteSize).toBe(cleaned.buffer.byteLength);
    expect(cleaned.sha256).toMatch(/^[0-9a-f]{64}$/);
    // still a decodable image
    const meta = await sharp(cleaned.buffer).metadata();
    expect(meta.width).toBe(16);
    expect(meta.height).toBe(16);
  });

  it('preserves a PNG as a PNG', async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer();
    const cleaned = await stripExif(png);
    expect(cleaned.contentType).toBe('image/png');
  });
});
