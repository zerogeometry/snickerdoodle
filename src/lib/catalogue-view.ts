import type { BasketItem } from '@/lib/store';
import { caseDefaultTransform } from '@/lib/phone-cases';
import { isColouredGround } from '@/lib/patterns';
import type { CatalogueProduct, CatalogueVariant } from '@/server/catalogue';

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
 * A basket line's id: one line per variant — and, for a repeat-pattern product, per BASE COLOUR, so
 * red socks and navy socks are two lines rather than "2 × red". White (the default) keeps the plain
 * variant id, so existing lines and quick-add are unchanged.
 */
export const lineIdFor = (sku: string, ground?: string | null) =>
  isColouredGround(ground) ? `${lineIdForSku(sku)}~${ground}` : lineIdForSku(sku);

/** Is this basket line id one of this variant's lines (any base colour)? */
export const isLineOfSku = (id: string, sku: string) => id === lineIdForSku(sku) || id.startsWith(`${lineIdForSku(sku)}~`);

/**
 * The DEFAULT artwork placement per product — the ONE place tiles, quick-add, the
 * customize preview and the positioner all read, so a product's default can never
 * disagree between surfaces.
 *  - framedPrint + jigsaw + cushion + blanket: COVER (scale 1) — a frame wants no white margins,
 *    a puzzle is printed edge-to-edge, and a cushion/blanket face is the print; the image fills
 *    the board/aperture/shape/face (founder calls 2026-07). A shaped cushion (heart/round) clips
 *    the filled image to its silhouette, exactly as the frame clips to the aperture.
 *  - mug: COVER (scale 1) too — the drawing fills the FULL WIDTH of the wide wrap print surface
 *    (209×98mm ≈ 2.14:1) by default, rather than contain-letterboxing to its own height (founder
 *    2026-07-10). Unlike a frame the mug is NOT cover-locked in the editor: the shopper can still
 *    zoom DOWN through contain to reveal the whole drawing's height (see Positioner `lockToCover`).
 *  - everything else: CONTAIN (the scale-0 sentinel) — the whole drawing visible.
 */
const COVER_DEFAULT = new Set(['framedPrint', 'jigsaw', 'cushion', 'blanket', 'card', 'cardPack', 'mug']);
export function defaultTransformFor(productKey: string): { scale: number; offsetX: number; offsetY: number; rotationDeg: number } {
  return { scale: COVER_DEFAULT.has(productKey) ? 1 : 0, offsetX: 0, offsetY: 0, rotationDeg: 0 };
}

/**
 * The default placement for a product AS SHOWN — like {@link defaultTransformFor}, but a phone case
 * starts with the whole drawing clear of that phone's camera (needs the drawing's aspect, w/h).
 * The range tile and its enlarge view use this so they match the customize page.
 */
export function defaultPlacementFor(
  productKey: string,
  variantAttrs: Record<string, string> | undefined,
  aspect: number | undefined | null,
): { scale: number; offsetX: number; offsetY: number; rotationDeg: number } {
  if (productKey === 'phoneCase' && aspect && aspect > 0) {
    const t = caseDefaultTransform(variantAttrs?.size, variantAttrs?.grade, { width: Math.round(aspect * 1000), height: 1000 });
    if (t) return t;
  }
  return defaultTransformFor(productKey);
}

/**
 * The orientation an uploaded image suggests, from its aspect (w/h). Wide → landscape, tall/square
 * → portrait. Returns null when the aspect is unknown, so a caller falls back to the product's
 * default orientation rather than guessing. Mirrors the customize page's auto-orient so the
 * catalogue TILE shows the same orientation the shopper gets when they open the product.
 */
export function orientationForAspect(aspect: number | undefined | null): 'landscape' | 'portrait' | null {
  if (!aspect || !Number.isFinite(aspect) || aspect <= 0) return null;
  return aspect > 1 ? 'landscape' : 'portrait';
}

