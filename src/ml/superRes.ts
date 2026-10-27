import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import type { InferenceSession, Tensor } from 'onnxruntime-node';

/**
 * Tier-1 of the tiered upscale: CPU super-resolution, in-process, in-region.
 *
 * Model: Real-ESRGAN "realesr-animevideov3" (SRVGGNetCompact, x4, BSD-3-Clause), converted to
 * ONNX by scripts/ml/convert-realesrgan.py and committed under models/sr/. It's tuned for
 * flat colour + clean lines, which is what children's drawings are. Runs on onnxruntime-node's
 * CPU backend: no network at runtime, no third party, no GPU. One image in, one image out,
 * nothing kept.
 *
 * Memory stays bounded on the small box: the picture goes through in tiles (TILE input px with
 * a TILE_PAD overlap so there are no seams), one SR job at a time per process, and a cap on the
 * input size (bigger sources already have plenty of real detail; they get the classical tier).
 *
 * If anything is missing (package, model file, wrong checksum, SR_DISABLED=1) this reports
 * "unavailable" and callers fall back to the classical resample. It never throws that upward.
 */

export const SR_SCALE = 4;
export const SR_MODEL_TAG = 'animev3';
/** sha256 of models/sr/realesr-animevideov3-x4.onnx — a different file is never loaded. */
export const SR_MODEL_SHA256 = '9bebe0d1ed319959eaa86c91e644046a3381b5eef4c93c9286fa6f1e0cabdab8';
const MODEL_FILE = 'models/sr/realesr-animevideov3-x4.onnx';

const TILE = 128; // input px per tile side (measured: 128 is the latency/memory sweet spot)
const TILE_PAD = 10; // overlap each side (as upstream Real-ESRGAN), cropped off after

/** Largest source (megapixels) we super-resolve. 2MP in → 32MP out, ~100MB peak for the output. */
export function srMaxInputMp(): number {
  const v = Number(process.env.SR_MAX_INPUT_MP);
  return Number.isFinite(v) && v > 0 ? v : 2;
}

/** Leave a core free for the web app + Postgres on the 2 vCPU box (1 thread there). */
function srThreads(): number {
  const v = Number(process.env.SR_THREADS);
  if (Number.isFinite(v) && v >= 1) return Math.floor(v);
  return Math.max(1, availableParallelism() - 1);
}

function modelPath(): string {
  return process.env.SR_MODEL_PATH || path.join(process.cwd(), MODEL_FILE);
}

type Ort = typeof import('onnxruntime-node');
let loading: Promise<{ ort: Ort; session: InferenceSession } | null> | null = null;

async function load(): Promise<{ ort: Ort; session: InferenceSession } | null> {
  if (process.env.SR_DISABLED === '1') return null;
  try {
    const bytes = await readFile(modelPath());
    const sha = createHash('sha256').update(bytes).digest('hex');
    if (sha !== SR_MODEL_SHA256) {
      console.warn('[sr] model checksum mismatch; using the classical resample');
      return null;
    }
    const ort: Ort = await import('onnxruntime-node');
    const session = await ort.InferenceSession.create(bytes, {
      executionProviders: ['cpu'],
      intraOpNumThreads: srThreads(),
      interOpNumThreads: 1,
      executionMode: 'sequential',
      graphOptimizationLevel: 'all',
      // the arena keeps tile buffers warm between tiles (3× faster than without, measured)
      enableCpuMemArena: true,
    });
    return { ort, session };
  } catch (e) {
    console.warn('[sr] super-resolution unavailable; using the classical resample:', e instanceof Error ? e.message : e);
    return null;
  }
}

function engine() {
  loading ??= load();
  return loading;
}

/** True when the model + runtime are present and verified (loads them on first call). */
export async function superResAvailable(): Promise<boolean> {
  return (await engine()) !== null;
}

/** Can this source go through SR? (size cap; the caller still checks availability) */
export function srAccepts(width: number, height: number): boolean {
  return width > 0 && height > 0 && (width * height) / 1e6 <= srMaxInputMp();
}

// One SR job at a time per process: the box stays responsive and memory stays bounded.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

