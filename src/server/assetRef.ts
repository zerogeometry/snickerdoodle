import type { AssetRef } from '@/authz';
import type { assets } from '@/db/schema';
import { isHeldForReview } from '@/lib/reports';

type AssetRow = typeof assets.$inferSelect;

/** The columns src/authz needs to judge an asset — select at least these. */
export type AssetRefFields = Pick<AssetRow, 'id' | 'familyId' | 'uploaderAccountId' | 'controllerAccountId' | 'visibility' | 'moderationStatus' | 'moderationDetail'> &
  Partial<Pick<AssetRow, 'ephemeralClaimId'>>;

/**
 * The ONE way to turn an asset row into what src/authz judges. Every canViewAsset /
 * assertCanViewAsset / canAct caller builds its ref here, so a field the policy grows (like
 * `heldForReview`) is resolved the same way everywhere. Pure — no I/O.
 */
export function assetRefOf(row: AssetRefFields): AssetRef {
  return {
    id: row.id,
    familyId: row.familyId,
    uploaderAccountId: row.uploaderAccountId,
    controllerAccountId: row.controllerAccountId,
    visibility: row.visibility,
    ephemeralClaimId: row.ephemeralClaimId ?? null,
    heldForReview: isHeldForReview(row),
  };
}
