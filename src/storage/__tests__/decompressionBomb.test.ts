import { crc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { ImageTooLargeError, MAX_UPLOAD_PIXELS, stripExif } from '@/storage';

/** A tiny PNG whose header CLAIMS to be w×h — what a decompression bomb looks like on arrival. */
async function pngClaiming(w: number, h: number): Promise<Buffer> {
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#c8402a' } }).png().toBuffer();
  const out = Buffer.from(png);
  // IHDR data starts after the 8-byte signature + 4-byte length + 'IHDR'
  out.writeUInt32BE(w, 16);
  out.writeUInt32BE(h, 20);
  out.writeUInt32BE(crc32(out.subarray(12, 29)) >>> 0, 29); // fix the chunk's CRC so it parses
  return out;
}

describe('uploads: a decompression bomb is refused before any pixel is decoded', () => {
  it('refuses a small file that claims 16000×16000 pixels (~1 GB to decode — under sharp’s own limit, over ours)', async () => {
    const bomb = await pngClaiming(16000, 16000);
    expect(bomb.byteLength).toBeLessThan(1000);
    await expect(stripExif(bomb)).rejects.toBeInstanceOf(ImageTooLargeError);
  });

  it('and one that claims 30000×30000 (past sharp’s own limit) the same way', async () => {
    await expect(stripExif(await pngClaiming(30000, 30000))).rejects.toBeInstanceOf(ImageTooLargeError);
  });

  it('allows a big real phone photo size (48MP is under the cap)', () => {
    expect(8064 * 6048).toBeLessThan(MAX_UPLOAD_PIXELS);
  });

  it('still takes an ordinary drawing', async () => {
    const ok = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#2f5da8' } }).jpeg().toBuffer();
    const s = await stripExif(ok);
    expect(s.byteSize).toBeGreaterThan(0);
  });
});
