import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { Resvg } from '@resvg/resvg-js';
import { stickersIn, stickerSvg } from '@/lib/stickers';
import { EVERYDAY_IDS } from '@/lib/stickers/everyday-art';
import { presetIsOn, toggleFestive } from '@/lib/studio-festive';
import { cleanObjects, flipObjects, type StudioObject } from '@/lib/studio-objects';
import { renderStudioObjects } from '@/server/print/studioOverlay';

const raw = async (png: Buffer) => {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { at: (x: number, y: number) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)], info, data };
};

describe('everyday stickers — chunky, ink-outlined, straight on the canvas, the same in the studio and in print', () => {
  it('the everyday drawer offers exactly the nine doodles', () => {
    expect(stickersIn('everyday').map((s) => s.id)).toEqual([...EVERYDAY_IDS]);
  });

  it('every sticker draws: a see-through corner, dark ink, and no white die-cut ring (founder, 26 Oct)', async () => {
    for (const k of EVERYDAY_IDS) {
      const { at, data, info } = await raw(Buffer.from(new Resvg(stickerSvg(k)).render().asPng()));
      expect(at(0, 0)[3], k).toBe(0); // not a square tile
      let ink = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i + 3]! > 250 && data[i]! < 60 && data[i + 1]! < 50) ink++;
      expect(ink, k).toBeGreaterThan(300);
      // a die-cut border would put opaque paper in the margin round the art: the margin is clear
      for (const [x, y] of [[4, info.height / 2], [info.width - 5, info.height / 2], [info.width / 2, 4], [info.width / 2, info.height - 5]] as const) {
        expect(at(Math.round(x), Math.round(y))[3], `${k} margin`).toBe(0);
      }
    }
  });

  it('only known stickers survive the browser-cleaning', () => {
    const objs = cleanObjects([
      { id: 'a', type: 'sticker', sticker: 'heart', x: 0.5, y: 0.5, size: 0.3, rotation: 10, flip: false, opacity: 0.5 },
      { type: 'sticker', sticker: 'skull' },
      { type: 'sticker', sticker: '<script>' },
    ]);
    expect(objs).toEqual([{ id: 'a', type: 'sticker', sticker: 'heart', x: 0.5, y: 0.5, size: 0.3, rotation: 10, flip: false, opacity: 0.5 }]);
  });

  it('a flip moves a sticker to the other side', () => {
    const [s] = flipObjects(cleanObjects([{ id: 'b', type: 'sticker', sticker: 'happyStar', x: 0.2, y: 0.3, size: 0.2, rotation: 15, flip: false }]), 'h');
    expect(s).toMatchObject({ x: 0.8, y: 0.3, sticker: 'happyStar' });
  });

  it('prints where it was placed, at full size', async () => {
    const W = 600, H = 400;
    const white = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
    const out = await renderStudioObjects(white, { gw: W, gh: H, cropX: 0, cropY: 0 }, cleanObjects([{ id: 'h', type: 'sticker', sticker: 'heart', x: 0.5, y: 0.5, size: 0.5, rotation: 0, flip: false }]));
    const { at } = await raw(out);
    expect(at(300, 205).slice(0, 3)).toEqual([232, 120, 110]); // berry, in the middle of the heart
    expect(at(30, 30).slice(0, 3)).toEqual([255, 255, 255]); // the rest untouched
  });
});

describe('framed in gold (the stickers drawer) is the one gold frame — the same as the christmas drawer’s', () => {
  const area = { gw: 800, gh: 600, crop: { x: 0, y: 0, w: 1, h: 1 } };
  const mine: StudioObject = { id: 'mine', type: 'sticker', sticker: 'sun', x: 0.5, y: 0.5, size: 0.3, rotation: 0, flip: false };

  it('one tap frames it, under everything added; another takes it off — the drawing is never touched', () => {
    const on = toggleFestive([mine], 'goldFrame', area)!;
    expect(presetIsOn(on, 'goldFrame')).toBe(true);
    expect(on.at(-1)).toBe(mine); // stickers and words stay on top of the frame
    const off = toggleFestive(on, 'goldFrame', area)!;
    expect(off).toEqual([mine]);
  });
});
