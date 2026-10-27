import { and, eq, like, ne } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { assets, storageObjects } from '@/db/schema';
import { superResAvailable, superResolve, srAccepts, SR_MODEL_TAG } from '@/ml/superRes';
import { deleteObjectConfirmed, derivativeKey, getObjectBytes, getS3, putObject } from '@/storage';
import type { DbHandle } from '@/server/db';
import { PRINT_SHARP_FACTOR } from './geometry';

/**
 * The "print-sharp" copy: a super-resolved DERIVATIVE of a print source (the original, the
 * cutout, or the Studio design), made once and reused by every render of that source.
 *
 *  - The ORIGINAL is never touched; the copy is its own storage object, deleted with the asset.
 *  - The DPI gate never reads the copy's pixel size: it always judges the SOURCE's real pixels
 *    (an upscale adds sharpness, not detail), so the floor can't be slipped by upscaling.
 *  - The key carries the source's id + content hash + model, so an edited cutout gets a fresh
 *    copy (the stale one is removed) and a model change never serves an old result.
 */

type StorageRow = typeof storageObjects.$inferSelect;
export type PrintSource = Pick<StorageRow, 'id' | 'key' | 'sha256' | 'objectClass'>;

/** A print is made FROM the original, the cutout or the Studio design — never from a print
 * file, a mockup or an upscaled copy (each overstates the real detail and would slip the gate). */
export function isPrintSourceKey(assetId: string, obj: Pick<StorageRow, 'key' | 'objectClass'>): boolean {
  if (obj.objectClass === 'ORIGINAL') return true;
  return obj.key === derivativeKey(assetId, 'cutout') || obj.key === derivativeKey(assetId, 'design');
}

/**
 * The stored object a print of this asset is made from: the named object (must belong to the
 * asset AND be a print source), else the ORIGINAL. null if there's no such object.
 */
export async function resolvePrintSource(db: DbHandle, assetId: string, sourceObjectId?: string | null): Promise<StorageRow | null> {
  const [obj] = sourceObjectId
    ? await db.select().from(storageObjects).where(and(eq(storageObjects.id, sourceObjectId), eq(storageObjects.assetId, assetId)))
    : await db.select().from(storageObjects).where(and(eq(storageObjects.assetId, assetId), eq(storageObjects.objectClass, 'ORIGINAL')));
  if (!obj || !isPrintSourceKey(assetId, obj)) return null;
  return obj;
}

/** A Studio design is enlarged at most this much (studio-doc.ts DESIGN_MAX_ENLARGE) for crisp overlays. */
const DESIGN_MAX_ENLARGE = 4;

/**
 * The REAL pixel size a print source carries — what the DPI gate must judge. The original and the
 * cutout are their own pixels. A Studio design may have been ENLARGED (up to 4×) so added words
 * and stickers print crisp; its real size — the drawing's own pixels — is recorded with the
 * design's content hash when it's saved. No matching record (an older design) → assume the most
 * it could have been enlarged: the gate can be too careful, never too generous.
 */
export async function printSourceDims(
  db: DbHandle,
  assetId: string,
  src: Pick<StorageRow, 'key' | 'sha256'>,
  buf?: Buffer,
): Promise<{ width: number; height: number } | null> {
  const meta = await sharp(buf ?? (await getObjectBytes(src.key))).metadata().catch(() => null);
  if (!meta?.width || !meta.height) return null;
  const bytes = { width: meta.width, height: meta.height };
  if (src.key !== derivativeKey(assetId, 'design')) return bytes;
  const [row] = await db.select({ doc: assets.studioDoc }).from(assets).where(eq(assets.id, assetId));
  const rec = (row?.doc as { designPx?: { width?: unknown; height?: unknown; sha256?: unknown } } | null)?.designPx;
  if (rec && src.sha256 && rec.sha256 === src.sha256 && typeof rec.width === 'number' && typeof rec.height === 'number' && rec.width > 0 && rec.height > 0) {
    // never more than the file itself holds
    return { width: Math.min(bytes.width, Math.round(rec.width)), height: Math.min(bytes.height, Math.round(rec.height)) };
  }
  return { width: Math.max(1, Math.floor(bytes.width / DESIGN_MAX_ENLARGE)), height: Math.max(1, Math.floor(bytes.height / DESIGN_MAX_ENLARGE)) };
}

