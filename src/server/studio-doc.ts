import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { assets, storageObjects } from '@/db/schema';
import type { ViewerContext } from '@/authz';
import { deleteObjectConfirmed, derivativeKey, getObjectBytes, getS3, putObject } from '@/storage';
import { getViewableAssetOrThrow } from './assets';
import type { DbHandle } from './db';
import { applyCutoutMask, cutoutAlphaForAsset } from './magic';

/**
 * The Studio's non-destructive recipe (Studio spec §16 "always-recoverable original"). Geometry is
 * applied in a fixed order — ROTATE (clockwise quarter-turns) → FLIP (horizontal, then vertical) →
 * CROP (a rectangle, 0–1 fractions of the rotated+flipped picture) — identically here and in the
 * browser, so what the parent sees is what prints.
 */
export interface StudioGeometry {
  rotate: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  crop: { x: number; y: number; w: number; h: number };
}

export const IDENTITY_GEOMETRY: StudioGeometry = { rotate: 0, flipH: false, flipV: false, crop: { x: 0, y: 0, w: 1, h: 1 } };

/** Validate + clamp a client-sent geometry (never trust the client). */
export function cleanGeometry(raw: unknown): StudioGeometry {
  const g = (raw ?? {}) as Partial<StudioGeometry>;
  const rotate = ([0, 90, 180, 270] as const).includes(g.rotate as 0) ? (g.rotate as StudioGeometry['rotate']) : 0;
  const c = g.crop ?? IDENTITY_GEOMETRY.crop;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  let x = Math.min(0.98, Math.max(0, num(c.x, 0)));
  let y = Math.min(0.98, Math.max(0, num(c.y, 0)));
  const w = Math.min(1 - x, Math.max(0.02, num(c.w, 1)));
  const h = Math.min(1 - y, Math.max(0.02, num(c.h, 1)));
  x = Math.min(x, 1 - w);
  y = Math.min(y, 1 - h);
  return { rotate, flipH: g.flipH === true, flipV: g.flipV === true, crop: { x, y, w, h } };
}

export const isIdentity = (g: StudioGeometry) =>
  g.rotate === 0 && !g.flipH && !g.flipV && g.crop.x <= 0.0005 && g.crop.y <= 0.0005 && g.crop.w >= 0.9995 && g.crop.h >= 0.9995;

/** Apply the recipe's geometry to an image (any size) — the server half of the shared contract. */
export async function applyGeometry(input: Buffer, g: StudioGeometry): Promise<{ buffer: Buffer; width: number; height: number }> {
  let buf = g.rotate ? await sharp(input).rotate(g.rotate).png().toBuffer() : input;
  if (g.flipH) buf = await sharp(buf).flop().png().toBuffer();
  if (g.flipV) buf = await sharp(buf).flip().png().toBuffer();
  const meta = await sharp(buf).metadata();
  const W = meta.width!, H = meta.height!;
  const left = Math.round(g.crop.x * W), top = Math.round(g.crop.y * H);
  const width = Math.max(1, Math.min(W - left, Math.round(g.crop.w * W)));
  const height = Math.max(1, Math.min(H - top, Math.round(g.crop.h * H)));
  const out = await sharp(buf).extract({ left, top, width, height }).png({ compressionLevel: 6 }).toBuffer();
  return { buffer: out, width, height };
}

async function bytesOf(db: DbHandle, assetId: string, which: 'ORIGINAL' | 'cutout'): Promise<Buffer | null> {
  if (which === 'ORIGINAL') {
    const [o] = await db.select().from(storageObjects).where(and(eq(storageObjects.assetId, assetId), eq(storageObjects.objectClass, 'ORIGINAL')));
    return o ? getObjectBytes(o.key) : null;
  }
  const key = derivativeKey(assetId, 'cutout');
  const [o] = await db.select({ id: storageObjects.id }).from(storageObjects).where(eq(storageObjects.key, key));
  return o ? getObjectBytes(key) : null;
}

