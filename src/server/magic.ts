import { createHash } from 'node:crypto';
import { and, eq, gte } from 'drizzle-orm';
import sharp from 'sharp';
import { mlOperations, printTemplates, storageObjects } from '@/db/schema';
import { runImageOp } from '@/ml/client';
import { derivativeKey, getObjectBytes, getS3, putObject } from '@/storage';
import type { ViewerContext } from '@/authz';
import type { DbHandle } from './db';
import { getViewableAssetOrThrow } from './assets';
import { assessResolution, clampTransform, PRINT_SHARP_FACTOR, readinessState, type PrintSharp, type RawTransform, type Readiness } from './print/geometry';
import { canMakePrintSharp, ensurePrintSharp, findPrintSharp, resolvePrintSource } from './print/upscale';

const PER_CREATION = Number(process.env.ML_BUDGET_PER_CREATION ?? 20);
const PER_ACCOUNT_30D = Number(process.env.ML_BUDGET_PER_ACCOUNT ?? 500);
const MS_30D = 30 * 86_400_000;

/** Per-creation and per-account budget caps on the self-hosted image ops. The
 * per-account cap applies only to a signed-in account; a guest op is bounded by
 * the per-creation cap alone (keyed on the asset). */
export async function assertMlBudget(db: DbHandle, accountId: string | null, assetId: string): Promise<void> {
  const perAsset = await db.select({ id: mlOperations.id }).from(mlOperations).where(eq(mlOperations.assetId, assetId));
  if (perAsset.length >= PER_CREATION) throw new Error('ml budget exceeded for this creation');
  if (accountId === null) return; // guest: per-creation cap only
  const since = new Date(Date.now() - MS_30D);
  const perAccount = await db
    .select({ id: mlOperations.id })
    .from(mlOperations)
    .where(and(eq(mlOperations.accountId, accountId), gte(mlOperations.createdAt, since)));
  if (perAccount.length >= PER_ACCOUNT_30D) throw new Error('ml budget exceeded for this account');
}

export interface MagicResult {
  objectId: string;
  key: string;
}

/**
 * "Remove background" magic edit: authz-gated + budget-capped, runs the
 * self-hosted op on the asset's ORIGINAL (single image, no EXIF), stores the
 * cutout as a DERIVATIVE, and records the op against the budget. The original is
 * never touched.
 */
export async function removeBackgroundForAsset(
  db: DbHandle,
  viewer: ViewerContext,
  assetId: string,
  opts: { keepEnclosedPaper?: boolean } = {},
): Promise<MagicResult> {
  await getViewableAssetOrThrow(db, assetId, viewer); // ← the gate (member OR upload-claim holder)
  await assertMlBudget(db, viewer.accountId, assetId);

  const [orig] = await db
    .select()
    .from(storageObjects)
    .where(and(eq(storageObjects.assetId, assetId), eq(storageObjects.objectClass, 'ORIGINAL')));
  if (!orig) throw new Error('no original to edit');

  const srcBuf = await getObjectBytes(orig.key);
  const res = await runImageOp({ kind: 'BG_REMOVE', keepEnclosedPaper: opts.keepEnclosedPaper }, srcBuf); // self-hosted; one image; PNG, no EXIF

  // HONESTY GATE: if the edit didn't meaningfully change anything (no clean background
  // found) or would erase essentially the whole image (border == subject), fail here —
  // BEFORE storing a "cutout" or spending budget — so the UI never claims a fake success.
  const removed = res.removedFraction ?? 0;
  // (a fine-line drawing on a large sheet can be ~99% paper — only "nothing left" is a failure)
  if (removed < 0.02 || removed > 0.999) throw new Error('no-clean-background');

  const { objectId, key } = await storeCutout(db, assetId, res.buffer, res.sha256);
  await db.insert(mlOperations).values({ accountId: viewer.accountId, op: 'BG_REMOVE', assetId });
  return { objectId, key };
}

