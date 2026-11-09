import type { AssetRef } from '@/authz';

/** The fields of an asset row the authz ref is built from. */
export type AssetRefRow = {
  id: string;
  familyId: string | null;
  uploaderAccountId: string | null;
  controllerAccountId: string | null;
  visibility: AssetRef['visibility'];
  ephemeralClaimId?: string | null;
  moderationStatus: string;
  moderationDetail?: unknown;
};

/**
 * Is an OPEN viewer report holding this keepsake for review (D8)? A report holds it (FLAGGED) and is
 * recorded in its moderation detail; a reviewer's "clear" resolves it. (Used for the "reported" badge
 * and the report flow; who may SEE a held keepsake is {@link isHiddenUntilCleared}.)
 */
export function isHeldForReport(row: { moderationStatus: string; moderationDetail?: unknown }): boolean {
  if (row.moderationStatus !== 'FLAGGED') return false;
  const reports = (row.moderationDetail as { reports?: unknown } | null | undefined)?.reports;
  return Array.isArray(reports) && reports.length > 0;
}

/**
 * Is this keepsake hidden from everyone but its uploader/controller until it's cleared (founder,
 * 9 Nov 2026)? Yes while the safety checks haven't cleared it — held by the automatic screening
 * (FLAGGED), held by a report (also FLAGGED), or not screened yet (PENDING). A picture the checks
 * held could be nudity, so the family circle must not see it until a reviewer clears it. (BLOCKED is
 * never shown to anyone — getViewableAssetOrThrow and every list filter it out.)
 */
export function isHiddenUntilCleared(row: { moderationStatus: string }): boolean {
  return row.moderationStatus === 'FLAGGED' || row.moderationStatus === 'PENDING';
}

/** The ONE way an asset row becomes an authz ref — so every caller decides `heldForReview`. */
export function assetRefOf(row: AssetRefRow): AssetRef {
  return {
    id: row.id,
    familyId: row.familyId,
    uploaderAccountId: row.uploaderAccountId,
    controllerAccountId: row.controllerAccountId,
    visibility: row.visibility,
    ephemeralClaimId: row.ephemeralClaimId ?? null,
    heldForReview: isHiddenUntilCleared(row),
  };
}
