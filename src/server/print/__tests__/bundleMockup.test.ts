import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildBundleLayout, coverQuadAt, decodeBundleLayout, decodeDrawing, minAreaTilt, renderBundleLayers, shapeMaskOf, SHADOW, type DecodedDrawing } from '../bundleMockup';

// The christmas family bundle's FAST compositor (bundleMockup.ts), on a small synthetic, brand-safe
// layout: a placemat, a coaster and two overlapping ornaments (print face + edge ring + string). The
// pre-flattened render (BASE + Σ drawing × WEIGHT) must equal stacking every layer one by one.
const W = 200, H = 200;
let dir: string;

function rgbaPng(paint: (x: number, y: number) => [number, number, number, number]): Promise<Buffer> {
  const d = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [r, g, b, a] = paint(x, y);
      d.set([r, g, b, a], (y * W + x) * 4);
    }
  return sharp(d, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}
const inRect = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => x >= x0 && x < x1 && y >= y0 && y < y1;
const disc = (x: number, y: number, cx: number, cy: number, r: number) => (x - cx) ** 2 + (y - cy) ** 2 < r * r;
const grey: [number, number, number, number] = [128, 128, 128, 255];
const none: [number, number, number, number] = [0, 0, 0, 0];

// the layers, bottom → top (as the founder's manifest lists them)
const LAYERS: Array<{ file: string; role: string; paint: (x: number, y: number) => [number, number, number, number] }> = [
  { file: '00-placemat.png', role: 'placemat', paint: (x, y) => (inRect(x, y, 20, 20, 162, 120) ? grey : none) }, // 142×100 ≈ the print's 1.415
  { file: '01-coaster.png', role: 'coaster', paint: (x, y) => (inRect(x, y, 20, 135, 70, 185) ? grey : none) },
  { file: '02-print1.png', role: 'ornament-print', paint: (x, y) => (disc(x, y, 110, 160, 22) ? grey : none) },
  { file: '03-edge1.png', role: 'ornament-edge', paint: (x, y) => (disc(x, y, 110, 160, 24) && !disc(x, y, 110, 160, 21) ? [230, 230, 230, 255] : none) },
  { file: '04-string1.png', role: 'ornament-string', paint: (x, y) => (inRect(x, y, 109, 125, 112, 150) ? [160, 120, 40, 255] : none) },
  { file: '05-print2.png', role: 'ornament-print', paint: (x, y) => (disc(x, y, 140, 165, 22) ? grey : none) }, // overlaps ornament 1
  { file: '06-edge2.png', role: 'ornament-edge', paint: (x, y) => (disc(x, y, 140, 165, 24) && !disc(x, y, 140, 165, 21) ? [230, 230, 230, 255] : none) },
  { file: '07-string2.png', role: 'ornament-string', paint: (x, y) => (inRect(x, y, 139, 130, 142, 155) ? [160, 120, 40, 255] : none) },
];