/** Test hook: forget the loaded session (e.g. after changing SR_* env). */
export function resetSuperResForTests(): void {
  loading = null;
}

/**
 * Super-resolve one image ×4 with the model, then resample to exactly width×height (a
 * downscale when the target is under ×4). Alpha, if any, is resampled classically and
 * re-attached. Returns a fresh PNG with no metadata, or null when SR is unavailable or the
 * source is over the size cap (the caller then uses the classical tier).
 */
export async function superResolve(input: Buffer, width: number, height: number): Promise<Buffer | null> {
  const eng = await engine();
  if (!eng) return null;
  const { ort, session } = eng;

  return serial(async () => {
    // Pixels exactly as stored (no auto-orient) — the renderer reads them the same way.
    const meta = await sharp(input).metadata();
    const W = meta.width ?? 0, H = meta.height ?? 0;
    if (!srAccepts(W, H)) return null;

    const rgb = await sharp(input).removeAlpha().raw().toBuffer();
    const OW = W * SR_SCALE, OH = H * SR_SCALE;
    const out = Buffer.alloc(OW * OH * 3);

    for (let ty = 0; ty < H; ty += TILE) {
      for (let tx = 0; tx < W; tx += TILE) {
        const x0 = Math.max(0, tx - TILE_PAD), y0 = Math.max(0, ty - TILE_PAD);
        const x1 = Math.min(W, tx + TILE + TILE_PAD), y1 = Math.min(H, ty + TILE + TILE_PAD);
        const tw = x1 - x0, th = y1 - y0, plane = tw * th;
        const f = new Float32Array(3 * plane); // NCHW, 0..1
        for (let y = 0; y < th; y++) {
          let i = ((y0 + y) * W + x0) * 3;
          for (let x = 0; x < tw; x++, i += 3) {
            const p = y * tw + x;
            f[p] = rgb[i]! / 255;
            f[plane + p] = rgb[i + 1]! / 255;
            f[2 * plane + p] = rgb[i + 2]! / 255;
          }
        }
        const res = await session.run({ input: new ort.Tensor('float32', f, [1, 3, th, tw]) });
        const o = (res.output as Tensor).data as Float32Array;
        const ow = tw * SR_SCALE, oplane = ow * th * SR_SCALE;
        // copy the tile's own region (minus the overlap) into the output
        const cx0 = (tx - x0) * SR_SCALE, cy0 = (ty - y0) * SR_SCALE;
        const cw = Math.min(TILE, W - tx) * SR_SCALE, ch = Math.min(TILE, H - ty) * SR_SCALE;
        for (let y = 0; y < ch; y++) {
          let oi = ((ty * SR_SCALE + y) * OW + tx * SR_SCALE) * 3;
          let si = (cy0 + y) * ow + cx0;
          for (let x = 0; x < cw; x++, oi += 3, si++) {
            out[oi] = to8(o[si]!);
            out[oi + 1] = to8(o[oplane + si]!);
            out[oi + 2] = to8(o[2 * oplane + si]!);
          }
        }
        res.output?.dispose?.();
      }
    }

    let raw = out;
    let channels: 3 | 4 = 3;
    if (meta.hasAlpha) {
      // transparency (a bg-removed cutout) is resampled classically and re-attached
      const alpha = await sharp(input).ensureAlpha().extractChannel(3).resize(OW, OH, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer();
      raw = Buffer.alloc(OW * OH * 4);
      for (let p = 0, i = 0, o = 0; p < OW * OH; p++, i += 3, o += 4) {
        raw[o] = out[i]!;
        raw[o + 1] = out[i + 1]!;
        raw[o + 2] = out[i + 2]!;
        raw[o + 3] = alpha[p]!;
      }
      channels = 4;
    }
    let img = sharp(raw, { raw: { width: OW, height: OH, channels } });
    if (OW !== width || OH !== height) img = img.resize(width, height, { kernel: 'lanczos3', fit: 'fill' });
    return img.png({ compressionLevel: 6 }).toBuffer();
  });
}

function to8(v: number): number {
  return v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
}
