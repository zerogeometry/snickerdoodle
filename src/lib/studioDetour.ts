import type { Upload } from './store';

/**
 * A keepsake opened in the Studio from a card-pack / calendar picker is edited as a COPY made for it
 * (src/ui/components/usePickerEdits.ts). Back in the picker: was the copy SAVED (keep it, choose it)
 * or left unsaved (tidy it away, choose the keepsake it came from)?
 *
 * The Studio notes a save on the detour (`saved`). Without that note, the drawing in progress tells:
 * it's the copy, now showing an edit it didn't open with. A copy that OPENED on its saved edit (a
 * keepsake already cut out — founder, 25 Nov) shows that same edit unsaved, so it isn't counted as
 * saved by mistake (`openedAs`: the edit it opened on).
 */
export type StudioDetourNote = { assetId: string; copyOf?: string | null; openedAs?: string | null; saved?: boolean };

export function savedInStudio(
  current: Pick<NonNullable<Upload>, 'assetId' | 'cutout'> | null | undefined,
  detour: StudioDetourNote,
): boolean {
  if (!current || current.assetId !== detour.assetId) return false;
  if (detour.saved === true) return true;
  const c = current.cutout;
  return !!c && !c.trim && c.sourceObjectId !== (detour.openedAs ?? undefined);
}
