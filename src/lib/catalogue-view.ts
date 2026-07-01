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
