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
