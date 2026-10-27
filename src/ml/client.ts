import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { upscaleTierFor } from '@/server/print/geometry';
import { liftInk, type InkLiftDiagnosis } from './inkLift';
import { superResolve } from './superRes';

/**
 * Self-hosted, in-region image ops — the "magic edits" (CLAUDE.md: SELF-HOST
 * deterministic ops so NO third party ever sees the image). Single image in →
 * single image out, re-encoded as PNG with NO metadata (EXIF/GPS gone), nothing
 * retained.
 *
 * These CPU ops run in-process — no standing GPU, scale-to-zero by nature. The upscale
 * is TIERED: up to 2× it's an instant classical (Lanczos) resample; past that, a small
 * super-resolution model runs on the CPU in-process (src/ml/superRes.ts), falling back
 * to classical if the model isn't there. This module is also the single-image CONTRACT
 * BOUNDARY: one image in, one PNG out, no EXIF, nothing retained.
 */

// Analysis resolution for the background flood (the mask is upsampled smoothly after).
const ANALYSIS_EDGE = 1000;
// RGB² radius that counts as "the same background colour under different lighting" — generous
// enough to merge a sheet of paper's bright→shadowed shades into ONE background, tight enough to
// exclude a saturated drawing colour (e.g. white↔grey↔cream all fall well inside; cinnamon is far
// outside). This is what stops a subject that touches the paper edge from being read as background.
const MERGE_DIST2 = 118 * 118;

export interface CutoutResult {
  buffer: Buffer;
  /** Fraction of the image detected + removed as background (0..1). The caller decides
   * whether the edit actually achieved anything (honesty: never claim success for a no-op). */
  removedFraction: number;
}

/**
 * Make the background transparent → an RGBA cutout. A border-connected flood, hardened for real
 * phone photos of drawings (grain, JPEG blocking, uneven lighting, subjects that run to the paper
 * edge):
 *   1. DENOISE the analysis copy (median) so photo grain can't inflate the tolerance or speckle it,
 *   2. find the DOMINANT border colour and merge only its own lighting-shades into the background —
 *      a subject touching the edge is a MINORITY border colour and is excluded, so it is NOT eaten
 *      (the old top-4-buckets rule deleted edge-touching drawings); if NO colour dominates the
 *      border the scene is ambiguous → return 0 and let the caller fail honestly,
 *   3. flood inward across paper-coloured pixels (whites enclosed by the subject survive),
 *   4. ERODE the keep-mask ~1px to bite off the JPEG/anti-alias halo fringe (the "white outline"),
 *      then feather + cubic-upsample and multiply into the original alpha.
 * Truly complex backgrounds (busy photos, patterned surfaces) remain the neural-cutout worker's job
 * — this returns a small removedFraction there, reported honestly.
 */
export async function removeBackground(input: Buffer, opts: { keepEnclosedPaper?: boolean } = {}): Promise<CutoutResult> {
  // FIRST CHOICE — ink lift (src/ml/inkLift.ts): models the paper and lifts the ink off it, so
  // paper enclosed by the drawing goes too, pencil keeps soft edges, shadows don't survive and
  // pale crayon stays solid. It declines (null) when there's no paper to model — then the older
  // border flood below gets its chance (e.g. a dark card), and failing that we fail honestly.
  const diag: InkLiftDiagnosis = {};
  const lifted = await liftInk(input, { edge: 'soft', keepEnclosedPaper: opts.keepEnclosedPaper }, diag).catch(() => null);
  // A line drawing on a big sheet is legitimately ~99% paper — the test is "some ink survives".
  if (lifted && lifted.removedFraction >= 0.02 && lifted.removedFraction <= 0.999) {
    return { buffer: lifted.buffer, removedFraction: lifted.removedFraction };
  }
  // The old border flood is only safe on DARK paper (chalk / light paint on black card). On a
  // painted or busy background it silently ate content (a blue figure on a blue sky) while
  // claiming success — so there we change nothing and let the parent decide in the touch-up.
  if (diag.declined === 'dark-paper') return floodRemoveBackground(input);
  return { buffer: await sharp(input).ensureAlpha().png().toBuffer(), removedFraction: 0 };
}

