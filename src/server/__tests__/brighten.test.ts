import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { applyMagicToImage, brightenPixels } from '@/server/studio-doc';

const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

describe('"brighten" only ever lifts', () => {
  it('never lowers any channel value, whatever the picture', () => {
    for (const fill of [10, 120, 200, 240, 255]) {
      const px = new Uint8Array(3 * 64);
      for (let i = 0; i < px.length; i++) px[i] = (fill + i * 37) % 256;
      const before = Uint8Array.from(px);
      brightenPixels(px, new Uint8Array(64).fill(255));
      for (let i = 0; i < px.length; i++) expect(px[i]!).toBeGreaterThanOrEqual(before[i]!);
    }
  });

  it('a mostly-white drawing keeps its colours (no darker) and grey paper comes up near white', async () => {
    // grey paper (200) with a red crayon blob — the case that used to come out darker
    const img = await sharp({ create: { width: 120, height: 120, channels: 4, background: { r: 200, g: 200, b: 198, alpha: 1 } } })
      .composite([{ input: { create: { width: 20, height: 20, channels: 4, background: { r: 200, g: 60, b: 50, alpha: 1 } } }, left: 50, top: 50 }])
      .png()
      .toBuffer();
    const out = await applyMagicToImage(img, { brighten: true });
    const { data } = await sharp(out).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => { const i = (y * 120 + x) * 3; return [data[i]!, data[i + 1]!, data[i + 2]!] as const; };
    expect(lum(...at(5, 5))).toBeGreaterThan(240); // paper lifted toward white
    expect(lum(...at(60, 60))).toBeGreaterThanOrEqual(lum(200, 60, 50)); // the crayon is not darker
  });

  it('leaves a picture that is already bright alone (no gain above white)', () => {
    const px = new Uint8Array(3 * 16).fill(255);
    brightenPixels(px, new Uint8Array(16).fill(255));
    expect([...px].every((v) => v === 255)).toBe(true);
  });
});