/** Reopen the Studio where the parent left it: the recipe + the current transparency mask. */
export async function studioStateForAsset(
  db: DbHandle,
  viewer: ViewerContext,
  assetId: string,
): Promise<{ geometry: StudioGeometry; mask: Buffer | null }> {
  await getViewableAssetOrThrow(db, assetId, viewer); // ← the gate
  const [row] = await db.select({ doc: assets.studioDoc }).from(assets).where(eq(assets.id, assetId));
  const geometry = row?.doc ? cleanGeometry(row.doc) : IDENTITY_GEOMETRY;
  return { geometry, mask: await cutoutAlphaForAsset(db, viewer, assetId) };
}

export interface StudioSaveResult {
  /** The design to render products from (null = the untouched original). */
  sourceObjectId: string | null;
  objectKey: string | null;
  /** The design's width/height, for auto-orienting product tiles. */
  aspect: number;
}

/**
 * Save the Studio: the transparency mask (if the parent removed / erased / brought back anything)
 * becomes the cutout, then the geometry is applied to the cutout (or the original) at FULL
 * resolution and stored as the 'design' derivative products are made from. The original is never
 * changed; the recipe is stored so the Studio reopens exactly as it was left.
 */
export async function saveStudio(
  db: DbHandle,
  viewer: ViewerContext,
  assetId: string,
  input: { mask: Buffer | null; geometry: StudioGeometry; clearCutout?: boolean },
): Promise<StudioSaveResult> {
  await getViewableAssetOrThrow(db, assetId, viewer); // ← the gate
  const g = cleanGeometry(input.geometry);
  if (input.mask) await applyCutoutMask(db, viewer, assetId, input.mask);
  if (input.clearCutout) await dropDerivative(db, assetId, 'cutout');
  await db.update(assets).set({ studioDoc: g }).where(eq(assets.id, assetId));

  const cut = input.clearCutout ? null : await bytesOf(db, assetId, 'cutout');
  const source = cut ?? (await bytesOf(db, assetId, 'ORIGINAL'));
  if (!source) throw new Error('no original to edit');

  if (!cut && isIdentity(g)) {
    await dropDerivative(db, assetId, 'design'); // back to the plain original — no stale design left behind
    const meta = await sharp(source).rotate().metadata();
    return { sourceObjectId: null, objectKey: null, aspect: (meta.width ?? 1) / (meta.height ?? 1) };
  }
  if (cut && isIdentity(g)) {
    const key = derivativeKey(assetId, 'cutout');
    const [o] = await db.select({ id: storageObjects.id }).from(storageObjects).where(eq(storageObjects.key, key));
    const meta = await sharp(cut).metadata();
    return { sourceObjectId: o!.id, objectKey: key, aspect: (meta.width ?? 1) / (meta.height ?? 1) };
  }

  const base = cut ?? (await sharp(source).rotate().png().toBuffer()); // originals: honour orientation first
  const designed = await applyGeometry(base, g);
  const key = derivativeKey(assetId, 'design');
  await putObject(key, designed.buffer, 'image/png');
  const sha256 = createHash('sha256').update(designed.buffer).digest('hex');
  const [existing] = await db.select({ id: storageObjects.id }).from(storageObjects).where(eq(storageObjects.key, key));
  let objectId: string;
  if (existing) {
    await db.update(storageObjects).set({ byteSize: designed.buffer.byteLength, sha256 }).where(eq(storageObjects.id, existing.id));
    objectId = existing.id;
  } else {
    const [row] = await db
      .insert(storageObjects)
      .values({ assetId, objectClass: 'DERIVATIVE', bucket: getS3().bucket, key, contentType: 'image/png', byteSize: designed.buffer.byteLength, sha256, exifStripped: true, writeOnce: false })
      .returning();
    objectId = row!.id;
  }
  return { sourceObjectId: objectId, objectKey: key, aspect: designed.width / designed.height };
}

/** Remove a derivative for real: bytes first (confirmed), then the row. */
async function dropDerivative(db: DbHandle, assetId: string, kind: 'cutout' | 'design'): Promise<void> {
  const key = derivativeKey(assetId, kind);
  const [row] = await db.select({ id: storageObjects.id }).from(storageObjects).where(eq(storageObjects.key, key));
  if (!row) return;
  await deleteObjectConfirmed(key);
  await db.delete(storageObjects).where(eq(storageObjects.id, row.id));
}
