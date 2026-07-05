/**
 * Tier-B "2.5D" mockup realism — pure pixel math, no I/O, exhaustively unit-testable.
 *
 * The technique behind smartmockups/Photoshop displacement mockups, adapted to be
 * SELF-CALIBRATING: the product photo's own tonal detail drives everything.
 *  1. DISPLACEMENT — the design's pixels are re-sampled offset by the blank's blurred
 *     luminance, so art follows the fabric's folds instead of floating over them.
 *  2. SHADING — the blank's shadows/highlights are re-applied over the art
 *     (hard-light for highlights, a darken-only multiply for shadow depth).
 *
 * Both are MEAN-RELATIVE (offsets measured from the region's own average luminance),
 * so an untextured region — e.g. a frame's pure-white paper window — is mathematically
 * an IDENTITY operation: no displacement, no shading, no invented texture. That is the
 * honesty guarantee: fx can only re-express what the photo actually shows.
 *
 * All maps derive at render time from the SAME brand-safe blank the compositor already
 * holds (they are pure functions of it) — no authored assets, no schema, nothing to
 * drift out of sync. The child's design never leaves the process.
 */

export interface FabricFxInput {
  /** RGBA raw pixels of the placed design layer (width×height×4). Mutated NOT — a new buffer is returned. */
  design: Buffer;
  width: number;
  height: number;
  /** Single-channel raw luminance of the blank's print-area region (width×height). */
  blankGray: Buffer;
  /** Single-channel raw BLURRED luminance of the same region — the fold field. */
  blankGrayBlur: Buffer;
  /** Max displacement in px at this resolution (0 = off). */
  displaceStrength: number;
  /** 0..1 — how strongly the blank's shading re-applies over the art (0 = off). */
  shadeAmount: number;
}

/** Mean of a single-channel buffer (sampled every 4th px — plenty for a mean). */
export function meanLuma(gray: Buffer): number {
  if (gray.length === 0) return 128;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < gray.length; i += 4) {
    sum += gray[i]!;
    n++;
  }
  return sum / n;
}

const clamp255 = (n: number) => (n < 0 ? 0 : n > 255 ? 255 : n);

/**
 * Continuous dodge/burn of design channel D under light L. EXACT identity at the
 * neutral point (L=128) — the classic hard-light formula is off by one there, which
 * would break the flat-region-is-identity guarantee by a byte. Monotonic and
 * continuous: L=0 → black, L=128 → D, L=255 → white.
 */
export function hardLight(d: number, l: number): number {
  return l <= 128 ? (d * l) / 128 : d + ((255 - d) * (l - 128)) / 127;
}

export function applyFabricFx(i: FabricFxInput): Buffer {
  const { design, width: W, height: H, blankGray, blankGrayBlur, displaceStrength, shadeAmount } = i;
  const out = Buffer.alloc(design.length);
  const muBlur = meanLuma(blankGrayBlur);
  const muGray = meanLuma(blankGray);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const o = idx * 4;

      // 1. DISPLACEMENT — offset the SAMPLE position by the fold field (single map ⇒
      //    a diagonal vector, matching the classic single-map displace semantics).
      let r: number;
      let g: number;
      let b: number;
      let a: number;
      if (displaceStrength > 0) {
        const d = ((blankGrayBlur[idx]! - muBlur) / 128) * displaceStrength;
        const sx = Math.min(W - 1, Math.max(0, x + d));
        const sy = Math.min(H - 1, Math.max(0, y + d));
        // bilinear sample of the design RGBA
        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        const x1 = Math.min(W - 1, x0 + 1);
        const y1 = Math.min(H - 1, y0 + 1);
        const fx = sx - x0;
        const fy = sy - y0;
        const w00 = (1 - fx) * (1 - fy);
        const w10 = fx * (1 - fy);
        const w01 = (1 - fx) * fy;
        const w11 = fx * fy;
        const p00 = (y0 * W + x0) * 4;
        const p10 = (y0 * W + x1) * 4;
        const p01 = (y1 * W + x0) * 4;
        const p11 = (y1 * W + x1) * 4;
        r = design[p00]! * w00 + design[p10]! * w10 + design[p01]! * w01 + design[p11]! * w11;
        g = design[p00 + 1]! * w00 + design[p10 + 1]! * w10 + design[p01 + 1]! * w01 + design[p11 + 1]! * w11;
        b = design[p00 + 2]! * w00 + design[p10 + 2]! * w10 + design[p01 + 2]! * w01 + design[p11 + 2]! * w11;
        a = design[p00 + 3]! * w00 + design[p10 + 3]! * w10 + design[p01 + 3]! * w01 + design[p11 + 3]! * w11;
      } else {
        r = design[o]!;
        g = design[o + 1]!;
        b = design[o + 2]!;
        a = design[o + 3]!;
      }

      // 2. SHADING — only where there IS art (margins stay transparent → the photo's
      //    own surface shows, exactly as before).
      if (shadeAmount > 0 && a > 0) {
        const dev = blankGray[idx]! - muGray;
        // highlights + texture via hard-light around the identity point 128
        const light = clamp255(128 + dev * shadeAmount);
        r = hardLight(r, light);
        g = hardLight(g, light);
        b = hardLight(b, light);
        // shadow depth via a DARKEN-ONLY multiply (never brightens, so light fabric
        // can't bleach the art — the reference pipeline's adjustment map role)
        if (dev < 0) {
          const m = (255 + dev * shadeAmount) / 255;
          r *= m;
          g *= m;
          b *= m;
        }
      }

      out[o] = clamp255(Math.round(r));
      out[o + 1] = clamp255(Math.round(g));
      out[o + 2] = clamp255(Math.round(b));
      out[o + 3] = clamp255(Math.round(a));
    }
  }
  return out;
}

/** Per-material fx intensities. Fabrics fold; paper barely textures; ceramic/gloss
 * keep their sheen but never warp the art. */
export const MATERIAL_FX: Record<string, { disp: number; shade: number }> = {
  LIGHT_FABRIC: { disp: 1, shade: 0.85 },
  DARK_FABRIC: { disp: 1, shade: 0.85 },
  PAPER: { disp: 0.15, shade: 0.35 },
  CERAMIC: { disp: 0, shade: 0.55 },
  GLOSS: { disp: 0, shade: 0.65 },
};