/** Store (or overwrite) an asset's CUTOUT derivative and return its storage object. */
async function storeCutout(db: DbHandle, assetId: string, buffer: Buffer, sha256: string): Promise<{ objectId: string; key: string }> {
  const key = derivativeKey(assetId, 'cutout');
  await putObject(key, buffer, 'image/png');
  const { bucket } = getS3();
  const [existing] = await db.select({ id: storageObjects.id }).from(storageObjects).where(eq(storageObjects.key, key));
  if (existing) {
    await db.update(storageObjects).set({ byteSize: buffer.byteLength, sha256 }).where(eq(storageObjects.id, existing.id));
    return { objectId: existing.id, key };
  }
  const [row] = await db
    .insert(storageObjects)
    .values({ assetId, objectClass: 'DERIVATIVE', bucket, key, contentType: 'image/png', byteSize: buffer.byteLength, sha256, exifStripped: true, writeOnce: false })
    .returning();
  return { objectId: row!.id, key };
}

/** Longest side of the editing copy the touch-up tool works on (and of the masks it sends back). */
export const TOUCHUP_EDGE = 1600;

async function originalBytes(db: DbHandle, assetId: string): Promise<Buffer> {
  const [orig] = await db
    .select()
    .from(storageObjects)
    .where(and(eq(storageObjects.assetId, assetId), eq(storageObjects.objectClass, 'ORIGINAL')));
  if (!orig) throw new Error('no original to edit');
  return getObjectBytes(orig.key);
}

async function cutoutBytes(db: DbHandle, assetId: string): Promise<Buffer | null> {
  const key = derivativeKey(assetId, 'cutout');
  const [row] = await db.select({ id: storageObjects.id }).from(storageObjects).where(eq(storageObjects.key, key));
  return row ? getObjectBytes(key) : null;
}

/**
 * The touch-up tool's starting point: the current cutout's transparency as a greyscale PNG at the
 * editing size (white = kept). Null when there's no cutout yet (the tool starts fully kept).
 */
export async function cutoutAlphaForAsset(db: DbHandle, viewer: ViewerContext, assetId: string): Promise<Buffer | null> {
  await getViewableAssetOrThrow(db, assetId, viewer); // ← the gate
  const cut = await cutoutBytes(db, assetId);
  if (!cut) return null;
  return sharp(cut)
    .ensureAlpha()
    .extractChannel(3)
    .resize(TOUCHUP_EDGE, TOUCHUP_EDGE, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
}

/**
 * Save the parent's touch-up: a greyscale MASK (white = keep, black = gone, greys = soft) at the
 * editing size. It's scaled to the original and becomes the cutout's transparency; colour comes
 * from the auto cutout where it kept ink (its un-mixed colours) and from the original elsewhere
 * (so "restore" brings back exactly what was there). The original is never touched.
 */
export async function applyCutoutMask(db: DbHandle, viewer: ViewerContext, assetId: string, maskPng: Buffer): Promise<MagicResult> {
  await getViewableAssetOrThrow(db, assetId, viewer); // ← the gate
  const orig = sharp(await originalBytes(db, assetId)).rotate();
  const { data: rgb, info } = await orig.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;

  const mm = await sharp(maskPng).metadata();
  if (!mm.width || !mm.height || Math.max(mm.width, mm.height) > TOUCHUP_EDGE * 1.05) throw new Error('bad-mask');
  if (Math.abs(mm.width / mm.height - W / H) > 0.02 * (W / H)) throw new Error('bad-mask');
  const alpha = await sharp(maskPng).removeAlpha().greyscale().resize(W, H, { fit: 'fill', kernel: 'cubic' }).raw().toBuffer();

  const cut = await cutoutBytes(db, assetId);
  const cutRaw = cut ? await sharp(cut).ensureAlpha().resize(W, H, { fit: 'fill' }).raw().toBuffer() : null;

  const out = Buffer.alloc(W * H * 4);
  for (let k = 0; k < W * H; k++) {
    const i = k * 3, o = k * 4;
    let r = rgb[i]!, g = rgb[i + 1]!, b = rgb[i + 2]!;
    if (cutRaw) {
      const ca = cutRaw[o + 3]! / 255;
      if (ca > 0) {
        r = Math.round(r * (1 - ca) + cutRaw[o]! * ca);
        g = Math.round(g * (1 - ca) + cutRaw[o + 1]! * ca);
        b = Math.round(b * (1 - ca) + cutRaw[o + 2]! * ca);
      }
    }
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = alpha[k]!;
  }
  const png = await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 6 }).toBuffer();
  return storeCutout(db, assetId, png, createHash('sha256').update(png).digest('hex'));
}

