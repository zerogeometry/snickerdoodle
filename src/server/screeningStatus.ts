import { eq } from 'drizzle-orm';
import { assets } from '@/db/schema';
import type { DbHandle } from './db';
import { canViewAsset } from '@/authz';
import { assetRefOf } from './assetRef';
import { resolveAssetViewer } from './assets';

/**
 * What the shopper is told about their picture's safety check (founder, 10 Nov 2026): the checks
 * run in the background after upload (D26), and once they finish, a held picture brings up a notice
 * with a "back to upload" button. Deliberately coarse: never WHY it was held, never the labels.
 *  - checking: the checks haven't finished yet
 *  - ok:       cleared
 *  - held:     paused for review (FLAGGED), or never shown (BLOCKED)
 */
export type ScreeningStatus = 'checking' | 'ok' | 'held';

export function screeningStatusOf(moderationStatus: string): ScreeningStatus {
  if (moderationStatus === 'CLEAR') return 'ok';
  if (moderationStatus === 'PENDING') return 'checking';
  return 'held'; // FLAGGED, BLOCKED, or anything unexpected: the more private answer
}

/**
 * The picture's check status, for someone who may SEE it through the central gate: the guest holding
 * its upload claim, or its uploader/controller (who can see their own held picture). Anyone else
 * gets null: no status, not even whether the picture exists.
 */
export async function uploadScreeningStatus(
  db: DbHandle,
  assetId: string,
  accountId: string | null,
  uploadClaims: string[],
): Promise<ScreeningStatus | null> {
  const [row] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!row) return null;
  const viewer = await resolveAssetViewer(db, assetId, accountId, uploadClaims);
  if (!canViewAsset(assetRefOf(row), viewer).allowed) return null;
  return screeningStatusOf(row.moderationStatus);
}
