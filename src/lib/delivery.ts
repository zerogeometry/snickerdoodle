import { routeOf, type Route } from './season';

/**
 * What we can honestly say about delivery. Every price has free delivery baked in, but not every
 * product's standard post is TRACKED: Prodigi sends cards (and card packs) by Guernsey Post and
 * wrapping paper + playing cards by Royal Mail 24/24 — all untracked (sandbox quotes, 2026-10-21).
 * Saying "tracked" for those would be untrue. FOUNDER DECISION PENDING: accept untracked for these,
 * or pay for tracked (+£1.05 on wrapping paper) — if tracked is bought, take the key out of here.
 */
// D24 (2026-10-25): + the plastic ball (uk5, Royal Mail RM24) and the AWDis christmas jumper (Prodigi may
// route it to uk2, Royal Mail 1st Class) — both untracked on Standard.
export const UNTRACKED_STANDARD_KEYS: readonly string[] = ['card', 'cardPack', 'wrappingPaper', 'playingCards', 'christmasBauble', 'christmasJumper'];

/** A product key OR a variant sku (`wrappingPaper-2mroll`). */
export const shipsTracked = (key: string): boolean => !UNTRACKED_STANDARD_KEYS.some((k) => key === k || key.startsWith(`${k}-`));

/**
 * How long an order takes, in UK WORKING days, per lab + carrier route (src/lib/season.ts): HANDLING
 * is making it (every piece is printed to order — season.ts allows ~3 working days), TRANSIT is the
 * carrier's own service level. For search engines + Merchant Center (`shippingDetails`, the feed's
 * handling/transit times) — honest ranges, not promises. ESTIMATES from the carriers' published
 * service levels until Prodigi confirms per-lab production times; edit here, nowhere else.
 */
export const DELIVERY_DAYS: Record<Route, { handling: [number, number]; transit: [number, number] }> = {
  uk9: { handling: [1, 3], transit: [2, 3] }, // Royal Mail Tracked 48
  uk3: { handling: [1, 3], transit: [2, 4] }, // FedEx Economy
  uk5: { handling: [1, 3], transit: [1, 2] }, // Royal Mail 24 (untracked)
  uk7: { handling: [1, 3], transit: [2, 5] }, // Guernsey Post (cards)
  uk15: { handling: [1, 3], transit: [2, 5] }, // the calendar lab ("Mixed" carrier)
  gb2: { handling: [1, 3], transit: [1, 2] }, // Royal Mail 24 (untracked): wrapping paper
  gb3: { handling: [1, 3], transit: [2, 4] }, // Evri
  uk2: { handling: [1, 3], transit: [1, 2] }, // Royal Mail 1st Class
  uk6: { handling: [1, 3], transit: [1, 2] }, // Express (phone cases)
  other: { handling: [1, 3], transit: [2, 5] }, // unmapped: the widest range, to be safe
};

/** Handling + transit working days for a product (by its route). */
export const deliveryDays = (productKey: string) => DELIVERY_DAYS[routeOf(productKey)];

/** The delivery line for one product, or for a basket of them (tracked only if EVERY line is). */
export function deliveryLine(keys: string | readonly string[]): string {
  const list = typeof keys === 'string' ? [keys] : keys;
  return list.every(shipsTracked) ? 'free tracked delivery' : 'free delivery';
}
