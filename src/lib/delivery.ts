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

/**
 * Products that go EXPRESS so they're tracked — Prodigi takes ONE shipping method per order, so an order with any
 * of these goes Express as a whole:
 *  - phone cases (founder, 21 Oct: "definitely tracked"): Standard is often untracked Royal Mail 24 (uk8);
 *  - the baby + toddler tees and both bodysuits (founder, 5 Nov: "must go tracked"): uk2's Standard is Royal Mail
 *    1st Class, untracked; its only tracked service is Express, DPD Classic by Road (£10.75 for one, and the same
 *    for two or more in one parcel; there's no Overnight). Sandbox quotes, 5 Nov 2026.
 * What it costs the OTHER items in such an order (their Express post over their Standard — sandbox, 5 Nov): mug,
 * ornament, jigsaw, wrapping paper +£1.05 · watch strap +£1.95 · cushion +£2.15 · framed print +£2.90 · kids or
 * adult tee +£6.45 · greetings card +£7.65 · socks +£8.05.
 */
export const EXPRESS_FOR_TRACKING_KEYS: readonly string[] = ['phoneCase', 'babyTee', 'toddlerTee', 'babyBodysuit', 'babyBodysuitShort'];
/** Products Prodigi has NO Express service for — the dated calendar (lab uk15). An order with one can't go Express. */
export const NO_EXPRESS_KEYS: readonly string[] = ['calendar'];

const isOf = (keys: readonly string[], key: string) => keys.some((k) => key === k || key.startsWith(`${k}-`));

/**
 * The ONE shipping method an order goes by: Express when it carries anything that needs it to be tracked — unless it
 * also carries something with no Express at all (the calendar), when Prodigi would refuse the whole order: then
 * Standard, and those items go by their untracked Standard post in that order (the basket says so: {@link deliveryLine}).
 */
export function shippingMethodFor(keys: readonly string[]): 'Standard' | 'Express' {
  return keys.some((k) => isOf(EXPRESS_FOR_TRACKING_KEYS, k)) && !keys.some((k) => isOf(NO_EXPRESS_KEYS, k)) ? 'Express' : 'Standard';
}

/** A product key OR a variant sku (`wrappingPaper-2mroll`). */
export const shipsTracked = (key: string): boolean => !isOf(UNTRACKED_STANDARD_KEYS, key);

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
  uk6std: { handling: [1, 3], transit: [2, 3] }, // Royal Mail Standard Tracked (the watch strap)
  uk2x: { handling: [1, 3], transit: [1, 2] }, // Express, DPD Classic by Road (the baby + toddler clothes)
  other: { handling: [1, 3], transit: [2, 5] }, // unmapped: the widest range, to be safe
};

/** Handling + transit working days for a product (by its route). */
export const deliveryDays = (productKey: string) => DELIVERY_DAYS[routeOf(productKey)];

/** The delivery line for one product, or for a basket of them (tracked only if EVERY line is). */
export function deliveryLine(keys: string | readonly string[]): string {
  const list = typeof keys === 'string' ? [keys] : keys;
  // an Express-for-tracking product in an order that can't go Express goes by its untracked Standard post
  const expressDenied = list.some((k) => isOf(EXPRESS_FOR_TRACKING_KEYS, k)) && shippingMethodFor(list) === 'Standard';
  return list.every(shipsTracked) && !expressDenied ? 'free tracked delivery' : 'free delivery';
}
