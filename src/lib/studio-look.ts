/**
 * The Studio's colour & light ADJUSTMENTS and preset LOOKS (Studio spec §8, §9) — stored as plain
 * numbers in the recipe, never baked into the original. This one pure function turns those
 * numbers into pixels, and it runs in BOTH places: the browser preview (on the editing copy) and
 * the server's full-resolution design render (src/server/studio-doc.ts) — so what's previewed is
 * what prints. Per-pixel only (no blurs), so it doesn't depend on the picture's size.
 */

export const LOOK_IDS = ['mono', 'pastel', 'poster', 'sunshine', 'seaside', 'storybook'] as const;
export type LookId = (typeof LOOK_IDS)[number];

export const LOOKS: { id: LookId; label: string }[] = [
  { id: 'mono', label: 'black & white' },
  { id: 'pastel', label: 'soft pastel' },
  { id: 'poster', label: 'bold poster' },
  { id: 'sunshine', label: 'sunshine' },
  { id: 'seaside', label: 'seaside' },
  { id: 'storybook', label: 'storybook' },
];

export interface StudioLook {
  /** −100…100 each; 0 = as it was. */
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  /** A preset look, and how much of it (0–100). */
  filter: LookId | null;
  intensity: number;
}

export const IDENTITY_LOOK: StudioLook = { brightness: 0, contrast: 0, saturation: 0, warmth: 0, filter: null, intensity: 100 };

export const lookIsIdentity = (l: StudioLook | null | undefined): boolean =>
  !l || (l.brightness === 0 && l.contrast === 0 && l.saturation === 0 && l.warmth === 0 && (l.filter === null || l.intensity === 0));

/** Validate + clamp a look from the browser (never trust the client). Null = nothing to do. */
export function cleanLook(raw: unknown): StudioLook | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const n = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(hi, Math.max(lo, v))) : d);
  const look: StudioLook = {
    brightness: n(r.brightness, -100, 100, 0),
    contrast: n(r.contrast, -100, 100, 0),
    saturation: n(r.saturation, -100, 100, 0),
    warmth: n(r.warmth, -100, 100, 0),
    filter: LOOK_IDS.includes(r.filter as LookId) ? (r.filter as LookId) : null,
    intensity: n(r.intensity, 0, 100, 100),
  };
  return lookIsIdentity(look) ? null : look;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** One look's own colour change, on 0–1 RGB. */
function lookPixel(id: LookId, r: number, g: number, b: number): [number, number, number] {
  switch (id) {
    case 'mono': {
      const l = clamp01((luma(r, g, b) - 0.5) * 1.12 + 0.5);
      return [l, l, l];
    }
    case 'pastel': {
      const l = luma(r, g, b);
      const s = (c: number) => {
        const d = l + (c - l) * 0.55;
        return d + (1 - d) * 0.28;
      };
      return [s(r), s(g), s(b)];
    }
    case 'poster': {
      const l = luma(r, g, b);
      const q = (c: number) => Math.round(clamp01(l + (c - l) * 1.6) * 4) / 4;
      return [q(r), q(g), q(b)];
    }
    case 'sunshine':
      return [clamp01(r * 1.04 + 0.06), clamp01(g * 1.02 + 0.03), clamp01(b * 0.9)];
    case 'seaside':
      return [clamp01(r * 0.92), clamp01(g * 1.0 + 0.02), clamp01(b * 1.04 + 0.06)];
    case 'storybook': {
      // a warm, faded old-book tone
      const sr = 0.393 * r + 0.769 * g + 0.189 * b, sg = 0.349 * r + 0.686 * g + 0.168 * b, sb = 0.272 * r + 0.534 * g + 0.131 * b;
      const f = (c: number) => 0.06 + clamp01(c) * 0.9;
      return [f(sr), f(sg), f(sb)];
    }
  }
}

/** Per-channel curves (brightness, contrast, warmth) as three 256-entry tables of 0–1 values. */
function curves(l: StudioLook): [Float32Array, Float32Array, Float32Array] {
  const b = l.brightness / 100, k = l.contrast / 100, w = l.warmth / 100;
  const f = k >= 0 ? 1 + k * 1.5 : 1 + k * 0.8;
  const shift = [w * 0.08, w * 0.02, -w * 0.08];
  const out: [Float32Array, Float32Array, Float32Array] = [new Float32Array(256), new Float32Array(256), new Float32Array(256)];
  for (let i = 0; i < 256; i++) {
    let x = i / 255;
    // brighter lifts the darks and keeps white white; darker deepens and keeps black black
    x = b >= 0 ? 1 - (1 - x) * (1 - b * 0.6) : x * (1 + b * 0.6);
    x = clamp01(0.5 + (x - 0.5) * f);
    for (let c = 0; c < 3; c++) out[c]![i] = clamp01(x + shift[c]!);
  }
  return out;
}

/**
 * Apply a look IN PLACE to interleaved 8-bit pixels (RGB or RGBA — `channels` 3 or 4; alpha is
 * left exactly as it was). The same code, the same numbers, the same rounding everywhere.
 */
export function applyLook(px: Uint8Array | Uint8ClampedArray, channels: 3 | 4, look: StudioLook | null | undefined): void {
  if (!look || lookIsIdentity(look)) return;
  const [cr, cg, cb] = curves(look);
  const sat = 1 + look.saturation / 100;
  const id = look.filter;
  const t = id ? look.intensity / 100 : 0;
  for (let i = 0; i + 2 < px.length; i += channels) {
    let r = cr[px[i]!]!, g = cg[px[i + 1]!]!, b = cb[px[i + 2]!]!;
    if (sat !== 1) {
      const l = luma(r, g, b);
      r = clamp01(l + (r - l) * sat);
      g = clamp01(l + (g - l) * sat);
      b = clamp01(l + (b - l) * sat);
    }
    if (id && t > 0) {
      const [fr, fg, fb] = lookPixel(id, r, g, b);
      r += (fr - r) * t;
      g += (fg - g) * t;
      b += (fb - b) * t;
    }
    px[i] = Math.round(clamp01(r) * 255);
    px[i + 1] = Math.round(clamp01(g) * 255);
    px[i + 2] = Math.round(clamp01(b) * 255);
  }
}