/**
 * The variant a catalogue surface should DISPLAY and ADD for a product — the ONE resolver shared by
 * the tile preview, the quick-add "+", and the enlarge modal, so what the shopper sees is exactly
 * what lands in the basket (never a landscape tile that quietly adds the portrait default).
 * Precedence: an explicit shopper selection wins; else, for a product with an orientation axis, the
 * variant whose orientation matches the uploaded drawing's aspect (keeping the default's size +
 * colour); else the product's plain default.
 */
export function resolveDisplayVariant(
  p: CatalogueProduct,
  opts?: { aspect?: number | null; selection?: { size?: string; colour?: string; orientation?: string } | null },
): CatalogueVariant {
  const def = p.variants.find((v) => v.isDefault) ?? p.variants[0]!;
  const sel = opts?.selection;
  if (sel) {
    const chosen = p.variants.find(
      (v) =>
        (p.sizes.length === 0 || v.attributes.size === sel.size) &&
        (p.colours.length === 0 || v.attributes.colour === sel.colour) &&
        (p.orientations.length === 0 || (v.attributes.orientation ?? 'portrait') === sel.orientation),
    );
    if (chosen) return chosen;
  }
  if (p.orientations.length > 0) {
    const want = orientationForAspect(opts?.aspect);
    if (want) {
      const oriented = p.variants.find(
        (v) =>
          (p.sizes.length === 0 || v.attributes.size === def.attributes.size) &&
          (p.colours.length === 0 || v.attributes.colour === def.attributes.colour) &&
          (v.attributes.orientation ?? 'portrait') === want,
      );
      if (oriented) return oriented;
    }
  }
  return def;
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

/** The MUG two-tone accent hexes — SAMPLED from the real Prodigi photos so the colour swatches
 * match the actual product (the generic swatch map is for frames/garments and doesn't carry these).
 * Keyed per product so the mug's 'blue'/'pink' don't override a garment's caribbean/cotton shades. */
export const MUG_SWATCH: Record<string, string> = {
  blue: '#3354b9', black: '#1b1b1b', green: '#85b932', orange: '#d6701f',
  pink: '#d79792', red: '#b44238', yellow: '#dec949',
};
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
  // any base colour of any variant (red socks + navy socks both count on the socks tile)
  return items.reduce((n, i) => (p.variants.some((v) => isLineOfSku(i.id, v.sku)) ? n + i.qty : n), 0);
}

export const isPopular = (p: CatalogueProduct): boolean => p.popularRank != null;

/**
 * Products whose photo is a flat sheet lying flat. A run of them reads as "a bunch of the same flat
 * product" (founder, 2026-10-22), so the grids space them out.
 */
export const FLAT_PRODUCT_KEYS: ReadonlySet<string> = new Set(['jigsaw', 'blanket', 'wrappingPaper', 'teaTowel', 'heightChart', 'calendar']);
/**
 * Minimum gap (in places) between two flat products. 3 means never side by side at any width, and
 * never one above the other on the 2-column phone grid.
 */
export const FLAT_MIN_GAP = 3;

/**
 * Keep the given order, but hold a flat product back until it's at least `gap` places after the
 * previous flat one, pulling the next non-flat product forward instead. Stable otherwise. If only
 * flat products are left, they're placed anyway rather than dropped.
 */
export function spaceOutFlat<T extends { key: string }>(list: readonly T[], gap: number = FLAT_MIN_GAP): T[] {
  const pending = [...list];
  const out: T[] = [];
  let lastFlat = -Infinity;
  while (pending.length) {
    const ready = (p: T) => !FLAT_PRODUCT_KEYS.has(p.key) || out.length - lastFlat >= gap;
    const i = Math.max(0, pending.findIndex(ready));
    const [next] = pending.splice(i, 1);
    if (FLAT_PRODUCT_KEYS.has(next!.key)) lastFlat = out.length;
    out.push(next!);
  }
  return out;
}

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
  const popular = spaceOutFlat(sellable.filter(isPopular).sort((a, b) => a.popularRank! - b.popularRank!));
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
  return spaceOutFlat(products.filter((p) => p.category !== 'ADDON' && matchesQuery(p, query)));
}
