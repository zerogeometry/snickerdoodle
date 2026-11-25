import type { Upload } from './store';

/**
 * Which asset a Studio edit lands on (sweep 01-B1). The drawing in progress (the store) is the
 * truth, not an id fixed when the Studio opened: a keepsake picked from the box becomes its COPY
 * after the Studio mounts, and an edit must land on that copy. While the drawing in progress is
 * still a picked keepsake (its copy not made — or the copy failed), there is NO target: a picked
 * keepsake is never edited in place. `undefined` = nothing stored yet (upload it first).
 */
export function studioEditTarget(
  current: { assetId?: string; fromKeepsake?: boolean } | null | undefined,
  openedWith: string | null,
): string | null | undefined {
  if (current?.fromKeepsake) return null;
  return current?.assetId ?? openedWith ?? undefined;
}

/**
 * Does the Studio open with the drawing's stored cut-out on it? Only while the drawing in progress is
 * USING an edit (`cutout` that isn't just the table trim): a parent can put the background back on the
 * create page — then the Studio opens on the untouched drawing. A keepsake opened again carries its
 * saved edit as its `cutout` (src/lib/keepsakeFork.ts keepsakePicture), so a background lifted and
 * saved stays lifted when it's reopened (founder, 25 Nov: the card pack forgot it — and the next save
 * threw the cut-out away).
 */
export function studioOpensCutOut(current: Pick<NonNullable<Upload>, 'cutout'> | null | undefined, hasStoredCutout: boolean): boolean {
  return hasStoredCutout && !!current?.cutout && !current.cutout.trim;
}
