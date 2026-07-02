'use server';

import { getDb } from '@/db/client';
import { getStorageObjectGrant, resolveAssetViewer } from '@/server/assets';
import { removeBackgroundForAsset } from '@/server/magic';
import { getCurrentAccount, getUploadClaims } from '@/server/session';

/**
 * "Remove background" magic edit — self-hosted, gated, budget-capped. Runs
 * in-region (no third party sees the image), stores a cutout DERIVATIVE, and hands
 * back a signed URL + the object id so the editor can preview it and render the
 * final print from it. Works for a signed-in member (via membership) and for a
 * guest (via the upload claim on their own ephemeral draft).
 */
export async function removeBackgroundAction(input: {
  assetId: string;
}): Promise<{ ok: true; url: string; sourceObjectId: string } | { ok: false; needsAuth?: boolean; reason?: 'budget' | 'nochange' }> {
  const account = await getCurrentAccount();
  const claims = await getUploadClaims();
  const db = getDb();
  const viewer = await resolveAssetViewer(db, input.assetId, account?.id ?? null, claims);

  try {
    const res = await removeBackgroundForAsset(db, viewer, input.assetId);
    const grant = await getStorageObjectGrant(db, res.objectId, viewer, 600);
    return { ok: true, url: grant.url, sourceObjectId: res.objectId };
  } catch (e) {
    const msg = String(e);
    if (msg.includes('budget')) return { ok: false, reason: 'budget' };
    if (msg.includes('no-clean-background')) return { ok: false, reason: 'nochange' };
    return { ok: false, needsAuth: account === null && viewer.uploadClaim == null };
  }
}
