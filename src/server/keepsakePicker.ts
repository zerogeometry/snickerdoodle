import { canViewAsset, type AssetRef, type ViewerContext } from '@/authz';

/**
 * The keepsake PICKER (the card-pack builder's "pick a drawing" sheet): the drawings in the
 * signed-in account's keepsake box, newest first — the same set the Keepsake Home shows, through
 * the same authz gate, with a short-lived signed URL minted only AFTER the gate passes.
 *
 * `printable` mirrors the order-time content-safety gate (D8): only a CLEAR keepsake can reach a
 * print order. Anything else is listed but not pickable, with neutral wording in the UI — a flag is
 * never disclosed as a flag. BLOCKED content is never listed and never gets a URL (D8 runbook).
 *
 * Pure (no I/O) so the gate is unit-testable; the loader is keepsakePickerAction.
 */
export interface PickerKeepsake {
  id: string;
  imageUrl: string | null;
  createdAtISO: string;
  /** The child it's filed under (first name only), or null. */
  childFirstName: string | null;
  printable: boolean;
  /** the table-trimmed copy, when the photo was trimmed at upload — what's shown and printed */
  sourceObjectId?: string;
}

export type PickerRow = {
  asset: AssetRef & { keptInHome: boolean; moderationStatus: 'PENDING' | 'CLEAR' | 'FLAGGED' | 'BLOCKED'; createdAt: Date; childSubjectId: string | null };
  key: string | null;
};

/** Pure: which rows the viewer may see in the picker, and which of those can be printed. */
export function pickableKeepsakes(rows: PickerRow[], viewer: ViewerContext): Array<{ row: PickerRow; printable: boolean }> {
  return rows
    .filter((r) => r.asset.keptInHome && r.asset.moderationStatus !== 'BLOCKED')
    .filter((r) => canViewAsset(refOf(r.asset), viewer).allowed)
    .map((row) => ({ row, printable: row.asset.moderationStatus === 'CLEAR' }));
}

const refOf = (a: PickerRow['asset']): AssetRef => ({
  id: a.id,
  familyId: a.familyId,
  uploaderAccountId: a.uploaderAccountId,
  controllerAccountId: a.controllerAccountId,
  visibility: a.visibility,
});
