import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { renderTemplatePreview } from '../compositor';

/**
 * A BASE COLOUR under a PLACED drawing (founder, 22 Oct: "for all items that allow us to print all
 * over… the option of choosing a base colour"): the preview fills the WHOLE print area with it, the
 * drawing on top — on a straight and on an angled print area — and only on edge-to-edge products.
 */
const blank = () => sharp({ create: { width: 400, height: 400, channels: 3, background: '#f2f2f2' } }).png().toBuffer();
// a see-through drawing (lifted off its paper): a small red blob in the middle
const drawing = () =>
  sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="40" fill="#c8402a"/></svg>')).png().toBuffer();
const print = { widthPx: 600, heightPx: 600, bleedMm: 0, requiredDpi: 150 };
const STRAIGHT: [number, number][] = [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]];
const SKEWED: [number, number][] = [[0.22, 0.2], [0.8, 0.24], [0.78, 0.8], [0.2, 0.76]];

/** The colour at (fx, fy) of the picture, as fractions of its size. */
async function at(img: Buffer, fx: number, fy: number) {
  const { data, info } = await sharp(img).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (Math.round(fy * (info.height - 1)) * info.width + Math.round(fx * (info.width - 1))) * 3;
  return [data[i]!, data[i + 1]!, data[i + 2]!] as const;
}
const greenish = ([r, g, b]: readonly [number, number, number]) => g > r + 40 && g > b + 20;
const blankish = ([r, g, b]: readonly [number, number, number]) => r > 225 && g > 225 && b > 225;

describe('a placed drawing on a base colour — the preview', () => {
  for (const [name, quad] of [['straight', STRAIGHT], ['angled / perspective', SKEWED]] as const) {
    it(`fills the whole ${name} print area with the colour, the drawing on top`, async () => {
      const out = await renderTemplatePreview({ blank: await blank(), quad, materialClass: 'PAPER', design: await drawing(), productKey: 'cushion', print, ground: '#0b6623' });
      expect(greenish(await at(out, 0.3, 0.3)), 'a corner of the print area is the colour').toBe(true);
      expect(greenish(await at(out, 0.7, 0.68)), 'the other corner too').toBe(true);
      const [r, g] = await at(out, 0.5, 0.5);
      expect(r).toBeGreaterThan(g + 40); // the red drawing sits on top
      expect(blankish(await at(out, 0.05, 0.05)), 'outside the print area is the photo').toBe(true);
    });
  }

  it('no colour (or white) leaves the drawing on the plain product', async () => {
    for (const ground of [undefined, '#ffffff']) {
      const out = await renderTemplatePreview({ blank: await blank(), quad: STRAIGHT, materialClass: 'PAPER', design: await drawing(), productKey: 'cushion', print, ground });
      expect(blankish(await at(out, 0.3, 0.3))).toBe(true);
    }
  });

  it('a product that can’t take a base colour ignores it (a garment prints on its own colour)', async () => {
    const out = await renderTemplatePreview({ blank: await blank(), quad: STRAIGHT, materialClass: 'PAPER', design: await drawing(), productKey: 'kidsTee', print, ground: '#0b6623' });
    expect(blankish(await at(out, 0.3, 0.3))).toBe(true);
  });
});
