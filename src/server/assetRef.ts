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
 * recorded in its moderation detail; a reviewer's "clear" resolves it. Screening alone (a FLAGGED
 * upload with no report — every upload on the test site) does not count: that's "not printable yet",
 * not "hidden from the family".
 */
export function isHeldForReport(row: { moderationStatus: string; moderationDetail?: unknown }): boolean {
  if (row.moderationStatus !== 'FLAGGED') return false;
  const reports = (row.moderationDetail as { reports?: unknown } | null | undefined)?.reports;
  return Array.isArray(reports) && reports.length > 0;
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
    heldForReview: isHeldForReport(row),
  };
}