export interface PrintSharpResult {
  /** The pill's state for this placement, now. */
  state: Readiness;
  /** The copy made (or being made) for this source; null when none was needed. */
  sharp: PrintSharp | null;
  /** True while the super-resolution is still finishing in the background. */
  pending: boolean;
}

/**
 * "Upscale to print quality" — the one-tap fix for a placement that's more than 2× short but
 * above the floor. Gated + budget-capped like every magic edit. The verdict is the server's
 * (template + clamped transform + the SOURCE's real pixels); nothing about it is taken from the
 * client. Makes the print-sharp copy of the source (never touching the original) — in the
 * background when `defer` is given, so the tap answers at once; every later render waits for
 * or reuses that same job. Below the floor it's refused: no upscale can invent the detail.
 */
export async function upscaleForPrint(
  db: DbHandle,
  viewer: ViewerContext,
  input: { assetId: string; variantId: string; transform: RawTransform; sourceObjectId?: string | null },
  opts: { defer?: (job: () => Promise<void>) => void } = {},
): Promise<PrintSharpResult> {
  await getViewableAssetOrThrow(db, input.assetId, viewer); // ← the gate
  const [tpl] = await db.select().from(printTemplates).where(eq(printTemplates.variantId, input.variantId));
  if (!tpl) throw new Error('no print template for this variant');
  const src = await resolvePrintSource(db, input.assetId, input.sourceObjectId);
  if (!src) throw new Error('no source to upscale');

  const buf = await getObjectBytes(src.key);
  const meta = await sharp(buf).metadata();
  const dims = { width: meta.width ?? 0, height: meta.height ?? 0 };
  if (!dims.width || !dims.height) throw new Error('unreadable source image');
  const geom = { printWidthPx: tpl.printWidthPx, printHeightPx: tpl.printHeightPx, bleedMm: tpl.bleedMm, requiredDpi: tpl.requiredDpi };
  const assess = assessResolution(geom, dims, clampTransform(input.transform));

  // OK / ≤2× (classical, at render) / below the floor: nothing to make.
  if (assess.decision !== 'UPSCALE' || assess.tier === 0) return { state: readinessState(assess, null), sharp: null, pending: false };

  const made = await findPrintSharp(db, input.assetId, src);
  const sr: PrintSharp = { method: 'super-res', factor: PRINT_SHARP_FACTOR };
  if (made) return { state: readinessState(assess, sr), sharp: sr, pending: false };

  // No model here, or a source big enough to have plenty of real detail: classical (honestly "soft").
  if (!(await canMakePrintSharp(dims))) {
    const classical: PrintSharp = { method: 'classical' };
    return { state: readinessState(assess, classical), sharp: classical, pending: false };
  }

  await assertMlBudget(db, viewer.accountId, input.assetId);
  await db.insert(mlOperations).values({ accountId: viewer.accountId, op: 'UPSCALE', assetId: input.assetId });
  const job = async () => {
    await ensurePrintSharp(db, input.assetId, src, buf);
  };
  if (opts.defer) {
    opts.defer(() => job().catch((e: unknown) => console.warn('[magic] print-sharp failed (renders fall back to classical):', e instanceof Error ? e.message : e)));
    return { state: readinessState(assess, sr), sharp: sr, pending: true };
  }
  await job();
  return { state: readinessState(assess, sr), sharp: sr, pending: false };
}
