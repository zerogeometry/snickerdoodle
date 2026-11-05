import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { FRAME_GRIDS, frameSlotRects, prodigiPx, slotBleedPx, slotPx, type FrameGrid } from '@/lib/multi-photo-frame';
import { composeFrameGrid, renderFrameGridFacePixels, renderFrameTile } from '../frameGrid';
import type { Transform } from '../geometry';

// The multi photo frame's ONE print file, composed from a tile per square — at Prodigi's exact
// pixels, every square where Prodigi's template puts its window (src/lib/__tests__/
// multi-photo-frame.test.ts holds the positions to the template within 1 px).

const COVER: Transform = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 };
/** A distinct, saturated colour per square (never white). */
const colourOf = (i: number): [number, number, number] => [40 + ((i * 53) % 180), 30 + ((i * 97) % 190), 20 + ((i * 151) % 200)];
const solid = (rgb: [number, number, number], w = 1200, h = 900) => sharp({ create: { width: w, height: h, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }).png().toBuffer();
/** A drawing whose left half is red and right half blue — shows which part of it a square holds. */
const halves = async () =>
  sharp({ create: { width: 1200, height: 900, channels: 3, background: { r: 220, g: 0, b: 0 } } })
    .composite([{ input: await sharp({ create: { width: 600, height: 900, channels: 3, background: { r: 0, g: 0, b: 220 } } }).png().toBuffer(), left: 600, top: 0 }])
    .png()
    .toBuffer();

async function pixels(png: Buffer) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  return { at: (x: number, y: number) => [data[(y * info.width + x) * info.channels]!, data[(y * info.width + x) * info.channels + 1]!, data[(y * info.width + x) * info.channels + 2]!], info };
}
const near = (a: number[], b: number[], tol = 6) => a.every((v, i) => Math.abs(v - b[i]!) <= tol);
const WHITE = [255, 255, 255];

async function tilesFor(grid: FrameGrid, drawing: (i: number) => Promise<Buffer>, transform: (i: number) => Transform = () => COVER): Promise<Buffer[]> {
  const out: Buffer[] = [];
  for (let i = 0; i < grid.cols * grid.rows; i++) {
    const buf = await drawing(i);
    const m = await sharp(buf).metadata();
    out.push((await renderFrameTile(buf, { width: m.width!, height: m.height! }, grid, transform(i))).png);
  }
  return out;
}

