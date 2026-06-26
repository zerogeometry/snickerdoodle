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

// Background = near-white + low-chroma (the common case: a child's drawing on
// light paper). Complex-background photos want the neural cutout (worker swap).
const BG_LUMA = 232;
const BG_CHROMA_SPREAD = 26;

/** Make the (near-white) background transparent → an RGBA cutout. */
export async function removeBackground(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info; // channels === 4
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += channels) {
    const r = out[i]!;
    const g = out[i + 1]!;
    const b = out[i + 2]!;
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    if (luma >= BG_LUMA && spread <= BG_CHROMA_SPREAD) out[i + 3] = 0; // transparent
  }
  return sharp(out, { raw: { width, height, channels } }).png().toBuffer();
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
}

/**
 * Run one image op on exactly one image. The output is a freshly re-encoded PNG
 * with no metadata — so no EXIF/GPS ever survives a magic edit.
 */
export async function runImageOp(op: ImageOp, input: Buffer): Promise<ImageOpResult> {
  const buffer = op.kind === 'BG_REMOVE' ? await removeBackground(input) : await upscale(input, op.width, op.height);
  return {
    buffer,
    contentType: 'image/png',
    byteSize: buffer.byteLength,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}
