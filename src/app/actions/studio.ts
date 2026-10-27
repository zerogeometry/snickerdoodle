'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/db/client';
import { resolveAssetViewer } from '@/server/assets';
import { deleteStudioCreation, studioKeepsakeInfo, type StudioKeepsakeInfo } from '@/server/studio-manage';
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