/** The original border-connected flood — now the fallback when ink lift finds no paper. */
export async function floodRemoveBackground(input: Buffer): Promise<CutoutResult> {
  const base = sharp(input).ensureAlpha();
  const meta = await base.metadata();
  const fullW = meta.width ?? 0;
  const fullH = meta.height ?? 0;
  if (!fullW || !fullH) throw new Error('unreadable image');
  const plain = async () => ({ buffer: await base.png().toBuffer(), removedFraction: 0 });

  // 1. Analysis copy (bounded work), median-denoised so grain doesn't destabilise the flood.
  const { data, info } = await sharp(input)
    .flatten({ background: '#ffffff' }) // existing transparency reads as white for analysis
    .resize(ANALYSIS_EDGE, ANALYSIS_EDGE, { fit: 'inside', withoutEnlargement: true })
    .median(3)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: c } = info;

  // Border ring pixel indices.
  const ring: number[] = [];
  for (let x = 0; x < W; x++) { ring.push(x * c, ((H - 1) * W + x) * c); }
  for (let y = 0; y < H; y++) { ring.push(y * W * c, (y * W + W - 1) * c); }

  // 2. Quantised border colours → the DOMINANT one, plus only the buckets within a lighting-radius
  //    of it (the paper's own shadows/highlights). Edge-touching subject colours sit outside and
  //    are dropped.
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (const i of ring) {
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    const key = ((r >> 5) << 10) | ((g >> 5) << 5) | (b >> 5);
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(key, e);
  }
  const means = [...buckets.values()]
    .map((e) => ({ n: e.n, r: e.r / e.n, g: e.g / e.n, b: e.b / e.n }))
    .sort((a, b) => b.n - a.n);
  if (means.length === 0) return plain();
  const dom = means[0]!;
  const refs = means.filter((m) => (m.r - dom.r) ** 2 + (m.g - dom.g) ** 2 + (m.b - dom.b) ** 2 <= MERGE_DIST2);
  const bgCoverage = refs.reduce((s, m) => s + m.n, 0) / ring.length;
  // No single colour owns the border ⇒ busy/ambiguous background ⇒ don't guess.
  if (bgCoverage < 0.45) return plain();

  // Tolerances. `domTol` = how far a pixel can stray from the dominant paper colour and still count
  // as CORE paper — kept tight (from the paper's own spread) so it doesn't swallow pale drawing
  // colours. `LOCAL_TOL` = the max step between neighbouring pixels the flood will walk — small, so
  // it follows a SMOOTH lighting gradient across the paper but STOPS at the sharp edge of a drawn
  // shape. `MERGE_DIST2` is the hard family bound: the flood can never leave the paper colour family,
  // so a saturated subject (even a pale one that a gradient reaches) is never eaten wholesale.
  let sumD = 0, nPaper = 0;
  for (const i of ring) {
    const d = (data[i]! - dom.r) ** 2 + (data[i + 1]! - dom.g) ** 2 + (data[i + 2]! - dom.b) ** 2;
    if (d <= MERGE_DIST2) { sumD += Math.sqrt(d); nPaper++; }
  }
  const spread = nPaper ? sumD / nPaper : 0;
  // Tolerance kept CONSERVATIVE (capped) and measured from the paper's own spread: enough to clear
  // shaded paper, but not so wide it swallows pale drawing colours that sit near the paper tone. A
  // pale shape that IS colourimetrically inside the paper's lighting range is the residual case a
  // colour method can't fully separate — the neural-cutout worker swap is for that (and busy scenes).
  const tol = Math.min(50, Math.max(22, spread * 1.9 + 11));
  const tol2 = tol * tol;
  const isBg = (i: number) => {
    for (const f of refs) {
      if ((data[i]! - f.r) ** 2 + (data[i + 1]! - f.g) ** 2 + (data[i + 2]! - f.b) ** 2 <= tol2) return true;
    }
    return false;
  };

  // 3. Border-connected flood across paper-coloured pixels (refs are only the dominant colour's own
  //    shades, so a subject that touches the edge is never a reference and is not eaten).
  const bg = new Uint8Array(W * H);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const p = y * W + x;
    if (!bg[p] && isBg(p * c)) { bg[p] = 1; stack.push(p); }
  };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  let removed = 0;
  while (stack.length) {
    const p = stack.pop()!;
    removed++;
    const x = p % W, y = (p - x) / W;
    if (x > 0) push(x - 1, y);
    if (x < W - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < H - 1) push(x, y + 1);
  }

  // 4. Keep-mask (255 = subject) → ERODE ~1px (blur then high threshold) to remove the halo fringe →
  //    feather + cubic-upsample to full res → multiply into the original alpha.
  const keepRaw = Buffer.alloc(W * H);
  for (let p = 0; p < W * H; p++) keepRaw[p] = bg[p] ? 0 : 255;
  const eroded = await sharp(keepRaw, { raw: { width: W, height: H, channels: 1 } })
    .blur(1.4)
    .toColourspace('b-w')
    .raw()
    .toBuffer();
  const shrunk = Buffer.alloc(W * H);
  for (let p = 0; p < W * H; p++) shrunk[p] = eroded[p]! >= 200 ? 255 : 0; // keep only strongly-inside ⇒ erosion
  const keepFull = await sharp(shrunk, { raw: { width: W, height: H, channels: 1 } })
    .blur(1.0)
    .resize(fullW, fullH, { fit: 'fill', kernel: 'cubic' })
    .toColourspace('b-w')
    .raw()
    .toBuffer();
  const { data: full, info: fi } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const fc = fi.channels;
  for (let p = 0; p < fullW * fullH; p++) {
    const a = full[p * fc + 3]!;
    const k = keepFull[p]!;
    full[p * fc + 3] = Math.min(a, k);
  }
  const buffer = await sharp(full, { raw: { width: fullW, height: fullH, channels: 4 } }).png().toBuffer();
  return { buffer, removedFraction: removed / (W * H) };
}

