/**
 * What we can honestly say about delivery. Every price has free delivery baked in, but not every
 * product's standard post is TRACKED: Prodigi sends cards (and card packs) by Guernsey Post and
 * wrapping paper + playing cards by Royal Mail 24/24 — all untracked (sandbox quotes, 2026-10-21).
 * Saying "tracked" for those would be untrue. FOUNDER DECISION PENDING: accept untracked for these,
 * or pay for tracked (+£1.05 on wrapping paper) — if tracked is bought, take the key out of here.
 */
export const UNTRACKED_STANDARD_KEYS: readonly string[] = ['card', 'cardPack', 'wrappingPaper', 'playingCards'];

/** A product key OR a variant sku (`wrappingPaper-2mroll`). */
export const shipsTracked = (key: string): boolean => !UNTRACKED_STANDARD_KEYS.some((k) => key === k || key.startsWith(`${k}-`));

/** The delivery line for one product, or for a basket of them (tracked only if EVERY line is). */
export function deliveryLine(keys: string | readonly string[]): string {
  const list = typeof keys === 'string' ? [keys] : keys;
  return list.every(shipsTracked) ? 'free tracked delivery' : 'free delivery';
}
