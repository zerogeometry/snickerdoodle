import type { BasketItem } from '@/lib/store';
import type { CatalogueProduct } from '@/server/catalogue';

/**
 * Pure, framework-free helpers for the shopper-facing catalogue views (the
 * Most-Popular grid, the "your picks" pinned row, and the Full Catalogue modal's
 * search). Kept out of the components so the basket-counting + split logic is unit
 * tested in isolation — see __tests__/catalogue-view.test.ts.
 */

/** The basket line id for a variant sku — the SINGLE source of this scheme, shared by
 * the catalogue tile, quick-add, AND the customize page, so the id can never drift
 * between where a line is written and where it's read (the root of the qty-shows-0 bug). */
export const lineIdForSku = (sku: string) => `cat-${sku}`;

/**
 * The DEFAULT artwork placement per product — the ONE place tiles, quick-add, the
 * customize preview and the positioner all read, so a product's default can never
 * disagree between surfaces.
 *  - framedPrint + jigsaw + cushion + blanket: COVER (scale 1) — a frame wants no white margins,
 *    a puzzle is printed edge-to-edge, and a cushion/blanket face is the print; the image fills
 *    the board/aperture/shape/face (founder calls 2026-07). A shaped cushion (heart/round) clips
 *    the filled image to its silhouette, exactly as the frame clips to the aperture.
 *  - everything else: CONTAIN (the scale-0 sentinel) — the whole drawing visible.
 */
const COVER_DEFAULT = new Set(['framedPrint', 'jigsaw', 'cushion', 'blanket']);
export function defaultTransformFor(productKey: string): { scale: number; offsetX: number; offsetY: number; rotationDeg: number } {
  return { scale: COVER_DEFAULT.has(productKey) ? 1 : 0, offsetX: 0, offsetY: 0, rotationDeg: 0 };
}

/**
 * CUSHION back side. The double-sided-capable squares (Prodigi DUAL SKUs) can print the
 * same IMAGE on both sides ({@link CUSHION_BACK_MATCH}) or the image on the front with a
 * plain colour back — a colour token below, in line with the site's brand palette. Heart +
 * round are single-sided (a white back), so they ignore this. It never changes the SKU or
 * the price — only what we render (preview) and print (the back file).
 */
export const CUSHION_BACK_MATCH = 'both'; // squares: the same image on both sides (a DUAL upgrade)
export const CUSHION_BACK_WHITE = 'white'; // squares: plain white back = single-sided (the default)
export const CUSHION_BACK_COLOURS: { token: string; label: string; hex: string }[] = [
  // White is NOT here — it's the single-sided default; every colour below is a DUAL upgrade.
  { token: 'oat', label: 'oat', hex: '#FBF5E9' },
  { token: 'honey', label: 'honey', hex: '#F2A640' },
  { token: 'cinnamon', label: 'cinnamon', hex: '#C8623A' },
  { token: 'sky', label: 'sky', hex: '#84BBD0' },
  { token: 'berry', label: 'berry', hex: '#E8786E' },
  { token: 'meadow', label: 'meadow', hex: '#93B97C' },
  { token: 'cocoa', label: 'cocoa', hex: '#2E2723' },
];
/** The back-colour SWATCH strip shown in the UI: white FIRST (the single-sided default, a
 * different SKU + the lower price), then the DUAL upgrade colours. White is a swatch here but
 * stays single-sided ({@link cushionSidesForBack}); it is NOT in CUSHION_BACK_COLOURS because
 * that list is the DUAL colour-back palette the print renderer fills from. 'image both sides'
 * is a separate control, not a swatch. */
export const CUSHION_BACK_SWATCHES: { token: string; label: string; hex: string }[] = [
  { token: CUSHION_BACK_WHITE, label: 'white', hex: '#FFFFFF' },
  ...CUSHION_BACK_COLOURS,
];
/** The hex for a back-colour token, or null (unknown token / the 'both' image option). */
export const cushionBackHex = (token: string | null | undefined): string | null =>
  CUSHION_BACK_COLOURS.find((c) => c.token === token)?.hex ?? null;
/** Coerce an untrusted back value to a KNOWN token (both | white | a palette colour) or null —
 * guards what we persist at order time AND what the fulfilment renderer will act on, so a forged
 * or stale value can never drive the print. The SINGLE source of "what's a valid back". */
