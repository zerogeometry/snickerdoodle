/**
 * The SERVER-TRUSTED price list — the single source of truth for what anything
 * costs. The client never sends prices; it sends product keys + quantities and
 * the server resolves the price here. Changing a price is a server-side change,
 * unit-tested, and can never be influenced by a request body.
 *
 * (Phase 1 keeps this in code. When a `products` table lands it becomes the
 * loader behind `getCatalogue()` — the engine stays pure and price-list-shaped.)
 */

/** Standard UK delivery, in pence. Added once per order when the basket is non-empty. */
export const DELIVERY_PENCE = 399;

/** The join saving, in basis points (500 = 5%). Applied to goods, never delivery. */
export const JOIN_SAVING_BPS = 500;

export interface CatalogueEntry {
  pricePence: number;
  label: string;
}

export const CATALOGUE = {
  card: { pricePence: 400, label: 'card' },
  framedPrint: { pricePence: 2200, label: 'framed print' },
  mug: { pricePence: 1400, label: 'mug' },
  kidsTee: { pricePence: 1800, label: 'kids tee' },
  cushion: { pricePence: 2800, label: 'cushion' },
  blanket: { pricePence: 4500, label: 'blanket' },
  storybook: { pricePence: 2400, label: 'storybook' },
  jigsaw: { pricePence: 2000, label: 'jigsaw' },
  toteBag: { pricePence: 1600, label: 'tote bag' },
  giftWrap: { pricePence: 300, label: 'gift wrap' },
} as const satisfies Record<string, CatalogueEntry>;

export type CatalogueKey = keyof typeof CATALOGUE;

/** Narrowing guard — is this client-supplied string something we actually sell? */
export function isCatalogueKey(key: string): key is CatalogueKey {
  return Object.prototype.hasOwnProperty.call(CATALOGUE, key);
}

/** The authoritative unit price for a known product, in pence. */
export function priceOf(key: CatalogueKey): number {
  return CATALOGUE[key].pricePence;
}
