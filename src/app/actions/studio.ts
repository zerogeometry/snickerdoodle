'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/db/client';
import { getStorageObjectGrant, resolveAssetViewer } from '@/server/assets';
import { deleteStudioCreation, duplicateCreation, studioKeepsakeInfo, type StudioKeepsakeInfo } from '@/server/studio-manage';
import { getCurrentAccount, getUploadClaims } from '@/server/session';

async function viewerFor(assetId: string) {
  const account = await getCurrentAccount();
  const claims = await getUploadClaims();
  const db = getDb();
  return { db, viewer: await resolveAssetViewer(db, assetId, account?.id ?? null, claims) };
}

/** Who can see the creation open in the Studio, and whether this viewer may change it. */
export async function studioInfoAction(input: { assetId: string }): Promise<({ ok: true } & StudioKeepsakeInfo) | { ok: false }> {
  const assetId = String(input.assetId);
  const { db, viewer } = await viewerFor(assetId);
  try {
    return { ok: true, ...(await studioKeepsakeInfo(db, viewer, assetId)) };
  } catch {
    return { ok: false };
  }
}

/**
 * Delete this creation and its source for good, from the Studio (NN8) — the same cascading erase
 * as deleting a keepsake from home. A kept one: its controlling parent only (re-checked here);
 * a draft: whoever holds its upload claim.
 */
export async function deleteCreationAction(input: { assetId: string }): Promise<{ ok: boolean }> {
  const assetId = String(input.assetId);
  const { db, viewer } = await viewerFor(assetId);
  try {
    await deleteStudioCreation(db, viewer, assetId);
  } catch {
    return { ok: false };
  }
  revalidatePath('/home');
  return { ok: true };
}

/** A copy of this keepsake to try something else on — the first one stays just as it is. */
export async function duplicateCreationAction(input: { assetId: string }): Promise<{ ok: true; assetId: string; trim: { url: string; sourceObjectId: string } | null } | { ok: false }> {
  const assetId = String(input.assetId);
  const { db, viewer } = await viewerFor(assetId);
  try {
    const res = await duplicateCreation(db, viewer, assetId);
    revalidatePath('/home');
    // a trimmed upload: the copy's own trimmed drawing (what its products are made from), via the gate
    const trim = res.trimmedObjectId ? { url: (await getStorageObjectGrant(db, res.trimmedObjectId, viewer, 600)).url, sourceObjectId: res.trimmedObjectId } : null;
    return { ok: true, assetId: res.assetId, trim };
  } catch {
    return { ok: false };
  }
}