export const normalizeCushionBack = (back: string | null | undefined): string | null => {
  if (!back) return null;
  if (back === CUSHION_BACK_MATCH || back === CUSHION_BACK_WHITE) return back;
  return CUSHION_BACK_COLOURS.some((c) => c.token === back) ? back : null;
};
/** Which SKU a square's back choice needs: white = single-sided (the default); image-both-sides
 * or a colour = the double-sided DUAL SKU (the paid upgrade). */
export const cushionSidesForBack = (back: string | null | undefined): 'single' | 'double' =>
  !back || back === CUSHION_BACK_WHITE ? 'single' : 'double';
/** Only the square cushions (the DUAL SKUs) offer a back choice; heart + round are single-sided. */
export const cushionSupportsBack = (size: string | null | undefined): boolean => !!size && /square/i.test(size);
/** The faux-suede heart + round cushions ship with a fixed STONE back (Prodigi "Single Sided
 * Stone"). Used to preview their reverse — a warm taupe sampled from Prodigi's rear shot. */
export const CUSHION_SUEDE_BACK_HEX = '#bba585';

/** A shopper-facing size → its physical size in cm, read from the size's variant print mm
 * (the same dimensions Prodigi lists). `min × max` so both orientations read the same nominal
 * size. Returns undefined when the size has no print mm. Used as a sub-label on word-sized size
 * buttons (e.g. the blanket's medium/large) so the shopper sees exactly how big it is. */
export function sizeDimsCm(p: CatalogueProduct, size: string): string | undefined {
  const v = p.variants.find((x) => x.attributes.size === size && x.printWmm != null && x.printHmm != null);
  if (v?.printWmm == null || v.printHmm == null) return undefined;
  const lo = Math.round(Math.min(v.printWmm, v.printHmm) / 10);
  const hi = Math.round(Math.max(v.printWmm, v.printHmm) / 10);
  return `${lo} × ${hi} cm`;
}

/** Every possible basket line id for a product (one per variant). */
export const productLineIds = (p: CatalogueProduct): string[] => p.variants.map((v) => lineIdForSku(v.sku));

/**
 * Total quantity of a product in the basket, summed across ALL its variants — so a
 * customized non-default size/colour still counts on the product's tile. The bug was
 * that the tile only read the DEFAULT variant's line, so a customized line (a different
 * id) was counted by the bag + subtotal but showed 0 on the tile.
 */
export function productQtyInBasket(items: BasketItem[], p: CatalogueProduct): number {
  const ids = new Set(productLineIds(p));
  return items.reduce((n, i) => (ids.has(i.id) ? n + i.qty : n), 0);
}

export const isPopular = (p: CatalogueProduct): boolean => p.popularRank != null;

/**
 * Split the catalogue for the start-creating front-of-shop: the curated Most-Popular
 * grid (sorted by rank), plus "your picks" — products the shopper added (basket qty > 0)
 * that AREN'T already in Most Popular, pinned above it on return from the Full Catalogue.
 * ADDONs are excluded from both (they're upsells, not browse tiles).
 */
export function splitCatalogue(
  products: CatalogueProduct[],
  items: BasketItem[],
): { picks: CatalogueProduct[]; popular: CatalogueProduct[] } {
  const sellable = products.filter((p) => p.category !== 'ADDON');
  const popular = sellable.filter(isPopular).sort((a, b) => a.popularRank! - b.popularRank!);
  const popularKeys = new Set(popular.map((p) => p.key));
  const picks = sellable.filter((p) => !popularKeys.has(p.key) && productQtyInBasket(items, p) > 0);
  return { picks, popular };
}

// Friendly filter groups (the product category enum → a shopper-facing label).
const GROUP: Record<string, string> = {
  CARD: 'cards & prints', PRINT: 'cards & prints', MUG: 'home', CUSHION: 'home', BLANKET: 'home',
  APPAREL: 'wear', BOOK: 'books', PUZZLE: 'gifts', BAG: 'gifts', FESTIVE: 'festive',
};
export const groupOf = (category: string): string => GROUP[category] ?? 'gifts';

/** Case-insensitive AND-search over a product's shopper-visible text. */
export function matchesQuery(p: CatalogueProduct, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [p.label, p.blurb ?? '', p.category, groupOf(p.category), ...p.sizes, ...p.colours].join(' ').toLowerCase();
  return q.split(/\s+/).every((term) => hay.includes(term));
}

/** The full browsable catalogue (all sellable products), filtered by the search query. */
export function filterCatalogue(products: CatalogueProduct[], query: string): CatalogueProduct[] {
  return products.filter((p) => p.category !== 'ADDON' && matchesQuery(p, query));
}
