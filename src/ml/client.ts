import { createHash } from 'node:crypto';
import sharp from 'sharp';

/**
 * Self-hosted, in-region image ops — the "magic edits" (CLAUDE.md: SELF-HOST
 * deterministic ops so NO third party ever sees the image). Single image in →
 * single image out, re-encoded as PNG with NO metadata (EXIF/GPS gone), nothing
 * retained.
 *
 * These deterministic CPU ops (luma-key background removal, Lanczos upscale) run
 * in-process — no standing GPU, scale-to-zero by nature. This module is also the
 * single-image CONTRACT BOUNDARY: a heavy neural model (complex-photo cutout, ML
 * super-resolution of large enlargements) slots in by swapping the body of these
 * two functions for an HTTP call to a scale-to-zero worker, preserving the exact
 * one-image / no-retention / no-EXIF contract.
 */

// Analysis resolution for the background flood (the mask is upsampled smoothly after).
const ANALYSIS_EDGE = 700;

export interface CutoutResult {
  buffer: Buffer;
  /** Fraction of the image detected + removed as background (0..1). The caller decides
   * whether the edit actually achieved anything (honesty: never claim success for a no-op). */
  removedFraction: number;
}

/**
 * Make the background transparent → an RGBA cutout. BORDER-CONNECTED flood fill with an
 * adaptive tolerance, so it handles ANY reasonably solid background colour (white paper,
 * a black poster, a wooden table) — not just near-white:
 *   1. sample the border ring → the background reference colours + their spread,
 *   2. flood inward from the border across colour-similar pixels (connected to the edge —
 *      whites INSIDE the subject are enclosed, so they survive),
 *   3. feather the mask edge and apply it to the full-resolution image.
 * Truly complex scenes (gradients, busy photos) are what the neural cutout worker swap is
 * for — this returns a small removedFraction there, and the caller reports it honestly.
 */
export async function removeBackground(input: Buffer): Promise<CutoutResult> {
  const img = sharp(input).ensureAlpha();
  const meta = await img.metadata();
  const fullW = meta.width ?? 0;
  const fullH = meta.height ?? 0;
  if (!fullW || !fullH) throw new Error('unreadable image');

  // Analysis copy (bounded work regardless of upload size).
  const { data, info } = await sharp(input)
    .flatten({ background: '#ffffff' }) // existing transparency reads as white for analysis
    .resize(ANALYSIS_EDGE, ANALYSIS_EDGE, { fit: 'inside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: c } = info;

  // 1. Border ring → reference colours (coarse 32-bucket quantisation, top buckets) +
  //    tolerance adapted to how uniform the border actually is.
  const ring: number[] = [];
  for (let x = 0; x < W; x++) { ring.push((0 * W + x) * c, ((H - 1) * W + x) * c); }
  for (let y = 0; y < H; y++) { ring.push((y * W + 0) * c, (y * W + W - 1) * c); }
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (const i of ring) {
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    const key = (Math.round(r / 32) << 8) | (Math.round(g / 32) << 4) | Math.round(b / 32);
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(key, e);
  }
  const refs = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 4)
    .filter((e) => e.n >= ring.length * 0.04) // ignore rare border colours (subject touching the edge)
    .map((e) => ({ r: e.r / e.n, g: e.g / e.n, b: e.b / e.n }));
  if (refs.length === 0) return { buffer: await img.png().toBuffer(), removedFraction: 0 };

  // Spread of the border around its refs → adaptive tolerance (squared distance space).
  let sumD = 0;
  for (const i of ring) {
    let best = Infinity;
    for (const f of refs) {
      const d = (data[i]! - f.r) ** 2 + (data[i + 1]! - f.g) ** 2 + (data[i + 2]! - f.b) ** 2;
      if (d < best) best = d;
    }
    sumD += Math.sqrt(best);
  }
  const spread = sumD / ring.length;
  const tol = Math.min(72, Math.max(30, spread * 2.5));
  const tol2 = tol * tol;
  const isBg = (i: number) => {
    for (const f of refs) {
      if ((data[i]! - f.r) ** 2 + (data[i + 1]! - f.g) ** 2 + (data[i + 2]! - f.b) ** 2 <= tol2) return true;
    }
    return false;
  };

  // 2. Flood from every border pixel across background-coloured pixels.
  const bg = new Uint8Array(W * H);
  const queue: number[] = [];
  const push = (x: number, y: number) => {
    const p = y * W + x;
    if (!bg[p] && isBg(p * c)) { bg[p] = 1; queue.push(p); }
  };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  let removed = 0;
  while (queue.length) {
    const p = queue.pop()!;
    removed++;
    const x = p % W, y = (p - x) / W;
    if (x > 0) push(x - 1, y);
    if (x < W - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < H - 1) push(x, y + 1);
  }

  // 3. Keep-mask (255 = subject) → slight blur for a soft edge → upsample to full res →
  //    multiply into the original alpha.
  const keepRaw = Buffer.alloc(W * H);
  for (let p = 0; p < W * H; p++) keepRaw[p] = bg[p] ? 0 : 255;
  const keepFull = await sharp(keepRaw, { raw: { width: W, height: H, channels: 1 } })
    .blur(0.8)
    .resize(fullW, fullH, { fit: 'fill' })
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

/** Classical (Lanczos) resample to the target size. Tier-0 of the tiered upscale;
 * a CPU ML super-resolution model is the tier-1 worker swap for large enlargements. */
export async function upscale(input: Buffer, targetWidth: number, targetHeight: number): Promise<Buffer> {
  return sharp(input).resize(targetWidth, targetHeight, { kernel: 'lanczos3', fit: 'fill' }).png().toBuffer();
}

export type ImageOp = { kind: 'BG_REMOVE' } | { kind: 'UPSCALE'; width: number; height: number };

export interface ImageOpResult {
  buffer: Buffer;
  contentType: string;
  byteSize: number;
  sha256: string;
  /** BG_REMOVE only: how much of the image was detected + removed as background. */
  removedFraction?: number;
}

/**
 * Run one image op on exactly one image. The output is a freshly re-encoded PNG
 * with no metadata — so no EXIF/GPS ever survives a magic edit.
 */
export async function runImageOp(op: ImageOp, input: Buffer): Promise<ImageOpResult> {
  if (op.kind === 'BG_REMOVE') {
    const cut = await removeBackground(input);
    return {
      buffer: cut.buffer,
      contentType: 'image/png',
      byteSize: cut.buffer.byteLength,
      sha256: createHash('sha256').update(cut.buffer).digest('hex'),
      removedFraction: cut.removedFraction,
    };
  }
  const buffer = await upscale(input, op.width, op.height);
  return {
    buffer,
    contentType: 'image/png',
    byteSize: buffer.byteLength,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}
