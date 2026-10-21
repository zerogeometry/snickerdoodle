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

/**
 * The family-set saving: 5% off GARMENT lines when the order carries 3 or more
 * garments ("dress the whole family" — one drawing, matching tees + bodysuit).
 * Self-funding: 3+ garments leave as ONE tracked consignment, so the baked-in
 * per-item shipping over-recovers by roughly this discount. Server-resolved from
 * line keys + quantities only — no client flag exists.
 */
export const FAMILY_SET_SAVING_BPS = 500;
export const FAMILY_SET_MIN_QTY = 3;
/** The garment product keys. Variant skus are `${key}-size-colour`, the default IS the key. */
export const FAMILY_SET_PRODUCT_KEYS = ['kidsTee', 'adultTee', 'babyBodysuit'] as const;

/** Does this priced-line key (product key OR variant sku) belong to a family-set garment? */
export function isFamilySetKey(key: string): boolean {
  return FAMILY_SET_PRODUCT_KEYS.some((k) => key === k || key.startsWith(`${k}-`));
}

export interface CatalogueEntry {
  pricePence: number;
  label: string;
}

// The fallback / seed price list — the "from" (default-variant) price per product. The runtime
// getCatalogue() loads the full per-variant list from the DB; this constant is the pre-seed
// fallback AND the sellable-key allowlist (isCatalogueKey). Prices are VAT-inc, free delivery.
export const CATALOGUE = {
  framedPrint: { pricePence: 6500, label: 'framed print' },
  mug: { pricePence: 1800, label: 'mug' },
  cushion: { pricePence: 2000, label: 'cushion' },
  storybook: { pricePence: 2595, label: 'storybook' },
  kidsTee: { pricePence: 2495, label: 'kids tee' },
  jigsaw: { pricePence: 2500, label: 'jigsaw' },
  blanket: { pricePence: 6000, label: 'fleece blanket' },
  babyBodysuit: { pricePence: 2195, label: 'baby bodysuit' },
  card: { pricePence: 500, label: 'greetings card' },
  calendar: { pricePence: 1895, label: 'calendar' },
  adultTee: { pricePence: 3195, label: 'adult tee' },
  apron: { pricePence: 2495, label: 'apron' },
  bauble: { pricePence: 2095, label: 'ceramic bauble' },
  sack: { pricePence: 3495, label: 'christmas sack' },
  phoneCase: { pricePence: 2499, label: 'phone case' }, // the default: snap (tough £29.99 — DB per variant)
  giftWrap: { pricePence: 300, label: 'gift wrap' },
} as const satisfies Record<string, CatalogueEntry>;

export type CatalogueKey = keyof typeof CATALOGUE;

/**
 * The shape the pricing engine prices against: productKey → price + label. The
 * static {@link CATALOGUE} is one (the default / seed / fallback); the server can
 * pass a DB-loaded one instead. Either way the CLIENT never supplies prices.
 */
/** `unitCostPence` (server-only, landed ex-VAT cost) feeds the promo margin guard; absent ⇒ never discounted. */
export type PricedCatalogue = Record<string, { pricePence: number; label: string; unitCostPence?: number | null }>;

/** Narrowing guard — is this client-supplied string something we actually sell? */
export function isCatalogueKey(key: string): key is CatalogueKey {
  return Object.prototype.hasOwnProperty.call(CATALOGUE, key);
}

/** The authoritative unit price for a known product, in pence. */
export function priceOf(key: CatalogueKey): number {
  return CATALOGUE[key].pricePence;
}
