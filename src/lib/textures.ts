/**
 * Studio textures — crayon, chalk, paint — for words, pen lines and shapes.
 *
 * A texture is three seamless tiles made from seeded noise, so the browser preview and the
 * full-resolution print render generate the SAME grain from the same code (no image files):
 *   - mask:  how much of the colour lands (paper tooth showing through crayon / chalk)
 *   - dark:  black, faint — streaks and pooling (paint bristles, waxy crayon build-up)
 *   - light: white, faint — dusty highlights (chalk) and bristle gaps (paint)
 * Applied as: object ∩ mask (destination-in), then dark + light on top of the object only
 * (source-atop). Tiles are anchored to the picture, not the object, so the "paper" doesn't
 * slide around when you move a word, and are sized as a fraction of the picture's shorter side.
 */

export type TextureKind = 'smooth' | 'crayon' | 'chalk' | 'paint';
export const TEXTURES: { kind: TextureKind; label: string }[] = [
  { kind: 'smooth', label: 'smooth' },
  { kind: 'crayon', label: 'crayon' },
  { kind: 'chalk', label: 'chalk' },
  { kind: 'paint', label: 'paint' },
];
export const TEXTURE_KINDS = TEXTURES.map((t) => t.kind);
export const cleanTexture = (v: unknown): TextureKind => (TEXTURE_KINDS.includes(v as TextureKind) ? (v as TextureKind) : 'smooth');

/** Tile edge in pixels, and how much of the picture's shorter side one tile covers. */
export const TEXTURE_TILE_PX = 256;
export const TEXTURE_TILE_FRAC = 0.16;

export interface TextureTiles {
  size: number;
  /** RGBA, straight alpha. */
  mask: Uint8ClampedArray;
  dark: Uint8ClampedArray;
  light: Uint8ClampedArray;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seamless value noise: a px×py lattice of randoms, smoothly interpolated, wrapping at the tile. */
function lattice(px: number, py: number, rand: () => number) {
  const g = new Float32Array(px * py);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  return (x: number, y: number) => {
    const fx = x * px, fy = y * py;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const at = (i: number, j: number) => g[(((j % py) + py) % py) * px + (((i % px) + px) % px)]!;
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const cache = new Map<TextureKind, TextureTiles>();

/** The three tiles for a texture (memoised; deterministic across browser and server). */
export function textureTiles(kind: Exclude<TextureKind, 'smooth'>): TextureTiles {
  const hit = cache.get(kind);
  if (hit) return hit;
  const N = TEXTURE_TILE_PX;
  const rand = rng(kind === 'crayon' ? 7 : kind === 'chalk' ? 11 : 13);
  const mask = new Uint8ClampedArray(N * N * 4);
  const dark = new Uint8ClampedArray(N * N * 4);
  const light = new Uint8ClampedArray(N * N * 4);

  // grain at a few scales; "streak" noise is stretched along a diagonal (still seamless: the
  // shear adds a whole number of tiles in x for every tile in y)
  const fine = lattice(96, 96, rand);
  const mid = lattice(32, 32, rand);
  const coarse = lattice(8, 8, rand);
  const streak = lattice(6, 72, rand);
  const streak2 = lattice(10, 128, rand);

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const u = i / N, v = j / N;
      const sv = (u + v) % 1; // diagonal shear
      const f = fine(u, v), m = mid(u, v), c = coarse(u, v);
      const st = streak(sv, v), st2 = streak2(sv, v);
      let a = 1, d = 0, l = 0;
      if (kind === 'crayon') {
        // waxy streaks over paper tooth: most colour lands, specks of paper show through
        const tooth = 0.35 * f + 0.2 * m + 0.45 * st2;
        a = clamp01((tooth - 0.26) / 0.16) * (0.8 + 0.2 * c);
        d = clamp01((st - 0.62) / 0.3) * 0.22;
        l = clamp01((0.32 - st2) / 0.3) * 0.08;
      } else if (kind === 'chalk') {
        // dusty and broken: lots of paper showing, soft powdery highlights
        const tooth = 0.6 * f + 0.25 * m + 0.15 * st2;
        a = clamp01((tooth - 0.36) / 0.24) * (0.7 + 0.3 * c);
        l = clamp01((f - 0.45) / 0.4) * 0.28;
      } else {
        // paint: full colour, bristle streaks darker and lighter, pooling at a broad scale
        a = 0.94 + 0.06 * m;
        d = clamp01((st - 0.5) / 0.4) * 0.2 + clamp01((c - 0.6) / 0.4) * 0.1;
        l = clamp01((0.38 - st2) / 0.38) * 0.16;
      }
      const k = (j * N + i) * 4;
      mask[k] = mask[k + 1] = mask[k + 2] = 0;
      mask[k + 3] = Math.round(a * 255);
      dark[k] = dark[k + 1] = dark[k + 2] = 0;
      dark[k + 3] = Math.round(d * 255);
      light[k] = light[k + 1] = light[k + 2] = 255;
      light[k + 3] = Math.round(l * 255);
    }
  }
  const tiles = { size: N, mask, dark, light };
  cache.set(kind, tiles);
  return tiles;
}
