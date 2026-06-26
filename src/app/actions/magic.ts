'use server';

import { eq } from 'drizzle-orm';
import { assets } from '@/db/schema';
import { getDb } from '@/db/client';
import { getStorageObjectGrant, resolveViewerContext } from '@/server/assets';
import { removeBackgroundForAsset } from '@/server/magic';
import { getCurrentAccount } from '@/server/session';

/**
 * "Remove background" magic edit — self-hosted, authz-gated, budget-capped. Runs
 * in-region (no third party sees the image), stores a cutout DERIVATIVE, and hands
 * back a signed URL + the object id so the editor can preview it and render the
 * final print from it.
 */
export async function removeBackgroundAction(input: {
  assetId: string;
}): Promise<{ ok: true; url: string; sourceObjectId: string } | { ok: false; needsAuth?: boolean; reason?: 'budget' }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, needsAuth: true };

  const db = getDb();
  const [asset] = await db.select({ familyId: assets.familyId }).from(assets).where(eq(assets.id, input.assetId));
  if (!asset) return { ok: false };
  const viewer = await resolveViewerContext(db, account.id, asset.familyId);

  try {
    const res = await removeBackgroundForAsset(db, viewer, input.assetId);
    const grant = await getStorageObjectGrant(db, res.objectId, viewer, 600);
    return { ok: true, url: grant.url, sourceObjectId: res.objectId };
  } catch (e) {
    return { ok: false, reason: String(e).includes('budget') ? 'budget' : undefined };
  }
}
