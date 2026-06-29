'use server';

import { getDb } from '@/db/client';
import { getStorageObjectGrant, resolveAssetViewer } from '@/server/assets';
import { composeMockup, type MockupSize } from '@/server/print/compositor';
import { getCurrentAccount, getUploadClaims } from '@/server/session';
import type { RawTransform } from '@/server/print/geometry';

export type MockupPreviewResult =
  | { ok: true; url: string; tier: 'FLAT'; widthPx?: number; heightPx?: number }
  | { ok: false; needsAuth?: boolean; fallback: true };

/**
 * Compose a photoreal product mockup (the child's design on a brand-safe blank
 * product photo) IN-VPC and hand back a signed URL. Gated end to end — a signed-in
 * member via their family membership, a guest via the upload claim on their own
 * ephemeral draft. On ANY failure — no template authored yet, a too-low-res design,
 * an engine error, or an unauthorised viewer — it returns { ok:false, fallback:true }
 * so the catalogue renders the SVG ProductMockup placeholder, never a broken image
 * or a thrown 500.
 */
export async function composeMockupAction(input: {
  assetId: string;
  variantId: string;
  transform: RawTransform;
  size?: MockupSize;
  sourceObjectId?: string;
}): Promise<MockupPreviewResult> {
  const account = await getCurrentAccount();
  const claims = await getUploadClaims();
  const db = getDb();
  const viewer = await resolveAssetViewer(db, input.assetId, account?.id ?? null, claims);

  try {
    const res = await composeMockup(db, viewer, {
      assetId: input.assetId,
      variantId: input.variantId,
      transform: input.transform,
      size: input.size,
      sourceObjectId: input.sourceObjectId,
    });
    const grant = await getStorageObjectGrant(db, res.mockupObjectId, viewer, 600);
    return { ok: true, url: grant.url, tier: res.tier, widthPx: res.widthPx, heightPx: res.heightPx };
  } catch {
    return { ok: false, needsAuth: account === null && viewer.uploadClaim == null, fallback: true };
  }
}
