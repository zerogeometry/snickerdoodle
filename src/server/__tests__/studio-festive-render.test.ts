import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { Resvg } from '@resvg/resvg-js';
import { festiveObjects } from '@/lib/studio-festive';
import { SHAPE_PATHS, type ShapeObject } from '@/lib/studio-objects';
import { renderStudioObjects } from '@/server/print/studioOverlay';
import { boxOf } from '@/ui/studio/objects-canvas';

const W = 600, H = 400;
const frame = { gw: W, gh: H, cropX: 0, cropY: 0 };
const white = () => sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();

/** Which pixels got ink (anything clearly not white). */
async function inked(png: Buffer): Promise<Uint8Array> {
  const { data, info } = await sharp(png).flatten({ background: '#ffffff' }).raw().toBuffer({ resolveWithObject: true });
  const m = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) m[i] = data[i * info.channels]! + data[i * info.channels + 1]! + data[i * info.channels + 2]! < 3 * 200 ? 1 : 0;
  return m;
}

/**
 * The BROWSER's drawing of a shape, step for step as objects-canvas drawObject does it — translate to
 * the box's centre, turn, step back half the box, scale the 100-box, fill evenodd, outline in box units — as SVG
 * so it runs without a canvas. The box comes from the browser's own boxOf().
 */
function browserDrawing(o: ShapeObject): Buffer {
  const b = boxOf(o, { gw: W, gh: H });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#ffffff"/>
    <g transform="translate(${b.cx} ${b.cy}) rotate(${b.rotation}) translate(${-b.w / 2} ${-b.h / 2}) scale(${b.w / 100} ${b.h / 100})">
      <path d="${SHAPE_PATHS[o.shape]}" fill="${o.fill}" fill-rule="evenodd"${o.strokeWidth > 0 ? ` stroke="${o.stroke}" stroke-width="${o.strokeWidth * 100}" stroke-linejoin="round"` : ''}/></g></svg>`;
  return Buffer.from(new Resvg(svg).render().asPng());
}

/**
 * Same picture, to the pixel: the share of one mask's ink that lies within a pixel of the other's
 * (both ways, the worse of the two). A turned layer is resampled on the server, which can land it
 * up to a pixel from the browser's — fine at print size, but enough to upset a strict overlap on a
 * thin snowflake arm.
 */
const near = (a: Uint8Array, b: Uint8Array, r = 1) => {
  const within = (src: Uint8Array, dst: Uint8Array) => {
    let ink = 0, ok = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!src[y * W + x]) continue;
        ink++;
        search: for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            const X = x + dx, Y = y + dy;
            if (X >= 0 && Y >= 0 && X < W && Y < H && dst[Y * W + X]) {
              ok++;
              break search;
            }
          }
      }
    return ok / Math.max(1, ink);
  };
  return Math.min(within(a, b), within(b, a));
};

const iou = (a: Uint8Array, b: Uint8Array) => {
  let both = 0, either = 0;
  for (let i = 0; i < a.length; i++) {
    both += a[i]! & b[i]!;
    either += a[i]! | b[i]!;
  }
  return both / either;
};

const sticker = (shape: ShapeObject['shape'], rotation = 0, extra: Partial<ShapeObject> = {}): ShapeObject => ({
  id: 's', type: 'shape', shape, fill: '#c8402a', stroke: '#2b2118', strokeWidth: 0, texture: 'smooth', x: 0.45, y: 0.55, w: 0.5, h: 0.5, rotation, ...extra,
});

describe('festive stickers print exactly where the preview drew them', () => {
  for (const [shape, rotation] of [['gingerbread', 0], ['christmasTree', 0], ['snowflake', 30], ['candyCane', 336], ['present', 0], ['holly', 0], ['bauble', 0]] as const) {
    it(`${shape}${rotation ? ` turned ${rotation}°` : ''}: server render == browser geometry`, async () => {
      const o = sticker(shape, rotation);
      const [server, browser] = await Promise.all([renderStudioObjects(await white(), frame, [o]).then(inked), inked(browserDrawing(o))]);
      const ink = browser.reduce((a, v) => a + v, 0);
      expect(ink).toBeGreaterThan(2000); // a real sticker, not a speck
      expect(near(server, browser)).toBeGreaterThan(0.99);
      if (!rotation) expect(iou(server, browser)).toBeGreaterThan(0.97); // unturned: the same pixels
    });
  }

  it('the details are cut out (evenodd): the gingerbread man’s eye shows the drawing underneath', async () => {
    // left eye at (44, 18) on the 100-box; the box is 200px square centred on (270, 220)
    const out = await inked(await renderStudioObjects(await white(), frame, [sticker('gingerbread')]));
    const box = { x: 270 - 100, y: 220 - 100 };
    expect(out[Math.round(box.y + 18 * 2) * W + Math.round(box.x + 44 * 2)]).toBe(0); // the eye: no ink
    expect(out[Math.round(box.y + 50 * 2) * W + Math.round(box.x + 30 * 2)]).toBe(1); // the tummy: ink
  });

  it('a whole festive touch (gold frame + holly tape + snowfall) prints like the preview, and leaves the middle alone', async () => {
    const area = { gw: W, gh: H, crop: { x: 0, y: 0, w: 1, h: 1 } };
    const objs = [...festiveObjects('goldFrame', area), ...festiveObjects('hollyTape', area), ...festiveObjects('snowfall', area)];
    const out = await renderStudioObjects(await white(), frame, objs);
    const server = await inked(out);
    // the browser draws each one in order; union of their ink
    const browser = new Uint8Array(W * H);
    for (const o of objs) {
      const m = await inked(browserDrawing(o));
      for (let i = 0; i < m.length; i++) browser[i]! |= m[i]!;
    }
    expect(near(server, browser)).toBeGreaterThan(0.98);
    // the drawing's middle is untouched (non-destructive: just layers on top, around the edges)
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => [...data.subarray((y * W + x) * info.channels, (y * W + x) * info.channels + 3)];
    expect(at(300, 200)).toEqual([255, 255, 255]);
    // the frame is gold at the edge
    expect(at(300, 6)).toEqual([246, 196, 69]);
  });
});
