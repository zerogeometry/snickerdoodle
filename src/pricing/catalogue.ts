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
  cushion: { pricePence: 2200, label: 'cushion' },
  storybook: { pricePence: 2600, label: 'storybook' },
  kidsTee: { pricePence: 2500, label: 'kids tee' },
  jigsaw: { pricePence: 2600, label: 'jigsaw' },
  blanket: { pricePence: 6000, label: 'fleece blanket' },
  babyBodysuit: { pricePence: 2200, label: 'baby bodysuit' },
  card: { pricePence: 550, label: 'greetings card' },
  calendar: { pricePence: 2200, label: 'calendar' }, // A5 (A4 £24 — DB per variant)
  adultTee: { pricePence: 3200, label: 'adult tee' },
  apron: { pricePence: 2500, label: 'apron' },
  ceramicOrnament: { pricePence: 2100, label: 'ceramic christmas ornament' },
  christmasBauble: { pricePence: 1900, label: 'christmas bauble' },
  sack: { pricePence: 3500, label: 'christmas sack' },
  phoneCase: { pricePence: 2500, label: 'phone case' }, // the default: snap (tough £30 — DB per variant)
  // Range expansion (D21, 2026-10-21) — seeded hidden until samples + mockups are in.
  socks: { pricePence: 2000, label: 'socks' },
  heightChart: { pricePence: 3100, label: 'height chart' },
  kidsHoodie: { pricePence: 4300, label: 'kids hoodie' },
  adultHoodie: { pricePence: 4200, label: 'adult hoodie' },
  wrappingPaper: { pricePence: 2300, label: 'wrapping paper' }, // the default: the 2 m roll (rolls only)
  teaTowel: { pricePence: 2700, label: 'tea towel' },
  petBandana: { pricePence: 1800, label: 'pet bandana' },
  // Christmas jumpers (D24, 2026-10-25) — seeded hidden until a sweatshirt packshot is in.
  kidsJumper: { pricePence: 3800, label: 'kids jumper' },
  christmasJumper: { pricePence: 3200, label: 'christmas jumper' },
  playingCards: { pricePence: 2400, label: 'playing cards' },
  cardPack: { pricePence: 1200, label: 'card pack' }, // pack of 5 (pack of 10 £21 — DB per variant)
  // The Christmas table (founder, 27 Oct): cork placemats ×4 + coasters ×6, on their own or in the bundle.
  placemat: { pricePence: 6000, label: 'placemats' }, // a pack of 4 (founder, 27 Oct: £60)
  coaster: { pricePence: 3200, label: 'coasters' }, // a pack of 6
  // The CHRISTMAS FAMILY BUNDLE's BASE price — its add-ons are priced from the counts (src/lib/christmas-bundle.ts).
  christmasBundle: { pricePence: 9000, label: 'christmas family bundle' },
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
