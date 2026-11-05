import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { FRAME_GRIDS, frameSlotRects, MULTI_FRAME_COLOURS } from '@/lib/multi-photo-frame';
import { buildFrameLayout, FRAME_FINISH, finishOf, frameLayoutDir, LAYOUT_EDGE, recolourFrame } from '../frameLayout';
import { decodeBundleLayout, decodeDrawing, encodeBundle, renderBundleLayers } from '../bundleMockup';

// The multi photo frames' pictures from the founder's PSDs (frameLayout.ts). The layers live only on the
// founder's machine (.prodigi-assets, gitignored) — without them these checks skip, like the other
// founder-photo tests.
const BACKDROP = path.join(process.cwd(), '.prodigi-assets', 'blanks', 'layered', 'bauble', 'ceramic', 'background.png');
const staged = FRAME_GRIDS.every((g) => frameLayoutDir(g)) && existsSync(BACKDROP);

const moulding = async (png: Buffer): Promise<[number, number, number]> => {
  const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let n = 0, r = 0, g = 0, b = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i + 3]! > 200) { n++; r += data[i]!; g += data[i + 1]!; b += data[i + 2]!; }
  return [r / n, g / n, b / n];
};

describe.skipIf(!staged)('the multi photo frames’ pictures — the founder’s layers', () => {
  for (const grid of FRAME_GRIDS) {
    it(`${grid.name}: one numbered print map per square, in Prodigi’s grid, square N where square N prints`, async () => {
      const built = await buildFrameLayout(frameLayoutDir(grid)!, 'gold', BACKDROP);
      expect(Math.max(built.W, built.H)).toBeLessThanOrEqual(LAYOUT_EDGE); // stored small: a preview reads little
      expect(built.regions.map((r) => [r.role, r.index])).toEqual(Array.from({ length: grid.cols * grid.rows }, (_, i) => ['square', i]));
      // each map's centre vs where Prodigi's layout puts that square, after the one scale + shift that fits
      // them best: the founder's maps are the print's own grid (within 3% of a square's pitch)
      const ours = built.regions.map((r) => {
        const xs = r.quad.map((p) => p[0]! * built.W), ys = r.quad.map((p) => p[1]! * built.H);
        return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      });
      const print = frameSlotRects(grid).map((r) => ({ x: r.x + r.size / 2, y: r.y + r.size / 2 }));
      const fit = (k: 'x' | 'y') => {
        const n = print.length, mp = print.reduce((a, p) => a + p[k], 0) / n, mo = ours.reduce((a, p) => a + p[k], 0) / n;
        const s = print.reduce((a, p, i) => a + (p[k] - mp) * (ours[i]![k] - mo), 0) / print.reduce((a, p) => a + (p[k] - mp) ** 2, 0);
        return (v: number) => mo + s * (v - mp);
      };
      const fx = fit('x'), fy = fit('y');
      const pitch = Math.abs(ours[1]!.x - ours[0]!.x);
      for (const [i, p] of print.entries()) {
        expect(Math.abs(fx(p.x) - ours[i]!.x), `square ${i + 1} across`).toBeLessThanOrEqual(0.03 * pitch);
        expect(Math.abs(fy(p.y) - ours[i]!.y), `square ${i + 1} down`).toBeLessThanOrEqual(0.03 * pitch);
        expect(Math.abs(ours[i]!.w / ours[i]!.h - 1), `square ${i + 1} is square`).toBeLessThan(0.04);
      }
    }, 60_000);
  }

  it('each frame layer is read as the Prodigi colour it is; that colour is used as supplied', async () => {
    const dir = (name: string) => frameLayoutDir({ name })!;
    expect(finishOf(await moulding(await sharp(path.join(dir('6x4'), 'frame.png')).png().toBuffer()))).toBe('gold');
    expect(finishOf(await moulding(await sharp(path.join(dir('3x3'), 'frame.png')).png().toBuffer()))).toBe('black');
    const own = await recolourFrame(path.join(dir('3x3'), 'frame.png'), 'black');
    expect((await sharp(own).raw().toBuffer()).equals(await sharp(path.join(dir('3x3'), 'frame.png')).ensureAlpha().raw().toBuffer())).toBe(true);
  });

  it('every colour lands on Prodigi’s, from either kind of source frame', async () => {
    for (const name of ['6x4', '3x3']) {
      const src = await sharp(path.join(frameLayoutDir({ name })!, 'frame.png')).resize(600).png().toBuffer();
      for (const colour of MULTI_FRAME_COLOURS) {
        const mean = await moulding(await recolourFrame(src, colour));
        const want = FRAME_FINISH[colour]!.rgb;
        // within a few shades of the colour sampled from Prodigi's own frame photo (the shading averages out)
        for (const c of [0, 1, 2]) expect(Math.abs(mean[c]! - want[c]!), `${name} ${colour}`).toBeLessThanOrEqual(colour === 'black' ? 14 : 18);
        expect(finishOf(mean), `${name} ${colour}`).toBe(colour);
      }
    }
  });

  it('a catalogue picture is quick and small: the one drawing in every square, a few kB', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700"><rect width="900" height="700" fill="#FBF5E9"/><circle cx="450" cy="320" r="220" fill="#C8402A"/></svg>';
    const d = await decodeDrawing(await sharp(Buffer.from(svg)).png().toBuffer());
    const grid = FRAME_GRIDS.find((g) => g.name === '6x4')!;
    const built = await buildFrameLayout(frameLayoutDir(grid)!, 'gold', BACKDROP);
    const layout = await decodeBundleLayout(built.base, built.regions, 512); // the catalogue tile's working size
    const out = await encodeBundle(await renderBundleLayers(layout, () => d));
    expect(out.buffer.byteLength).toBeLessThan(40 * 1024);
    // every square shows the drawing (its centre is the drawing's red, not the white backing)
    const { data, info } = await sharp(out.buffer).raw().toBuffer({ resolveWithObject: true });
    for (const r of layout.regions) {
      const cx = Math.round(r.box.x + r.box.w / 2), cy = Math.round(r.box.y + r.box.h / 2);
      const i = (cy * info.width + cx) * info.channels;
      expect(data[i]! - data[i + 2]!, `square ${r.index + 1}`).toBeGreaterThan(80);
    }
  }, 60_000);
});
