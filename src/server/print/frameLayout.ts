import './sharp-init';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { FrameGrid } from '@/lib/multi-photo-frame';
import { buildLayout, type BuiltBundleLayout, type LayoutLayer } from './bundleMockup';

/**
 * The MULTI PHOTO FRAME's pictures, from the founder's PSDs (5 Nov: multi9 / multi6x4 / multi10x6),
 * extracted to same-canvas PNG layers + manifest.json, bottom → top, one folder per frame named by its
 * drawings (.prodigi-assets/blanks/layered/multiPhotoFrame/<3x3 | 6x4 | 10x6>/):
 *   backing.png        — the white backing (the print sheet behind the glass)
 *   frame.png          — the frame in one Prodigi colour (gold foil on the 6x4 + 10x6, black on the 3x3);
 *                        the other seven colours are made from it, below
 *   square-01…NN.png   — the numbered print maps, one per drawing, row by row from the top-left
 *
 * The picture (founder's order): our standard backdrop → the frame's soft shadow → the white backing →
 * the frame → each drawing on its own numbered print map.
 *
 * SPEED: everything that doesn't depend on a drawing — the backdrop, the shadow, the backing and the
 * frame in its colour — is flattened ONCE, at seed time, into one base picture per size × colour, at
 * most LAYOUT_EDGE px, with one weight mask per square (bundleMockup.ts buildLayout). A preview is then
 * only the drawings laid into their squares + one encode; nothing is recoloured or layered per view.
 */

const ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), '.prodigi-assets', 'blanks', 'layered', 'multiPhotoFrame');
/** The stored layout's longest edge (the catalogue tile works at 512, the builder at 768). */
export const LAYOUT_EDGE = 1024;

/** The founder's layers for this frame, or null when they aren't staged on this machine. */
export function frameLayoutDir(grid: Pick<FrameGrid, 'name'>): string | null {
  const dir = path.join(ROOT, grid.name);
  return existsSync(path.join(dir, 'manifest.json')) && existsSync(path.join(dir, 'frame.png')) && existsSync(path.join(dir, 'backing.png')) ? dir : null;
}

/**
 * Prodigi's eight classic-frame colours, made from the founder's frame layer: whichever colour it IS
 * (the nearest of these to its mean) is used exactly as supplied; every other colour keeps the layer's
 * own light and shade (each pixel's brightness against the moulding's mean), carried onto that colour's
 * base. The bases are SAMPLED from the founder's photos of Prodigi's real classic frames
 * (.prodigi-assets/blanks/layered/framedPrint/<colour>/product.png, mean of the moulding, 5 Nov).
 * `shade` is how much of the modelling carries over — all of it on the metallic foils, most of it on
 * the oak-effect woods, a little on the painted colours, whose real photos are near-flat; `sheen` adds
 * the satin highlight a painted frame still catches (black reads as black, not a hole). A near-flat
 * source (the 3x3's black) carries little modelling — its other colours come out clean and flat, with
 * the mitred corners.
 */
export const FRAME_FINISH: Record<string, { rgb: [number, number, number]; shade: number; sheen: number }> = {
  gold: { rgb: [204, 175, 106], shade: 1, sheen: 0 },
  silver: { rgb: [225, 220, 215], shade: 1, sheen: 0 },
  natural: { rgb: [195, 178, 155], shade: 0.8, sheen: 0 },
  brown: { rgb: [89, 53, 37], shade: 0.9, sheen: 0 },
  black: { rgb: [14, 14, 14], shade: 0.5, sheen: 55 },
  'dark grey': { rgb: [101, 118, 125], shade: 0.45, sheen: 20 },
  'light grey': { rgb: [191, 189, 177], shade: 0.4, sheen: 0 },
  white: { rgb: [246, 246, 246], shade: 0.3, sheen: 0 },
};

