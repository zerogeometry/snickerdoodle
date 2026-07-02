import './sharp-init';
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { printTemplates, storageObjects } from '@/db/schema';
import { getViewableAssetOrThrow } from '@/server/assets';
import { derivativeKey, getObjectBytes, getS3, putObject } from '@/storage';
import type { ViewerContext } from '@/authz';
import type { DbHandle } from '@/server/db';
import { assessResolution, clampTransform, computeLayerRect, type RawTransform } from './geometry';

export interface RenderResult {
  printObjectId: string;
  key: string;
  renderedDpi: number;
  effectiveDpi: number;
  upscaled: boolean;
  widthPx: number;
  heightPx: number;
}

/**
 * Render a print-ready file for an asset on a product variant (proposal/04 §4.4).
 * Server-authoritative throughout: authz-gated, the transform is clamped here, the
 * geometry comes from the template, and the output is exactly the bleed canvas at
 * the product's DPI. The ORIGINAL is never mutated — the result is a write-once
 * DERIVATIVE. (Self-hosted: no third party sees the image. Real ML super-resolution
 * for large enlargements lands in P2; P1 uses classical resampling.)
 */
export async function renderPrintFile(
  db: DbHandle,
  viewer: ViewerContext,
  input: {
    assetId: string;
    variantId: string;
    transform: RawTransform;
    sourceObjectClass?: 'ORIGINAL' | 'DERIVATIVE';
    /** Render from a SPECIFIC stored object (e.g. a bg-removed cutout) — must belong to the asset. */
    sourceObjectId?: string;
  },
): Promise<RenderResult> {
  await getViewableAssetOrThrow(db, input.assetId, viewer); // ← the gate

  const [tpl] = await db.select().from(printTemplates).where(eq(printTemplates.variantId, input.variantId));
  if (!tpl) throw new Error('no print template for this variant');

  const [srcObj] = input.sourceObjectId
    ? await db
        .select()
        .from(storageObjects)
        .where(and(eq(storageObjects.id, input.sourceObjectId), eq(storageObjects.assetId, input.assetId)))
    : await db
        .select()
        .from(storageObjects)
        .where(and(eq(storageObjects.assetId, input.assetId), eq(storageObjects.objectClass, input.sourceObjectClass ?? 'ORIGINAL')));
  if (!srcObj) throw new Error('no source object to render from');

  const srcBuf = await getObjectBytes(srcObj.key);
  const meta = await sharp(srcBuf).metadata();
  const src = { width: meta.width ?? 0, height: meta.height ?? 0 };
  if (!src.width || !src.height) throw new Error('unreadable source image');

  const transform = clampTransform(input.transform);
  const geom = { printWidthPx: tpl.printWidthPx, printHeightPx: tpl.printHeightPx, bleedMm: tpl.bleedMm, requiredDpi: tpl.requiredDpi };
  const assess = assessResolution(geom, src, transform);
  if (assess.decision === 'BLOCK') {
    throw new Error(`source too low-res for this product (would need ${assess.upscaleFactor.toFixed(1)}× upscale)`);
  }

  const rect = computeLayerRect(geom, src, transform);
  // rotate → scale to the drawn rect → INTERSECT with the canvas and place at its offset
  // on a white canvas. Handles both regimes: cover/zoom (layer ≥ canvas → crop, offset 0,
  // identical to the old extract) and contain/zoom-out (layer < canvas → whole image
  // placed centred with white margins — unprinted product surface).
  const layer = await sharp(srcBuf).rotate(transform.rotationDeg).resize(rect.width, rect.height, { fit: 'fill' }).toBuffer();
  const ix = Math.max(0, -rect.x);
  const iy = Math.max(0, -rect.y);
  const ox = Math.max(0, rect.x);
  const oy = Math.max(0, rect.y);
  const iw = Math.max(1, Math.min(rect.width - ix, rect.canvasWidth - ox));
  const ih = Math.max(1, Math.min(rect.height - iy, rect.canvasHeight - oy));
  const part = await sharp(layer).extract({ left: ix, top: iy, width: iw, height: ih }).toBuffer();
  const out = await sharp({ create: { width: rect.canvasWidth, height: rect.canvasHeight, channels: 3, background: '#ffffff' } })
    .composite([{ input: part, left: ox, top: oy }])
    .flatten({ background: '#ffffff' })
    .png()
    .withMetadata({ density: tpl.requiredDpi })
    .toBuffer();

  const key = derivativeKey(input.assetId, `printfile-${input.variantId}`);
  await putObject(key, out, 'image/png');
  const sha256 = createHash('sha256').update(out).digest('hex');
  const { bucket } = getS3();

  // Deterministic key → a re-render overwrites the same DERIVATIVE.
  const [existing] = await db.select({ id: storageObjects.id }).from(storageObjects).where(eq(storageObjects.key, key));
  let printObjectId: string;
  if (existing) {
    await db.update(storageObjects).set({ byteSize: out.byteLength, sha256 }).where(eq(storageObjects.id, existing.id));
    printObjectId = existing.id;
  } else {
    // Conflict-safe under the unique index on key: a concurrent racer that also saw no
    // existing row can't double-insert — the loser no-ops and we re-read the winner.
    const [row] = await db
      .insert(storageObjects)
      .values({ assetId: input.assetId, objectClass: 'DERIVATIVE', bucket, key, contentType: 'image/png', byteSize: out.byteLength, sha256, exifStripped: true, writeOnce: true })
      .onConflictDoNothing({ target: storageObjects.key })
      .returning();
    printObjectId = row?.id ?? (await db.select({ id: storageObjects.id }).from(storageObjects).where(eq(storageObjects.key, key)))[0]!.id;
  }

  return {
    printObjectId,
    key,
    renderedDpi: tpl.requiredDpi, // the file's embedded density
    effectiveDpi: assess.effectiveDpi, // the real source resolution at this placement
    upscaled: assess.decision === 'UPSCALE',
    widthPx: rect.canvasWidth,
    heightPx: rect.canvasHeight,
  };
}