const prefixFor = (assetId: string, src: PrintSource) => derivativeKey(assetId, `upscale-${src.id}.`);
export function printSharpKey(assetId: string, src: PrintSource): string {
  return `${prefixFor(assetId, src)}${(src.sha256 ?? 'nosha').slice(0, 10)}-${SR_MODEL_TAG}x${PRINT_SHARP_FACTOR}`;
}

export interface PrintSharpCopy {
  objectId: string;
  key: string;
  factor: number;
  buffer: Buffer;
}

/** The existing print-sharp copy for this source, if one was made. */
export async function findPrintSharp(db: DbHandle, assetId: string, src: PrintSource): Promise<{ objectId: string; key: string; factor: number } | null> {
  const key = printSharpKey(assetId, src);
  const [row] = await db.select({ id: storageObjects.id }).from(storageObjects).where(eq(storageObjects.key, key));
  return row ? { objectId: row.id, key, factor: PRINT_SHARP_FACTOR } : null;
}

/** Could a print-sharp copy be made for a source this size (model present + under the cap)? */
export async function canMakePrintSharp(dims: { width: number; height: number }): Promise<boolean> {
  return srAccepts(dims.width, dims.height) && (await superResAvailable());
}

// One job per copy in this process: a tap, a preview and a fulfilment render share it.
const inflight = new Map<string, Promise<PrintSharpCopy | null>>();

/**
 * Get or make the print-sharp copy. null when super-resolution can't run for this source
 * (no model, over the size cap) — the caller uses the classical resample instead.
 */
export function ensurePrintSharp(db: DbHandle, assetId: string, src: PrintSource, srcBuf?: Buffer): Promise<PrintSharpCopy | null> {
  const key = printSharpKey(assetId, src);
  const running = inflight.get(key);
  if (running) return running;
  const job = makePrintSharp(db, assetId, src, key, srcBuf).finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

async function makePrintSharp(db: DbHandle, assetId: string, src: PrintSource, key: string, srcBuf?: Buffer): Promise<PrintSharpCopy | null> {
  const [existing] = await db.select({ id: storageObjects.id }).from(storageObjects).where(eq(storageObjects.key, key));
  if (existing) return { objectId: existing.id, key, factor: PRINT_SHARP_FACTOR, buffer: await getObjectBytes(key) };

  const input = srcBuf ?? (await getObjectBytes(src.key));
  const meta = await sharp(input).metadata();
  const w = meta.width ?? 0, h = meta.height ?? 0;
  if (!(await canMakePrintSharp({ width: w, height: h }))) return null;
  const buffer = await superResolve(input, w * PRINT_SHARP_FACTOR, h * PRINT_SHARP_FACTOR);
  if (!buffer) return null;

  await putObject(key, buffer, 'image/png');
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const [row] = await db
    .insert(storageObjects)
    .values({ assetId, objectClass: 'DERIVATIVE', bucket: getS3().bucket, key, contentType: 'image/png', byteSize: buffer.byteLength, sha256, exifStripped: true, writeOnce: false })
    .onConflictDoNothing({ target: storageObjects.key })
    .returning();
  const objectId = row?.id ?? (await db.select({ id: storageObjects.id }).from(storageObjects).where(eq(storageObjects.key, key)))[0]!.id;

  // A copy made from an older version of this source (the cutout was touched up) is stale: remove it.
  const stale = await db
    .select({ id: storageObjects.id, key: storageObjects.key })
    .from(storageObjects)
    .where(and(eq(storageObjects.assetId, assetId), like(storageObjects.key, `${prefixFor(assetId, src)}%`), ne(storageObjects.key, key)));
  for (const s of stale) {
    await deleteObjectConfirmed(s.key);
    await db.delete(storageObjects).where(eq(storageObjects.id, s.id));
  }
  return { objectId, key, factor: PRINT_SHARP_FACTOR, buffer };
}
