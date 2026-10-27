'use server';

import { getDb } from '@/db/client';
import { getStorageObjectGrant, resolveAssetViewer } from '@/server/assets';
import { renderPrintFile, type UpscaleMethod } from '@/server/print/render';
import { getCurrentAccount, getUploadClaims } from '@/server/session';
import type { RawTransform } from '@/server/print/geometry';

export type RenderPreviewResult =
  | { ok: true; url: string; widthPx: number; heightPx: number; renderedDpi: number; effectiveDpi: number; upscaled: boolean; upscaleMethod: UpscaleMethod }
  | { ok: false; blocked?: boolean; needsAuth?: boolean };

/**
 * Render the REAL print-ready file for the current placement and hand back a
 * signed URL so the editor can show the actual output (bleed + DPI), not a CSS
 * approximation. Gated end to end — for a signed-in member via their family
 * membership, for a guest via the upload claim on their own ephemeral draft. A
 * too-low-res placement is reported as blocked rather than rendered.
 */
export async function renderPreviewAction(input: {
  assetId: string;
  variantId: string;
  transform: RawTransform;
  sourceObjectId?: string;
}): Promise<RenderPreviewResult> {
  const account = await getCurrentAccount();
  const claims = await getUploadClaims();
  const db = getDb();
  const viewer = await resolveAssetViewer(db, input.assetId, account?.id ?? null, claims);

  try {
    const res = await renderPrintFile(db, viewer, {
      assetId: input.assetId,
      variantId: input.variantId,
      transform: input.transform,
      sourceObjectId: input.sourceObjectId,
    });
    const grant = await getStorageObjectGrant(db, res.printObjectId, viewer, 600);
    return {
      ok: true,
      url: grant.url,
      widthPx: res.widthPx,
      heightPx: res.heightPx,
      renderedDpi: res.renderedDpi,
      effectiveDpi: res.effectiveDpi,
      upscaled: res.upscaled,
      upscaleMethod: res.upscaleMethod,
    };
  } catch (e) {
    const msg = String(e);
    return { ok: false, blocked: msg.includes('low-res'), needsAuth: account === null && viewer.uploadClaim == null };
  }
}