describe('the frame print file — exact px, every square in place, each with its own drawing', () => {
  for (const grid of FRAME_GRIDS) {
    const want = prodigiPx(grid);
    it(`${grid.size} ${grid.orientation}: Prodigi’s ${want.w}×${want.h} px at 300 dpi${grid.turned ? ' (designed landscape, turned)' : ''}, each square’s drawing filling exactly its window${grid.mounted ? ' + 3 mm bleed' : ''}, white between`, async () => {
      const file = await composeFrameGrid(grid, await tilesFor(grid, (i) => solid(colourOf(i))));
      const meta = await sharp(file).metadata();
      expect([meta.width, meta.height, meta.density]).toEqual([want.w, want.h, 300]);
      // read it the way it hangs (a landscape frame's file is turned a quarter for Prodigi)
      const { at, info } = await pixels(grid.turned ? await sharp(file).rotate(-90).png().toBuffer() : file);
      expect([info.width, info.height]).toEqual([grid.pxW, grid.pxH]);
      const b = slotBleedPx(grid);
      for (const [i, r] of frameSlotRects(grid).entries()) {
        const c = colourOf(i);
        const mid = Math.round(r.y + r.size / 2);
        const cx = Math.round(r.x + r.size / 2);
        // the square's own drawing, centre and corners of its window
        expect(near(at(cx, mid), c), `square ${i + 1} centre`).toBe(true);
        for (const [x, y] of [[r.x, r.y], [r.x + r.size - 1, r.y], [r.x, r.y + r.size - 1], [r.x + r.size - 1, r.y + r.size - 1]] as const) {
          expect(near(at(x, y), c), `square ${i + 1} corner ${x},${y}`).toBe(true);
        }
        // the art stops exactly at its window (+ the bleed under a mount): white just outside it
        expect(near(at(r.x - b, mid), c), `square ${i + 1} left edge`).toBe(true);
        expect(near(at(r.x - b - 1, mid), WHITE), `square ${i + 1} outside left`).toBe(true);
        expect(near(at(r.x + r.size - 1 + b, mid), c), `square ${i + 1} right edge`).toBe(true);
        expect(near(at(r.x + r.size + b, mid), WHITE), `square ${i + 1} outside right`).toBe(true);
        expect(near(at(cx, r.y - b - 1), WHITE), `square ${i + 1} outside top`).toBe(true);
        expect(near(at(cx, r.y + r.size + b), WHITE), `square ${i + 1} outside bottom`).toBe(true);
      }
      // the margin and a gap are clean paper
      expect(near(at(5, 5), WHITE)).toBe(true);
      const [a, c] = frameSlotRects(grid);
      expect(near(at(Math.round((a!.x + a!.size + c!.x) / 2), a!.y + 10), WHITE)).toBe(true);
    }, 120_000); // up to a 75-megapixel sheet of 60 tiles
  }

  it('each square keeps its OWN placement (a pan shows that part of its drawing; the default fills it whole)', async () => {
    const grid = FRAME_GRIDS[0]!;
    const zoomed = (i: number): Transform => (i === 1 ? { scale: 2, offsetX: -1, offsetY: 0, rotationDeg: 0 } : i === 2 ? { scale: 2, offsetX: 1, offsetY: 0, rotationDeg: 0 } : COVER);
    const file = await composeFrameGrid(grid, await tilesFor(grid, halves, zoomed));
    const { at } = await pixels(file);
    const [s1, s2, s3] = frameSlotRects(grid);
    const row = Math.round(s1!.y + s1!.size / 2);
    const red = [220, 0, 0], blue = [0, 0, 220];
    // square 1 (cover): the whole drawing — red on its left, blue on its right
    expect(near(at(s1!.x + 40, row), red)).toBe(true);
    expect(near(at(s1!.x + s1!.size - 40, row), blue)).toBe(true);
    // square 2 zoomed + panned one way, square 3 the other: each shows only one half of the drawing
    expect(near(at(s2!.x + 40, row), blue) && near(at(s2!.x + s2!.size - 40, row), blue)).toBe(true);
    expect(near(at(s3!.x + 40, row), red) && near(at(s3!.x + s3!.size - 40, row), red)).toBe(true);
  });

  it('refuses a frame with a square missing, or a tile of the wrong size', { timeout: 30_000 }, async () => {
    const grid = FRAME_GRIDS[0]!;
    const tiles = await tilesFor(grid, (i) => solid(colourOf(i), 300, 300));
    await expect(composeFrameGrid(grid, tiles.slice(0, 8))).rejects.toThrow(/needs 9 squares/);
    const big = FRAME_GRIDS.find((g) => g.size === '24×36″')!;
    await expect(composeFrameGrid(big, tiles)).rejects.toThrow(/needs 60 squares/);
    const wrong = await sharp({ create: { width: slotPx(grid) + 2, height: slotPx(grid) + 2, channels: 3, background: '#fff' } }).png().toBuffer();
    await expect(composeFrameGrid(grid, [...tiles.slice(0, 8), wrong])).rejects.toThrow(/square 9.s tile/);
  });

  it('a square’s tile is its window + bleed, at print size', async () => {
    for (const grid of FRAME_GRIDS) {
      const { png, edge } = await renderFrameTile(await solid([10, 120, 30]), { width: 1200, height: 900 }, grid, COVER);
      const m = await sharp(png).metadata();
      expect([m.width, m.height, edge]).toEqual([slotPx(grid) + 2 * slotBleedPx(grid), slotPx(grid) + 2 * slotBleedPx(grid), slotPx(grid) + 2 * slotBleedPx(grid)]);
    }
  });
});

describe('the catalogue tile’s printed face — the drawing in every square', () => {
  it('a preview-size copy of the print: the one drawing in every square, white between', async () => {
    for (const grid of FRAME_GRIDS) {
      const scale = 0.1;
      const face = await renderFrameGridFacePixels(await solid([10, 120, 30]), grid, COVER, scale);
      expect([face.width, face.height]).toEqual([Math.round(grid.pxW * scale), Math.round(grid.pxH * scale)]);
      const at = (x: number, y: number) => [0, 1, 2].map((k) => face.data[(y * face.width + x) * 3 + k]!);
      for (const r of frameSlotRects(grid)) {
        expect(near(at(Math.round((r.x + r.size / 2) * scale), Math.round((r.y + r.size / 2) * scale)), [10, 120, 30])).toBe(true);
      }
      expect(near(at(2, 2), WHITE)).toBe(true);
    }
  });
});
