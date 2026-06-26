import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { printTemplates, storageObjects } from '@/db/schema';
import { getViewableAssetOrThrow } from '@/server/assets';
import { derivativeKey, getObjectBytes, getS3, putObject } from '@/storage';
import type { ViewerContext } from '@/authz';
import type { DbHandle } from '@/server/db';
import { assessResolution, clampTransform, computeLayerRect, type Transform } from './geometry';

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
  input: { assetId: string; variantId: string; transform: Partial<Transform>; sourceObjectClass?: 'ORIGINAL' | 'DERIVATIVE' },
): Promise<RenderResult> {
  await getViewableAssetOrThrow(db, input.assetId, viewer); // ← the gate

  const [tpl] = await db.select().from(printTemplates).where(eq(printTemplates.variantId, input.variantId));
  if (!tpl) throw new Error('no print template for this variant');

  const cls = input.sourceObjectClass ?? 'ORIGINAL';
  const [srcObj] = await db
    .select()
    .from(storageObjects)
    .where(and(eq(storageObjects.assetId, input.assetId), eq(storageObjects.objectClass, cls)));
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
  // rotate → scale to the drawn rect → extract the canvas window (clamped to stay
  // in-bounds against rounding) → flatten on white → embed the print DPI.
  const layer = await sharp(srcBuf).rotate(transform.rotationDeg).resize(rect.width, rect.height, { fit: 'fill' }).toBuffer();
  const left = Math.min(Math.max(0, -rect.x), Math.max(0, rect.width - rect.canvasWidth));
  const top = Math.min(Math.max(0, -rect.y), Math.max(0, rect.height - rect.canvasHeight));
  const out = await sharp(layer)
    .extract({ left, top, width: rect.canvasWidth, height: rect.canvasHeight })
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
    const [row] = await db
      .insert(storageObjects)
      .values({ assetId: input.assetId, objectClass: 'DERIVATIVE', bucket, key, contentType: 'image/png', byteSize: out.byteLength, sha256, exifStripped: true, writeOnce: true })
      .returning();
    printObjectId = row!.id;
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
