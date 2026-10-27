'use server';

import { getDb } from '@/db/client';
import { resolveAssetViewer } from '@/server/assets';
import { studioKeepsakeInfo, type StudioKeepsakeInfo } from '@/server/studio-manage';
import { getCurrentAccount, getUploadClaims } from '@/server/session';

/** Who can see the creation open in the Studio, and whether this viewer may change it. */
export async function studioInfoAction(input: { assetId: string }): Promise<({ ok: true } & StudioKeepsakeInfo) | { ok: false }> {
  const account = await getCurrentAccount();
  const claims = await getUploadClaims();
  const db = getDb();
  const assetId = String(input.assetId);
  const viewer = await resolveAssetViewer(db, assetId, account?.id ?? null, claims);
  try {
    return { ok: true, ...(await studioKeepsakeInfo(db, viewer, assetId)) };
  } catch {
    return { ok: false };
  }
}