const solid = async (r: number, g: number, b: number): Promise<DecodedDrawing> => decodeDrawing(await sharp({ create: { width: 64, height: 64, channels: 3, background: { r, g, b } } }).png().toBuffer());

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'bundle-layout-'));
  for (const l of LAYERS) writeFileSync(path.join(dir, l.file), await rgbaPng(l.paint));
  writeFileSync(path.join(dir, 'backdrop.png'), await rgbaPng(() => [250, 244, 232, 255]));
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ canvas: [W, H], layers: LAYERS.map((l, i) => ({ order: i, name: l.file, file: l.file, kind: 'shape', role: l.role, bbox: [0, 0, W, H] })) }));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('the bundle compositor — pre-flattened, exact', () => {
  it('stores one base + one weight per print area, each area with an oriented rectangle at its print aspect', async () => {
    const b = await buildBundleLayout(dir, path.join(dir, 'backdrop.png'));
    expect(b.regions.map((r) => `${r.role}:${r.index}`)).toEqual(['placemat:0', 'coaster:0', 'ornament:0', 'ornament:1']);
    const aspect = (q: [number, number][]) => Math.hypot((q[1]![0] - q[0]![0]) * W, (q[1]![1] - q[0]![1]) * H) / Math.hypot((q[3]![0] - q[0]![0]) * W, (q[3]![1] - q[0]![1]) * H);
    expect(aspect(b.regions[0]!.quad)).toBeCloseTo(3425 / 2421, 3);
    expect(aspect(b.regions[1]!.quad)).toBeCloseTo(1, 3);
  });

  it('a render equals stacking every layer one by one (backdrop · shadow + art per piece · edges · strings)', async () => {
    const b = await buildBundleLayout(dir, path.join(dir, 'backdrop.png'));
    const layout = await decodeBundleLayout(b.base, b.regions);
    const red = await solid(220, 30, 30), blue = await solid(30, 60, 220), green = await solid(40, 170, 60);
    const art = { placemat: red, coaster: blue, ornament: [green, red] } as const;
    const fast = await renderBundleLayers(layout, (role, i) => (role === 'ornament' ? art.ornament[i]! : art[role]));

    // the naive way: every layer composited in order, the art clipped by its print area
    const shadow = async (src: Buffer) => {
      const a = await sharp(src).extractChannel(3).raw().toBuffer();
      const dx = Math.round(SHADOW.dxFrac * W), dy = Math.round(SHADOW.dyFrac * H);
      const shifted = Buffer.alloc(W * H);
      for (let y = dy; y < H; y++) for (let x = dx; x < W; x++) shifted[y * W + x] = a[(y - dy) * W + (x - dx)]!;
      const blurred = await sharp(shifted, { raw: { width: W, height: H, channels: 1 } }).blur(Math.max(0.3, SHADOW.blurFrac * W)).extractChannel(0).raw().toBuffer();
      const rgba = Buffer.alloc(W * H * 4);
      for (let p = 0; p < W * H; p++) rgba[p * 4 + 3] = Math.round(blurred[p]! * SHADOW.opacity);
      return sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
    };
    const colourIn = async (src: Buffer, c: [number, number, number]) => {
      const a = await sharp(src).extractChannel(3).raw().toBuffer();
      const rgba = Buffer.alloc(W * H * 4);
      for (let p = 0; p < W * H; p++) rgba.set([...c, a[p]!], p * 4);
      return sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
    };
    const files = await Promise.all(LAYERS.map((l) => sharp(path.join(dir, l.file)).png().toBuffer()));
    const steps: Buffer[] = [];
    const ornColours: Array<[number, number, number]> = [[40, 170, 60], [220, 30, 30]];
    let orn = 0;
    for (let i = 0; i < LAYERS.length; i++) {
      const l = LAYERS[i]!;
      if (l.role === 'placemat' || l.role === 'coaster' || l.role === 'ornament-print') {
        const sil = l.role === 'ornament-print' ? await sharp(files[i]!).composite([{ input: files[i + 1]! }]).png().toBuffer() : files[i]!;
        steps.push(await shadow(sil));
        steps.push(await colourIn(files[i]!, l.role === 'placemat' ? [220, 30, 30] : l.role === 'coaster' ? [30, 60, 220] : ornColours[orn++]!));
      } else steps.push(files[i]!);
    }
    let slow = await sharp(path.join(dir, 'backdrop.png')).png().toBuffer();
    for (const s of steps) slow = await sharp(slow).composite([{ input: s }]).png().toBuffer();
    const want = await sharp(slow).removeAlpha().raw().toBuffer();

    let worst = 0;
    for (let i = 0; i < want.length; i++) worst = Math.max(worst, Math.abs(want[i]! - fast.data[i]!));
    expect(worst).toBeLessThanOrEqual(4); // 8-bit weights + rounding; the stacking order is exact
    // and the picture says what it should: the string over ornament 1's art, ornament 2 over ornament 1
    const px = (x: number, y: number) => [...fast.data.subarray((y * W + x) * 3, (y * W + x) * 3 + 3)];
    expect(px(110, 145)).toEqual([160, 120, 40]); // string 1 over its own art
    expect(px(128, 165)[0]).toBeGreaterThan(200); // the overlap is ornament 2 (red), not ornament 1 (green)
    expect(px(90, 70)).toEqual([220, 30, 30]); // the placemat, filled
    expect(px(190, 10)).toEqual([250, 244, 232]); // the backdrop untouched
  });

  it('finds a turned rectangle’s tilt, and widens (never squashes) to the print aspect', async () => {
    const turned = Buffer.alloc(W * H);
    const t = (20 * Math.PI) / 180;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const u = (x - 100) * Math.cos(t) + (y - 100) * Math.sin(t), v = -(x - 100) * Math.sin(t) + (y - 100) * Math.cos(t);
        if (Math.abs(u) < 60 && Math.abs(v) < 40) turned[y * W + x] = 255;
      }
    const tilt = minAreaTilt(turned, W, H, 1);
    expect(Math.abs(tilt - 20)).toBeLessThan(1);
    const q = coverQuadAt(turned, W, H, 2, tilt);
    const w = Math.hypot((q[1]![0] - q[0]![0]) * W, (q[1]![1] - q[0]![1]) * H), h = Math.hypot((q[3]![0] - q[0]![0]) * W, (q[3]![1] - q[0]![1]) * H);
    expect(w / h).toBeCloseTo(2, 3);
    expect(h).toBeGreaterThanOrEqual(80);
  });

  it('a print map’s mask: its alpha when it has transparency; else the GREY shape on WHITE, edge kept soft', () => {
    const px = (r: number, a = 255) => [r, r, r, a];
    // grey-on-white (no transparency): white → 0, the grey → 255, a half-way edge pixel → ~128
    const opaque = Uint8Array.from([...px(255), ...px(128), ...px(192), ...px(255)]);
    const m = shapeMaskOf(opaque);
    expect([m[0], m[1], m[3]]).toEqual([0, 255, 0]);
    expect(Math.abs(m[2]! - 128)).toBeLessThanOrEqual(2);
    // real transparency → the alpha itself
    expect([...shapeMaskOf(Uint8Array.from([...px(0, 0), ...px(128, 255), ...px(128, 90), ...px(0, 0)]))]).toEqual([0, 255, 90, 0]);
  });
});