const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Which of Prodigi's colours a frame layer is (the finish nearest its moulding's mean colour). */
export function finishOf(meanRgb: [number, number, number]): string {
  let best = 'gold', bestD = Infinity;
  for (const [name, f] of Object.entries(FRAME_FINISH)) {
    const d = (f.rgb[0] - meanRgb[0]) ** 2 + (f.rgb[1] - meanRgb[1]) ** 2 + (f.rgb[2] - meanRgb[2]) ** 2;
    if (d < bestD) [best, bestD] = [name, d];
  }
  return best;
}

/** The founder's frame layer in a Prodigi colour (PNG, same canvas, same alpha). */
export async function recolourFrame(frameLayer: Buffer | string, colour: string): Promise<Buffer> {
  const finish = FRAME_FINISH[colour];
  if (!finish) throw new Error(`no frame finish for "${colour}"`);
  const { data, info } = await sharp(frameLayer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // the moulding's mean (solid pixels only) — its colour says which finish it is; its brightness is
  // the "flat" the shading is measured from
  let n = 0, sum = 0, r = 0, g = 0, b = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! <= 200) continue;
    n++;
    r += data[i]!; g += data[i + 1]!; b += data[i + 2]!;
    sum += lum(data[i]!, data[i + 1]!, data[i + 2]!);
  }
  if (n && finishOf([r / n, g / n, b / n]) === colour) return sharp(frameLayer).png().toBuffer(); // the founder's own
  const mean = n ? sum / n : 128;
  const scale = Math.max(mean, 64); // a near-black moulding's specks never blow up into stripes
  const out = Buffer.alloc(data.length);
  const [tr, tg, tb] = finish.rgb;
  for (let i = 0; i < data.length; i += 4) {
    const d = Math.max(-0.6, Math.min(0.6, (lum(data[i]!, data[i + 1]!, data[i + 2]!) - mean) / scale)); // −0.4 … +0.4 on the gold
    const k = 1 + finish.shade * d;
    const lift = finish.sheen * Math.max(0, d) ** 1.5;
    out[i] = Math.max(0, Math.min(255, Math.round(tr * k + lift)));
    out[i + 1] = Math.max(0, Math.min(255, Math.round(tg * k + lift)));
    out[i + 2] = Math.max(0, Math.min(255, Math.round(tb * k + lift)));
    out[i + 3] = data[i + 3]!;
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

type Manifest = { canvas: [number, number]; layers: Array<{ order: number; file: string; role: string; index?: number }> };

/**
 * Seed time: one frame in one colour as a ready layout — the base (backdrop, shadow, backing, frame)
 * and a weight + exact quad per numbered square, at most LAYOUT_EDGE px. The squares come out in
 * their NUMBER order (square 1 = region 0), whatever order the PSD stacks them in.
 */
export async function buildFrameLayout(dir: string, colour: string, backdropFile: string): Promise<BuiltBundleLayout> {
  const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as Manifest;
  const [W0, H0] = manifest.canvas;
  const s = Math.min(1, LAYOUT_EDGE / Math.max(W0, H0));
  const W = Math.round(W0 * s), H = Math.round(H0 * s);
  const small = (file: string) => sharp(path.join(dir, file)).resize(W, H, { fit: 'fill' }).png().toBuffer();
  const backing = await small('backing.png');
  const frame = await recolourFrame(await small('frame.png'), colour);
  // the shadow's silhouette: the backing and the frame together
  const silhouette = await sharp(backing).composite([{ input: frame }]).png().toBuffer();
  const squares = manifest.layers
    .filter((l) => l.role === 'square' && typeof l.index === 'number')
    .sort((a, b) => a.index! - b.index!);
  const layers: LayoutLayer[] = [
    { file: silhouette, role: 'shadow' },
    { file: backing, role: 'backing' },
    { file: frame, role: 'frame' },
    ...(await Promise.all(squares.map(async (l) => ({ file: await small(l.file), role: 'square' as const })))),
  ];
  return buildLayout(layers, [W, H], backdropFile);
}
