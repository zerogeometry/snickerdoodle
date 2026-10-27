import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { Resvg } from '@resvg/resvg-js';
import { cleanFrame, FRAME_BAND, framePieces, frameSvg, STICKER_KINDS, stickerSvg } from '@/lib/studio-stickers';
import { cleanObjects, flipObjects } from '@/lib/studio-objects';
import { renderStudioObjects } from '@/server/print/studioOverlay';

const raw = async (png: Buffer) => {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { at: (x: number, y: number) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)], info, data };
};

describe('brand stickers — chunky, ink-outlined, die-cut, the same in the studio and in print', () => {
  it('every sticker draws: a transparent corner, a paper die-cut edge and dark ink inside', async () => {
    for (const k of STICKER_KINDS) {
      const { at, data } = await raw(Buffer.from(new Resvg(stickerSvg(k, 200)).render().asPng()));
      expect(at(0, 0)[3], k).toBe(0); // not a square tile
      let ink = 0, paper = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3]! > 250 && data[i]! < 60 && data[i + 1]! < 50) ink++;
        if (data[i + 3]! > 250 && data[i]! > 250 && data[i + 1]! > 245 && data[i + 2]! > 235) paper++;
      }
      expect(ink, k).toBeGreaterThan(300);
      expect(paper, k).toBeGreaterThan(300);
    }
  });

  it('only known stickers survive the browser-cleaning, always smooth, sizes clamped', () => {
    const objs = cleanObjects([
      { type: 'sticker', sticker: 'heart', x: 0.5, y: 0.5, w: 9, h: 0.001, rotation: 10, texture: 'crayon', opacity: 0.5 },
      { type: 'sticker', sticker: 'skull' },
      { type: 'sticker', sticker: '<script>' },
    ]);
    expect(objs).toEqual([{ id: expect.any(String), type: 'sticker', sticker: 'heart', x: 0.5, y: 0.5, w: 2, h: 0.02, rotation: 10, texture: 'smooth', opacity: 0.5 }]);
  });

  it('a flip moves a sticker but never mirrors it (like words)', () => {
    const [s] = flipObjects(cleanObjects([{ type: 'sticker', sticker: 'star', x: 0.2, y: 0.3, w: 0.2, h: 0.2, rotation: 15 }]), 'h');
    expect(s).toMatchObject({ x: 0.8, y: 0.3, rotation: -15, sticker: 'star' });
  });

  it('prints where it was placed, at full size', async () => {
    const W = 600, H = 400;
    const white = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
    const out = await renderStudioObjects(white, { gw: W, gh: H, cropX: 0, cropY: 0 }, cleanObjects([{ id: 'h', type: 'sticker', sticker: 'heart', x: 0.5, y: 0.5, w: 0.5, h: 0.5, rotation: 0 }]));
    const { at } = await raw(out);
    expect(at(300, 205).slice(0, 3)).toEqual([232, 120, 110]); // berry, in the middle of the heart
    expect(at(30, 30).slice(0, 3)).toEqual([255, 255, 255]); // the rest untouched
  });
});

describe('framed in gold', () => {
  it('a honey band with ink edges, sized to the design; the middle untouched', async () => {
    const W = 500, H = 300;
    const t = FRAME_BAND * Math.min(W, H);
    const { at } = await raw(Buffer.from(new Resvg(frameSvg('gold', W, H)).render().asPng()));
    expect(at(0, 150).slice(0, 3)).toEqual([43, 33, 24]); // ink at the very edge
    expect(at(Math.round(t * 0.25), 150).slice(0, 3)).toEqual([246, 196, 69]); // honey band
    expect(at(Math.round(t - 1), 150).slice(0, 3)).toEqual([43, 33, 24]); // ink at the inner edge
    expect(at(250, 150)[3]).toBe(0); // the design shows through
  });

  it('the browser draws the very same rectangles as the print', () => {
    const pieces = framePieces('gold', 500, 300);
    const svg = frameSvg('gold', 500, 300);
    for (const r of pieces) expect(svg).toContain(`x="${r.x.toFixed(2)}" y="${r.y.toFixed(2)}"`);
    expect(cleanFrame('gold')).toBe('gold');
    expect(cleanFrame('glitter')).toBeNull();
  });
});
