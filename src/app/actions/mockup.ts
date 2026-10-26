'use server';

import '@/server/print/sharp-init';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { printTemplates, templateAssets } from '@/db/schema';
import { getObjectBytes, presignDownload } from '@/storage';

// The compose itself is a ROUTE HANDLER now (src/app/api/mockup/route.ts) — server
// actions serialise and abort each other, so several previews composing at once rendered
// inconsistently. This file keeps only the brand-safe product-context action below.

export type MockupContext = {
  ok: true;
  blankUrl: string;
  maskUrl: string | null;
  /** Normalised TL,TR,BR,BL corners of the print area on the blank. */
  quad: [number, number][];
  blankW: number;
  blankH: number;
  /** The foreground overlay (e.g. the jigsaw's die-cut piece lines), CROPPED to the print
   * area + downscaled, as a data URL — so the positioner can preview the art "as a puzzle".
   * null when the template has no overlay. */
  overlayUrl: string | null;
} | { ok: false };

/**
 * The BRAND-SAFE product context for a variant — the blank product photo, its print-area
 * quad and (optional) silhouette mask — so the positioner can show the image being placed
 * ON the product, live. Structurally NON-child data (the same imagery the public catalogue
 * renders), so no viewer gate; a short-lived signed link for the photo, the mask inline (see maskDataUrl).
 */
export async function mockupContextAction(input: { variantId: string }): Promise<MockupContext> {
  const db = getDb();
  const [tpl] = await db.select().from(printTemplates).where(eq(printTemplates.variantId, input.variantId));
  if (!tpl?.blankObjectId || !tpl.printQuad) return { ok: false };
  const [blank] = await db.select().from(templateAssets).where(eq(templateAssets.id, tpl.blankObjectId));
  if (!blank?.widthPx || !blank.heightPx) return { ok: false };
  const [mask] = tpl.maskObjectId ? await db.select().from(templateAssets).where(eq(templateAssets.id, tpl.maskObjectId)) : [undefined];
  const [overlay] = tpl.lightingObjectId ? await db.select().from(templateAssets).where(eq(templateAssets.id, tpl.lightingObjectId)) : [undefined];
  return {
    ok: true,
    blankUrl: await presignDownload(blank.key, 600),
    maskUrl: mask ? await maskDataUrl(mask.key) : null,
    quad: tpl.printQuad,
    blankW: blank.widthPx,
    blankH: blank.heightPx,
    overlayUrl: overlay?.widthPx && overlay.heightPx ? await croppedOverlayDataUrl(overlay.key, tpl.printQuad, overlay.widthPx, overlay.heightPx) : null,
  };
}

/**
 * The product's SILHOUETTE MASK as a data URL (white = printable), for the positioner's CSS mask. A CSS
 * mask-image is a cross-origin fetch that needs CORS — and the private bucket allows only uploads — so a
 * signed link silently masked the drawing away to nothing on the live site (founder, 26 Oct: "edit
 * placement on the product views isn't working on a number"). Inline, it always works. Brand-safe
 * template imagery only. Transparent → black (not printable), so alpha-shaped print maps work too.
 */
async function maskDataUrl(key: string): Promise<string | null> {
  try {
    const png = await sharp(await getObjectBytes(key), { limitInputPixels: 50_000_000 })
      .resize(1000, 1000, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#000000' })
      .greyscale()
      .png({ compressionLevel: 9 })
      .toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return null; // without a mask the drawing shows unclipped — better than vanishing
  }
}

/**
 * The foreground overlay cropped to the PRINT AREA (the full-frame piece-lines layer holds
 * the lines only over the board), downscaled, as a data URL. The positioner lays it over the
 * placed art so the flat editor previews it "as a puzzle" — the die-cut lines on the drawing.
 */
async function croppedOverlayDataUrl(key: string, quad: [number, number][], W: number, H: number): Promise<string | null> {
  try {
    const xs = quad.map((p) => p[0]);
    const ys = quad.map((p) => p[1]);
    const x0 = Math.max(0, Math.round(Math.min(...xs) * W));
    const y0 = Math.max(0, Math.round(Math.min(...ys) * H));
    const x1 = Math.min(W, Math.round(Math.max(...xs) * W));
    const y1 = Math.min(H, Math.round(Math.max(...ys) * H));
    const cropped = await sharp(await getObjectBytes(key), { limitInputPixels: 50_000_000 })
      .extract({ left: x0, top: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) })
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    return `data:image/png;base64,${cropped.toString('base64')}`;
  } catch {
    return null; // a preview aid — never break the positioner if the crop hiccups
  }
}
