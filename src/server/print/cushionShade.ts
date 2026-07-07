/**
 * Tier-B cushion realism — a pure, exhaustively unit-testable shading of the flat white
 * cushion FACE so the compositor's LIGHT_FABRIC multiply renders the child's art as plump
 * printed fabric instead of a flat sticker.
 *
 * DISPLAY ONLY. This shades the mockup BLANK; Prodigi prints from the child's real design,
 * never this face. Exactly like the jigsaw's die-cut piece lines, it rides the preview and
 * never touches the print file. The child's design never leaves the process.
 *
 * The shape's OWN silhouette drives everything — no authored maps, nothing to drift:
 *  - PLUMPNESS: a broad blur of the silhouette is a dome — bright at the bulging centre,
 *    rolling off toward the edge (an ambient-occlusion-style edge darkening = the seam).
 *  - SEAM: a thin blur darkens the very-edge band = the sewn seam / piped edge.
 *  - FORM LIGHT: a gentle top-left → bottom-right gradient = the lit and shadowed sides.
 *  - WEAVE: a fine, low-amplitude cross-grain = woven fabric, read through the multiply.
 *
 * Every factor is ≤ 1 (DARKEN-ONLY): the compositor MULTIPLIES the art by this face, where
 * white (255) is the identity. The bright centre keeps the drawing vivid; the edges read as
 * plush. There is no invented colour — only the blank's own form re-expressed as shading,
 * the same honesty guarantee as fabricFx.
 */

export interface CushionFaceInput {
  /** W×H single-channel silhouette alpha (0..255). */
  alpha: Buffer;
  /** W×H broad-blurred alpha — the plump dome field (see CUSHION_DOME_SIGMA). */
  dome: Buffer;
  /** W×H thin-blurred alpha — the sewn-seam field (see CUSHION_SEAM_SIGMA). */
  seam: Buffer;
  width: number;
  height: number;
}

export interface CushionFaceParams {
  /** Brightness at the plump edge (1 = no darkening). */
  edgeLo: number;
  /** Top-left form-light strength. */
  dirAmt: number;
  /** Extra darkening right at the sewn seam. */
  seamAmt: number;
  /** Woven-fabric depth. */
  weaveAmt: number;
  /** Weave pitch in px. */
  weavePx: number;
  /** Hard floor on the multiplier (never darker than this). */
  floor: number;
}

/** Founder-tuned intensities (2026-07): plush but the child's art stays vivid. */
export const CUSHION_FACE_DEFAULTS: CushionFaceParams = {
  edgeLo: 0.82,
  dirAmt: 0.06,
  seamAmt: 0.09,
  weaveAmt: 0.028,
  weavePx: 7,
  floor: 0.55,
};

/** Blur radii the seeder applies to the silhouette to build the dome/seam fields, as a
 * fraction of the shape's min dimension — kept here so the fields and the shading agree. */
export const CUSHION_DOME_SIGMA = 0.11;
export const CUSHION_SEAM_SIGMA = 0.025;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (t: number) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Shade the cushion face. Returns an RGBA (W×H×4) buffer: a neutral-grey face whose value
 * is the darken-only multiplier ×255, carried at the silhouette's own alpha. Transparent
 * surround stays fully transparent (identity for the compositor).
 */
export function shadeCushionFace(i: CushionFaceInput, p: CushionFaceParams = CUSHION_FACE_DEFAULTS): Buffer {
  const { alpha, dome, seam, width: W, height: H } = i;
  const out = Buffer.alloc(W * H * 4);
  const twoPiOverPitch = (2 * Math.PI) / p.weavePx;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const a = alpha[idx]!;
      if (a === 0) continue; // transparent surround → identity
      const o = idx * 4;

      // PLUMPNESS — the broad dome (0.5 at a blurred edge → ~1 at the centre), softened.
      const domeN = dome[idx]! / 255;
      let L = p.edgeLo + (1 - p.edgeLo) * smooth((domeN - 0.5) / 0.5);
      // SEAM — the thin-blur band darkens the very edge.
      const sN = seam[idx]! / 255;
      if (sN < 1) L *= 1 - p.seamAmt * (1 - sN);
      // FORM LIGHT — top-left lit, bottom-right shadowed (subtle).
      const dir = 0.5 * (x / W) + 0.5 * (y / H);
      L *= 1 - p.dirAmt * clamp((dir - 0.45) / 0.55, 0, 1);
      // WEAVE — a fine cross-grain, darken-only.
      const weave = (0.5 - 0.5 * Math.cos(twoPiOverPitch * x)) * (0.5 - 0.5 * Math.cos(twoPiOverPitch * y));
      L *= 1 - p.weaveAmt * weave;

      const v = Math.round(255 * clamp(L, p.floor, 1));
      out[o] = v;
      out[o + 1] = v;
      out[o + 2] = v;
      out[o + 3] = a;
    }
  }
  return out;
}
