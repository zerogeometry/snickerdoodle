/**
 * The SERVER-TRUSTED price list — the single source of truth for what anything
 * costs. The client never sends prices; it sends product keys + quantities and
 * the server resolves the price here. Changing a price is a server-side change,
 * unit-tested, and can never be influenced by a request body.
 *
 * (Phase 1 keeps this in code. When a `products` table lands it becomes the
 * loader behind `getCatalogue()` — the engine stays pure and price-list-shaped.)
 */

/** Delivery, in pence. FREE — the tracked shipping cost is baked into each product's retail
 * price (founder-approved 2026-07-01), so there is no separate delivery line. */
export const DELIVERY_PENCE = 0;

/** The join saving, in basis points (500 = 5%). Applied to goods, never delivery. */
export const JOIN_SAVING_BPS = 500;

export interface CatalogueEntry {
  pricePence: number;
  label: string;
}

// The fallback / seed price list — the "from" (default-variant) price per product. The runtime
// getCatalogue() loads the full per-variant list from the DB; this constant is the pre-seed
// fallback AND the sellable-key allowlist (isCatalogueKey). Prices are VAT-inc, free delivery.
export const CATALOGUE = {
  framedPrint: { pricePence: 6695, label: 'framed print' },
  mug: { pricePence: 1595, label: 'mug' },
  cushion: { pricePence: 2295, label: 'cushion' },
  storybook: { pricePence: 2350, label: 'storybook' },
  kidsTee: { pricePence: 2095, label: 'kids tee' },
  jigsaw: { pricePence: 2795, label: 'jigsaw' },
  blanket: { pricePence: 5795, label: 'fleece blanket' },
  babyBodysuit: { pricePence: 2195, label: 'baby bodysuit' },
  card: { pricePence: 495, label: 'greetings card' },
  calendar: { pricePence: 1895, label: 'calendar' },
  adultTee: { pricePence: 2895, label: 'adult tee' },
  apron: { pricePence: 2495, label: 'apron' },
  bauble: { pricePence: 2095, label: 'ceramic bauble' },
  sack: { pricePence: 3495, label: 'christmas sack' },
  giftWrap: { pricePence: 300, label: 'gift wrap' },
} as const satisfies Record<string, CatalogueEntry>;

export type CatalogueKey = keyof typeof CATALOGUE;

/**
 * The shape the pricing engine prices against: productKey → price + label. The
 * static {@link CATALOGUE} is one (the default / seed / fallback); the server can
 * pass a DB-loaded one instead. Either way the CLIENT never supplies prices.
 */
export type PricedCatalogue = Record<string, { pricePence: number; label: string }>;

/** Narrowing guard — is this client-supplied string something we actually sell? */
export function isCatalogueKey(key: string): key is CatalogueKey {
  return Object.prototype.hasOwnProperty.call(CATALOGUE, key);
}

/** The authoritative unit price for a known product, in pence. */
export function priceOf(key: CatalogueKey): number {
  return CATALOGUE[key].pricePence;
}
