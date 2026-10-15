import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { cleanObjects, flipObjects, rotateObjects, type StudioObject, type TextObject } from '@/lib/studio-objects';
import { textureTiles } from '@/lib/textures';
import { renderStudioObjects } from '@/server/print/studioOverlay';

const W = 600, H = 400;
const white = () => sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
async function px(buf: Buffer) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return (x: number, y: number) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];
}
const frame = { gw: W, gh: H, cropX: 0, cropY: 0 };

describe('studio objects — cleaned, carried through turns/flips, rendered crisp', () => {
  it('renders a shape where it was placed, in its colour', async () => {
    const out = await renderStudioObjects(await white(), frame, [{ id: 'a', type: 'shape', shape: 'square', fill: '#d7352c', stroke: '#2b2118', strokeWidth: 0, texture: 'smooth', x: 0.5, y: 0.5, w: 0.3, h: 0.3, rotation: 0 }]);
    const at = await px(out);
    expect(at(300, 200).slice(0, 3)).toEqual([215, 53, 44]);
    expect(at(20, 20).slice(0, 3)).toEqual([255, 255, 255]);
  });

  it('renders text in the card font and colour, centred on its point', async () => {
    const out = await renderStudioObjects(await white(), frame, [{ id: 't', type: 'text', text: 'MIA', font: 'baloo', colour: '#2f5da8', size: 0.2, x: 0.5, y: 0.5, rotation: 0, texture: 'smooth' }]);
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    let inked = 0, minX = W, maxX = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = (y * info.width + x) * info.channels;
        if (data[i + 2]! > 120 && data[i]! < 120) {
          inked++;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
        }
      }
    expect(inked).toBeGreaterThan(500); // real glyphs, in blue
    expect(Math.abs((minX + maxX) / 2 - 300)).toBeLessThan(12); // centred
  });

  it('renders a pen stroke, and clips anything running off the edge (no crash)', async () => {
    const stroke: StudioObject = { id: 's', type: 'stroke', colour: '#111111', width: 0.03, points: [-0.2, 0.5, 0.5, 0.5, 0.5, 0.5, 1.2, 0.5, 0.5], texture: 'smooth' };
    const out = await renderStudioObjects(await white(), frame, [stroke]);
    const at = await px(out);
    expect(at(300, 200)[0]).toBeLessThan(40);
    expect(at(5, 200)[0]).toBeLessThan(40);
  });

  it('later objects sit on top', async () => {
    const out = await renderStudioObjects(await white(), frame, [
      { id: 'a', type: 'shape', shape: 'square', fill: '#d7352c', stroke: '#2b2118', strokeWidth: 0, texture: 'smooth', x: 0.5, y: 0.5, w: 0.3, h: 0.3, rotation: 0 },
      { id: 'b', type: 'shape', shape: 'circle', fill: '#4f9d3a', stroke: '#2b2118', strokeWidth: 0, texture: 'smooth', x: 0.5, y: 0.5, w: 0.1, h: 0.1, rotation: 0 },
    ]);
    expect((await px(out))(300, 200).slice(0, 3)).toEqual([79, 157, 58]);
  });

  it('never trusts the client: unknown types/fonts/colours dropped or defaulted, sizes clamped', () => {
    const objs = cleanObjects([
      { type: 'text', text: 'hi', font: 'comic-sans', colour: 'red', size: 99, x: 0.5, y: 0.5 },
      { type: 'shape', shape: 'skull', fill: '#000000' },
      { type: 'script', text: '<svg/onload=alert(1)>' },
      { type: 'text', text: '   ' },
      { type: 'stroke', colour: '#123456', width: 5, points: [0, 0, 0.5, 1, 1, 0.5] },
    ]);
    expect(objs).toHaveLength(2);
    expect(objs[0]).toMatchObject({ type: 'text', font: 'caveat', colour: '#2b2118', size: 1 });
    expect(objs[1]).toMatchObject({ type: 'stroke', width: 0.3 });
  });

  it('a quarter turn / flip carries objects with the picture; text is never mirrored', () => {
    const t: TextObject = { id: 't', type: 'text', text: 'hi', font: 'caveat', colour: '#000000', size: 0.1, x: 0.2, y: 0.1, rotation: 0, texture: 'smooth' };
    const [r] = rotateObjects([t]) as [typeof t];
    expect([r.x, r.y, r.rotation]).toEqual([0.9, 0.2, 90]);
    const [f] = flipObjects([t], 'h') as [typeof t];
    expect([f.x, f.y, f.text]).toEqual([0.8, 0.1, 'hi']);
  });

  it('old saves still load: `outline: true` becomes a dark 5% outline; unknown textures are smooth', () => {
    const [a, b] = cleanObjects([
      { type: 'shape', shape: 'heart', fill: '#ffffff', outline: true },
      { type: 'shape', shape: 'star', fill: '#ffffff', stroke: 'javascript:', strokeWidth: 9, texture: 'glitter' },
    ]) as [Extract<StudioObject, { type: 'shape' }>, Extract<StudioObject, { type: 'shape' }>];
    expect([a.stroke, a.strokeWidth, a.texture]).toEqual(['#2b2118', 0.05, 'smooth']);
    expect([b.stroke, b.strokeWidth, b.texture]).toEqual(['#2b2118', 0.2, 'smooth']);
  });

  it('a shape outline prints in its own colour and thickness', async () => {
    const out = await renderStudioObjects(await white(), frame, [{ id: 'a', type: 'shape', shape: 'square', fill: '#ffffff', stroke: '#2f5da8', strokeWidth: 0.1, texture: 'smooth', x: 0.5, y: 0.5, w: 0.5, h: 0.5, rotation: 0 }]);
    const at = await px(out);
    // the square spans x 200–400 on its 100-box path (6–94): its left edge sits near x 212
    expect(at(212, 200).slice(0, 3)).toEqual([47, 93, 168]);
    expect(at(300, 200).slice(0, 3)).toEqual([255, 255, 255]); // fill stays white
  });

  it('textures are seamless and the same every time (browser preview == print)', () => {
    for (const k of ['crayon', 'chalk', 'paint'] as const) {
      const t = textureTiles(k);
      expect(t.size).toBe(256);
      const again = textureTiles(k);
      expect(again.mask).toBe(t.mask);
      // seamless: the left/right columns differ about as little as neighbouring columns do
      let edge = 0, inner = 0;
      for (let y = 0; y < t.size; y++) {
        edge += Math.abs(t.mask[(y * t.size + t.size - 1) * 4 + 3]! - t.mask[(y * t.size) * 4 + 3]!);
        inner += Math.abs(t.mask[(y * t.size + 100) * 4 + 3]! - t.mask[(y * t.size + 101) * 4 + 3]!);
      }
      expect(edge).toBeLessThan(inner * 2.5 + 50);
    }
  });

  it('crayon lets paper show through; chalk more so; paint keeps nearly all the colour', async () => {
    const cover = async (texture: 'crayon' | 'chalk' | 'paint' | 'smooth') => {
      const out = await renderStudioObjects(await white(), frame, [{ id: 'a', type: 'shape', shape: 'square', fill: '#d7352c', stroke: '#2b2118', strokeWidth: 0, texture, x: 0.5, y: 0.5, w: 0.6, h: 0.6, rotation: 0 }]);
      const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
      let red = 0, n = 0;
      for (let y = 140; y < 260; y++)
        for (let x = 240; x < 360; x++) {
          const i = (y * info.width + x) * info.channels;
          n++;
          if (data[i]! - data[i + 1]! > 80) red++;
        }
      return red / n;
    };
    const [smooth, crayon, chalk, paint] = await Promise.all([cover('smooth'), cover('crayon'), cover('chalk'), cover('paint')]);
    expect(smooth).toBe(1);
    expect(paint).toBeGreaterThan(0.95);
    expect(crayon).toBeLessThan(0.97);
    expect(crayon).toBeGreaterThan(0.6);
    expect(chalk).toBeLessThan(crayon);
  });
});
