import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { cropToSheet } from '../sheetCrop';

// TRIM THE TABLE (founder, 26 Oct): crop a photo to the sheet when it's sure — and only then.
const svg = (w: number, h: number, body: string) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`)).png().toBuffer();
const wood = (w: number, h: number, base = '#9a6a40', grain = '#7a4e2d') =>
  `<rect width="${w}" height="${h}" fill="${base}"/>` + Array.from({ length: Math.ceil(h / 12) }, (_, i) => `<rect x="0" y="${i * 12}" width="${w}" height="5" fill="${grain}" opacity="0.6"/>`).join('');

describe('trim the table', () => {
  it('crops a sheet on a wooden table to the sheet — the drawing intact, no table left', async () => {
    const buf = await svg(640, 480, `${wood(640, 480)}<rect x="90" y="60" width="460" height="360" fill="#f6f1e2"/><circle cx="320" cy="240" r="90" fill="#2f5da8"/>`);
    const r = await cropToSheet(buf);
    expect(r).not.toBeNull();
    expect(r!.width).toBeGreaterThan(420);
    expect(r!.width).toBeLessThanOrEqual(460);
    expect(r!.height).toBeGreaterThan(320);
    const { data, info } = await sharp(r!.buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => [...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)];
    for (const [x, y] of [[2, 2], [info.width - 3, 2], [2, info.height - 3], [info.width - 3, info.height - 3]] as const) {
      expect(Math.min(...at(x, y))).toBeGreaterThan(200); // the corners are paper, not wood
    }
    const c = at(info.width >> 1, info.height >> 1);
    expect(c[2]!).toBeGreaterThan(c[0]! + 60); // the blue drawing is still in the middle
  });

  it('squares up a sheet photographed at an angle', async () => {
    const buf = await svg(640, 480, `${wood(640, 480)}<polygon points="120,70 540,50 560,420 100,440" fill="#f6f1e2"/>`);
    const r = await cropToSheet(buf);
    expect(r).not.toBeNull();
    expect(r!.straightened).toBe(true);
  });

  it('leaves a photo alone when there is no table round the sheet (the paper fills the photo)', async () => {
    const buf = await svg(600, 800, `<rect width="600" height="800" fill="#e8463e"/><circle cx="300" cy="400" r="120" fill="#2f5da8"/>`);
    expect(await cropToSheet(buf)).toBeNull();
  });

  it('leaves a drawing on white alone — a big painted shape is never mistaken for a sheet', async () => {
    const buf = await svg(600, 480, `<rect width="600" height="480" fill="#fbfaf6"/><rect x="120" y="90" width="360" height="300" fill="#c8402a"/>`);
    expect(await cropToSheet(buf)).toBeNull();
  });
});
