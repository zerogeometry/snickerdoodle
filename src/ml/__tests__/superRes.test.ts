import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { runImageOp, upscaleTiered } from '../client';
import { resetSuperResForTests, srAccepts, superResAvailable, superResolve, SR_MODEL_SHA256 } from '../superRes';

/** A crayon-ish line drawing: white paper, a thick dark ring and a red bar (hard edges). */
async function lineDrawing(w = 96, h = 72, alpha = false): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    ${alpha ? '' : `<rect width="${w}" height="${h}" fill="#fffdf6"/>`}
    <circle cx="${w / 2}" cy="${h / 2}" r="${h / 3}" fill="none" stroke="#2b2118" stroke-width="5"/>
    <rect x="6" y="6" width="${w / 3}" height="8" fill="#c8402a"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Mean absolute horizontal gradient — higher = crisper edges. */
async function edgeEnergy(buf: Buffer): Promise<number> {
  const { data, info } = await sharp(buf).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 1; x < info.width; x++) sum += Math.abs(data[y * info.width + x]! - data[y * info.width + x - 1]!);
  }
  return sum / (info.width * info.height);
}

afterEach(() => {
  delete process.env.SR_MODEL_PATH;
  delete process.env.SR_DISABLED;
  resetSuperResForTests();
});

describe('super-resolution tier (self-hosted, in-process)', () => {
  it('the committed model is exactly the pinned one (a swapped file is never loaded)', () => {
    const bytes = readFileSync(path.join(process.cwd(), 'models/sr/realesr-animevideov3-x4.onnx'));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(SR_MODEL_SHA256);
  });

  it('upscales ×4 to the exact size, as a clean PNG — and crisper than the classical resample', async () => {
    expect(await superResAvailable()).toBe(true);
    const src = await lineDrawing();
    const out = await superResolve(src, 384, 288);
    expect(out).not.toBeNull();
    const meta = await sharp(out!).metadata();
    expect(meta).toMatchObject({ format: 'png', width: 384, height: 288 });
    expect(meta.exif).toBeUndefined();
    const lanczos = await sharp(src).resize(384, 288, { kernel: 'lanczos3', fit: 'fill' }).png().toBuffer();
    expect(await edgeEnergy(out!)).toBeGreaterThan(await edgeEnergy(lanczos));
  }, 60_000);

  it('keeps a cutout’s transparency (corners stay see-through, the ink stays solid)', async () => {
    const out = await superResolve(await lineDrawing(96, 72, true), 384, 288);
    const { data, info } = await sharp(out!).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);
    expect(data[3]).toBe(0); // top-left corner
    const ringY = 144 - 96; // the ring's top edge at ×4 (cy − r)
    expect(data[(ringY * 384 + 192) * 4 + 3]).toBeGreaterThan(200);
  }, 60_000);

  it('a downscale target after the ×4 pass still lands exactly (×3 here)', async () => {
    const out = await superResolve(await lineDrawing(), 288, 216);
    expect(await sharp(out!).metadata()).toMatchObject({ width: 288, height: 216 });
  }, 60_000);

  it('caps the input size (big sources already have the detail; they get the classical tier)', () => {
    expect(srAccepts(1600, 1200)).toBe(true); // 1.9MP — a WhatsApp’d photo
    expect(srAccepts(4032, 3024)).toBe(false); // 12MP — a phone photo
    expect(srAccepts(0, 100)).toBe(false);
  });

  it('missing / tampered model → unavailable, and the tiered upscale falls back to classical', async () => {
    process.env.SR_MODEL_PATH = path.join(process.cwd(), 'package.json'); // wrong checksum
    resetSuperResForTests();
    expect(await superResAvailable()).toBe(false);
    expect(await superResolve(await lineDrawing(), 384, 288)).toBeNull();
    const res = await upscaleTiered(await lineDrawing(), 384, 288);
    expect(res.method).toBe('classical');
    expect(await sharp(res.buffer).metadata()).toMatchObject({ width: 384, height: 288 });
  });

  it('SR_DISABLED=1 turns it off', async () => {
    process.env.SR_DISABLED = '1';
    resetSuperResForTests();
    expect(await superResAvailable()).toBe(false);
  });
});

describe('tiered upscale — the tier follows the enlargement factor', () => {
  it('≤ 2× → classical (instant), even with the model present', async () => {
    const res = await upscaleTiered(await lineDrawing(), 192, 144);
    expect(res.method).toBe('classical');
  });
  it('> 2× → super-resolution', async () => {
    const res = await upscaleTiered(await lineDrawing(), 288, 216);
    expect(res.method).toBe('super-res');
  }, 60_000);
  it('runImageOp(UPSCALE) reports the tier it ran and returns one PNG with no metadata', async () => {
    const res = await runImageOp({ kind: 'UPSCALE', width: 384, height: 288 }, await lineDrawing());
    expect(res.method).toBe('super-res');
    expect(res.contentType).toBe('image/png');
    expect(res.sha256).toBe(createHash('sha256').update(res.buffer).digest('hex'));
    expect((await sharp(res.buffer).metadata()).exif).toBeUndefined();
  }, 60_000);
});