/** Classical (Lanczos) resample to the target size — tier 0 of the tiered upscale. */
export async function upscale(input: Buffer, targetWidth: number, targetHeight: number): Promise<Buffer> {
  return sharp(input).resize(targetWidth, targetHeight, { kernel: 'lanczos3', fit: 'fill' }).png().toBuffer();
}

export type UpscaleMethod = 'classical' | 'super-res';

/**
 * The tiered upscale. Picks the tier from the enlargement factor (geometry.upscaleTierFor):
 * ≤ 2× → classical (instant); more → CPU super-resolution, or classical when SR is
 * unavailable / the source is over its size cap. Says which tier actually ran.
 */
export async function upscaleTiered(input: Buffer, targetWidth: number, targetHeight: number): Promise<{ buffer: Buffer; method: UpscaleMethod }> {
  const meta = await sharp(input).metadata();
  if (!meta.width || !meta.height) throw new Error('unreadable image');
  const factor = Math.max(targetWidth / meta.width, targetHeight / meta.height);
  if (upscaleTierFor(factor) === 1) {
    const sr = await superResolve(input, targetWidth, targetHeight);
    if (sr) return { buffer: sr, method: 'super-res' };
  }
  return { buffer: await upscale(input, targetWidth, targetHeight), method: 'classical' };
}

export type ImageOp = { kind: 'BG_REMOVE'; keepEnclosedPaper?: boolean } | { kind: 'UPSCALE'; width: number; height: number };

export interface ImageOpResult {
  buffer: Buffer;
  contentType: string;
  byteSize: number;
  sha256: string;
  /** BG_REMOVE only: how much of the image was detected + removed as background. */
  removedFraction?: number;
  /** UPSCALE only: which tier ran. */
  method?: UpscaleMethod;
}

/**
 * Run one image op on exactly one image. The output is a freshly re-encoded PNG
 * with no metadata — so no EXIF/GPS ever survives a magic edit.
 */
export async function runImageOp(op: ImageOp, input: Buffer): Promise<ImageOpResult> {
  if (op.kind === 'BG_REMOVE') {
    const cut = await removeBackground(input, { keepEnclosedPaper: op.keepEnclosedPaper === true });
    return {
      buffer: cut.buffer,
      contentType: 'image/png',
      byteSize: cut.buffer.byteLength,
      sha256: createHash('sha256').update(cut.buffer).digest('hex'),
      removedFraction: cut.removedFraction,
    };
  }
  const { buffer, method } = await upscaleTiered(input, op.width, op.height);
  return {
    buffer,
    contentType: 'image/png',
    byteSize: buffer.byteLength,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    method,
  };
}
