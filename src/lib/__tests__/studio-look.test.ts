import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { applyLook, cleanLook, IDENTITY_LOOK, LOOK_IDS, lookIsIdentity, type StudioLook } from '@/lib/studio-look';
import { applyLookToImage } from '@/server/studio-doc';

const look = (p: Partial<StudioLook>): StudioLook => ({ ...IDENTITY_LOOK, ...p });
const one = (rgb: [number, number, number], l: StudioLook) => {
  const px = new Uint8ClampedArray(rgb);
  applyLook(px, 3, l);
  return [...px];
};

/** A little test picture: every 8-bit level of each channel, plus mixes, with varied alpha. */
function testPixels(): { w: number; h: number; rgba: Buffer } {
  const w = 64, h = 48;
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      rgba[i] = (x * 4) & 255;
      rgba[i + 1] = (y * 5 + x) & 255;
      rgba[i + 2] = (255 - x * 3) & 255;
      rgba[i + 3] = (x * 7 + y * 3) & 255;
    }
  return { w, h, rgba };
}

describe('studio looks — numbers in the recipe, the same pixels everywhere', () => {
  it('nothing set = nothing changes (and is stored as nothing)', () => {
    expect(cleanLook(IDENTITY_LOOK)).toBeNull();
    expect(cleanLook({ ...IDENTITY_LOOK, filter: 'mono', intensity: 0 })).toBeNull();
    expect(lookIsIdentity(null)).toBe(true);
    const px = new Uint8ClampedArray([1, 2, 3, 250, 128, 0]);
    applyLook(px, 3, IDENTITY_LOOK);
    expect([...px]).toEqual([1, 2, 3, 250, 128, 0]);
  });

  it('never trusts the browser: out-of-range numbers are clamped, unknown looks dropped', () => {
    expect(cleanLook({ brightness: 900, contrast: -900, saturation: 'x', warmth: 12.6, filter: 'evil', intensity: 50 })).toEqual({
      brightness: 100,
      contrast: -100,
      saturation: 0,
      warmth: 13,
      filter: null,
      intensity: 50,
    });
    expect(cleanLook('nope')).toBeNull();
  });

  it('brighter lifts the darks but keeps white white; darker keeps black black', () => {
    expect(one([255, 255, 255], look({ brightness: 100 }))).toEqual([255, 255, 255]);
    expect(one([40, 40, 40], look({ brightness: 50 }))[0]).toBeGreaterThan(40);
    expect(one([0, 0, 0], look({ brightness: -100 }))).toEqual([0, 0, 0]);
    expect(one([200, 200, 200], look({ brightness: -50 }))[0]).toBeLessThan(200);
  });

  it('contrast spreads tones from the middle; colour −100 is grey; warmth warms', () => {
    const [lo] = one([90, 90, 90], look({ contrast: 60 }));
    const [hi] = one([170, 170, 170], look({ contrast: 60 }));
    expect(lo!).toBeLessThan(90);
    expect(hi!).toBeGreaterThan(170);
    const [r, g, b] = one([200, 64, 42], look({ saturation: -100 }));
    expect(r).toBe(g);
    expect(g).toBe(b);
    const warm = one([128, 128, 128], look({ warmth: 100 }));
    expect(warm[0]!).toBeGreaterThan(warm[2]!);
  });

  it('every look changes colour, and "how much" fades it smoothly back to none', () => {
    for (const id of LOOK_IDS) {
      const full = one([200, 64, 42], look({ filter: id, intensity: 100 }));
      const half = one([200, 64, 42], look({ filter: id, intensity: 50 }));
      expect(full, id).not.toEqual([200, 64, 42]);
      const orig = [200, 64, 42];
      for (let c = 0; c < 3; c++) expect(Math.abs(half[c]! - (orig[c]! + full[c]!) / 2), id).toBeLessThanOrEqual(1);
    }
    const mono = one([200, 64, 42], look({ filter: 'mono' }));
    expect(new Set(mono).size).toBe(1);
  });

  it('alpha is never touched (RGBA in, the same alpha out)', () => {
    const { rgba } = testPixels();
    const px = new Uint8ClampedArray(rgba);
    applyLook(px, 4, look({ brightness: 40, contrast: -20, saturation: 70, warmth: -30, filter: 'poster', intensity: 80 }));
    for (let i = 3; i < px.length; i += 4) expect(px[i]).toBe(rgba[i]);
  });

  it('PREVIEW == PRINT: the browser’s RGB path and the server’s render give identical pixels', async () => {
    const { w, h, rgba } = testPixels();
    for (const l of [look({ brightness: 35, contrast: 25, saturation: -40, warmth: 60 }), look({ filter: 'storybook', intensity: 70 }), look({ brightness: -20, filter: 'pastel', intensity: 100 })]) {
      // browser: the editing copy's separate RGB array
      const rgb = new Uint8ClampedArray(w * h * 3);
      for (let k = 0; k < w * h; k++) for (let c = 0; c < 3; c++) rgb[k * 3 + c] = rgba[k * 4 + c]!;
      applyLook(rgb, 3, l);
      // server: a PNG through sharp, at full resolution
      const png = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
      const out = await sharp(await applyLookToImage(png, l)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect([out.info.width, out.info.height]).toEqual([w, h]);
      for (let k = 0; k < w * h; k++) {
        for (let c = 0; c < 3; c++) expect(out.data[k * 4 + c]).toBe(rgb[k * 3 + c]);
        expect(out.data[k * 4 + 3]).toBe(rgba[k * 4 + 3]);
      }
    }
  });
});
