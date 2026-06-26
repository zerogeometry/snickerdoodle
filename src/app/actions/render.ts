'use server';

import { eq } from 'drizzle-orm';
import { assets } from '@/db/schema';
import { getDb } from '@/db/client';
import { getStorageObjectGrant, resolveViewerContext } from '@/server/assets';
import { renderPrintFile } from '@/server/print/render';
import { getCurrentAccount } from '@/server/session';
import type { RawTransform } from '@/server/print/geometry';

export type RenderPreviewResult =
  | { ok: true; url: string; widthPx: number; heightPx: number; renderedDpi: number; effectiveDpi: number; upscaled: boolean }
  | { ok: false; blocked?: boolean; needsAuth?: boolean };

/**
 * Render the REAL print-ready file for the current placement and hand back a
 * signed URL so the editor can show the actual output (bleed + DPI), not a CSS
 * approximation. Authz-gated end to end; a too-low-res placement is reported as
 * blocked rather than rendered.
 */
export async function renderPreviewAction(input: {
  assetId: string;
  variantId: string;
  transform: RawTransform;
}): Promise<RenderPreviewResult> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, needsAuth: true };

  const db = getDb();
  const [asset] = await db.select({ familyId: assets.familyId }).from(assets).where(eq(assets.id, input.assetId));
  if (!asset) return { ok: false };
  const viewer = await resolveViewerContext(db, account.id, asset.familyId);

  try {
    const res = await renderPrintFile(db, viewer, { assetId: input.assetId, variantId: input.variantId, transform: input.transform });
    const grant = await getStorageObjectGrant(db, res.printObjectId, viewer, 600);
    return {
      ok: true,
      url: grant.url,
      widthPx: res.widthPx,
      heightPx: res.heightPx,
      renderedDpi: res.renderedDpi,
      effectiveDpi: res.effectiveDpi,
      upscaled: res.upscaled,
    };
  } catch (e) {
    return { ok: false, blocked: String(e).includes('low-res') };
  }
}
