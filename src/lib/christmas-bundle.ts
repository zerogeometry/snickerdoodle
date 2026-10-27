/**
 * The CHRISTMAS FAMILY BUNDLE (founder, 27 Oct 2026 — go-to-market jobs C25 + C26): a Christmas
 * table set plus the family's ornaments and sacks, every piece from Prodigi's uk9 lab so the lot
 * ships as ONE Royal Mail Tracked 48 parcel.
 *
 *  - the base set, £90: 4 placemats (H-PLACE-4PK) + 6 coasters (H-COAST-6PK), the TABLE DRAWING on
 *    every piece (a Prodigi pack has one print area, so one drawing prints on all of it);
 *  - add-ons at set prices, each capped at 12: a ceramic ornament (+£15) or a christmas sack (+£27)
 *    with its OWN drawing each; an extra placemat (+£16) or a pair of extra coasters (+£11) with the
 *    table drawing.
 * No names are printed on anything, and there's no family-member step: just counts, and a drawing
 * per ornament / sack.
 *
 * In the basket the bundle is ONE line (qty 1) carrying its drawings + counts. The SERVER prices it
 * from the counts it resolves itself (never a client price), and at order time splits it into one
 * order line per Prodigi item — placemat + coaster packs (biggest packs first: a pack is ONE item for
 * Prodigi postage), one per distinct ornament / sack design — whose prices add up to the bundle's to
 * the penny. Client-safe: no I/O.
 */

export const BUNDLE_KEY = 'christmasBundle';

/** Is this basket-line key the bundle (the product key or one of its variant skus)? */
export const isBundleKey = (key: string | null | undefined): boolean => !!key && (key === BUNDLE_KEY || key.startsWith(`${BUNDLE_KEY}-`));

/** The base set: what £90 buys. */
export const BUNDLE_BASE = { placemats: 4, coasters: 6 } as const;
/** The base set's price (the seeded catalogue price of the bundle — pinned equal by a test). */
export const BUNDLE_BASE_PENCE = 9000;
/** The add-ons' set prices (founder, 27 Oct). Extra coasters come in PAIRS: £11 a pair. */
export const BUNDLE_ADDON_PENCE = { ornament: 1500, sack: 2700, placemat: 1600, coasterPair: 1100 } as const;
/** The most of any one add-on: 12 ornaments, 12 sacks, 12 extra placemats, 12 extra coasters (6 pairs). */
export const BUNDLE_MAX_EACH = 12;
/** Extra coasters are added two at a time. */
export const COASTER_STEP = 2;

/** The product keys of the pieces (each seeded in src/server/catalogue.ts with its Prodigi SKU). */
export type BundlePiece = 'placemat' | 'coaster' | 'ceramicOrnament' | 'sack';

/** One Prodigi pack: how many pieces, our variant sku, Prodigi's SKU. Biggest first. */
export interface BundlePack {
  size: number;
  sku: string;
  prodigiSku: string;
}
/** Placemats: Prodigi makes 1/2/4/6-packs (H-PLACE-*PK). The 4-pack is our standalone product. */
export const PLACEMAT_PACKS: readonly BundlePack[] = [
  { size: 6, sku: 'placemat-packof6', prodigiSku: 'H-PLACE-6PK' },
  { size: 4, sku: 'placemat', prodigiSku: 'H-PLACE-4PK' },
  { size: 2, sku: 'placemat-packof2', prodigiSku: 'H-PLACE-2PK' },
  { size: 1, sku: 'placemat-packof1', prodigiSku: 'H-PLACE-1PK' },
];
/** Coasters: 1/2/4/6-packs (H-COAST-*PK). The 6-pack is our standalone product. */
export const COASTER_PACKS: readonly BundlePack[] = [
  { size: 6, sku: 'coaster', prodigiSku: 'H-COAST-6PK' },
  { size: 4, sku: 'coaster-packof4', prodigiSku: 'H-COAST-4PK' },
  { size: 2, sku: 'coaster-packof2', prodigiSku: 'H-COAST-2PK' },
  { size: 1, sku: 'coaster-packof1', prodigiSku: 'H-COAST-1PK' },
];
/** The ornament + sack are the very same items as on their own (their default variant). */
export const ORNAMENT_SKU = 'ceramicOrnament';
export const SACK_SKU = 'sack';

/** Pack variants that exist ONLY to fulfil a bundle — never priced or shown on their own. */
export const BUNDLE_ONLY_SKUS: ReadonlySet<string> = new Set(
  [...PLACEMAT_PACKS, ...COASTER_PACKS].map((p) => p.sku).filter((s) => s !== 'placemat' && s !== 'coaster'),
);
/** Every variant sku a bundle can expand into. */
export const BUNDLE_COMPONENT_SKUS: readonly string[] = [...PLACEMAT_PACKS, ...COASTER_PACKS].map((p) => p.sku).concat(ORNAMENT_SKU, SACK_SKU);

/**
 * Each piece's print area (Prodigi sandbox GET /v4.0/products, 27 Oct) — the SAME geometry the
 * seeded print templates hold (pinned by a test), so the builder's print-quality check is the
 * order-time gate's. The sack's template is Prodigi's 3779×5905 px panel at 150 dpi (fabric —
 * Prodigi scales the file to fill), exactly as the sack on its own.
 */
export const BUNDLE_PIECE_GEOM: Record<BundlePiece, { printWidthPx: number; printHeightPx: number; bleedMm: number; requiredDpi: number }> = {
  placemat: { printWidthPx: 3425, printHeightPx: 2421, bleedMm: 0, requiredDpi: 300 },
  coaster: { printWidthPx: 1251, printHeightPx: 1251, bleedMm: 0, requiredDpi: 300 },
  ceramicOrnament: { printWidthPx: 885, printHeightPx: 885, bleedMm: 0, requiredDpi: 300 },
  sack: { printWidthPx: 1890, printHeightPx: 2953, bleedMm: 3, requiredDpi: 150 },
};

/** A drawing for one piece: which keepsake, and (optionally) its bg-removed cutout. */
export interface BundleArt {
  assetId: string;
  sourceObjectId?: string | null;
}
/** What the shopper chose. Counts are implied by the slots + the two steppers. */
export interface BundleSpec {
  table: BundleArt;
  ornaments: BundleArt[];
  sacks: BundleArt[];
  extraPlacemats: number;
  extraCoasters: number;
}
export interface BundleCounts {
  ornaments: number;
  sacks: number;
  extraPlacemats: number;
  extraCoasters: number;
}

const art = (x: unknown): BundleArt | null => {
  if (!x || typeof x !== 'object') return null;
  const { assetId, sourceObjectId } = x as { assetId?: unknown; sourceObjectId?: unknown };
  if (typeof assetId !== 'string' || assetId.length === 0 || assetId.length > 64) return null;
  return typeof sourceObjectId === 'string' && sourceObjectId.length > 0 && sourceObjectId.length <= 64 ? { assetId, sourceObjectId } : { assetId };
};
const count = (x: unknown, step = 1): number => {
  const n = typeof x === 'number' && Number.isFinite(x) ? Math.floor(x) : 0;
  const capped = Math.min(BUNDLE_MAX_EACH, Math.max(0, n));
  return capped - (capped % step);
};

/**
 * Untrusted input → a bundle the server will make, or null (no table drawing = no bundle). Junk slots
 * are dropped, each list is cut at 12, the extras are whole numbers in 0–12 (coasters in pairs).
 */
export function normalizeBundle(raw: unknown): BundleSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const table = art(r.table);
  if (!table) return null;
  const list = (x: unknown) => (Array.isArray(x) ? x.slice(0, 64).map(art).filter((a): a is BundleArt => a !== null).slice(0, BUNDLE_MAX_EACH) : []);
  return { table, ornaments: list(r.ornaments), sacks: list(r.sacks), extraPlacemats: count(r.extraPlacemats), extraCoasters: count(r.extraCoasters, COASTER_STEP) };
}

export const bundleCounts = (b: BundleSpec): BundleCounts => ({ ornaments: b.ornaments.length, sacks: b.sacks.length, extraPlacemats: b.extraPlacemats, extraCoasters: b.extraCoasters });
/** The counts of a bundle line that may not be valid (no table drawing) — the add-ons alone. */
export const bundleCountsOf = (raw: unknown): BundleCounts => {
  const b = normalizeBundle(raw);
  return b ? bundleCounts(b) : { ornaments: 0, sacks: 0, extraPlacemats: 0, extraCoasters: 0 };
};

/** The bundle's price: the base set + each add-on at its set price. */
export function bundlePricePence(c: BundleCounts, basePence: number = BUNDLE_BASE_PENCE): number {
  return (
    basePence +
    c.ornaments * BUNDLE_ADDON_PENCE.ornament +
    c.sacks * BUNDLE_ADDON_PENCE.sack +
    c.extraPlacemats * BUNDLE_ADDON_PENCE.placemat +
    (c.extraCoasters / COASTER_STEP) * BUNDLE_ADDON_PENCE.coasterPair
  );
}

/** How many placemats + coasters go on the table. */
export const tablePieces = (c: Pick<BundleCounts, 'extraPlacemats' | 'extraCoasters'>) => ({
  placemats: BUNDLE_BASE.placemats + c.extraPlacemats,
  coasters: BUNDLE_BASE.coasters + c.extraCoasters,
});

/**
 * The Prodigi packs that make exactly `n` pieces — the biggest packs first, so the fewest items (a
 * pack is ONE item for Prodigi postage). Every count resolves, because there's a 1-pack.
 */
export function packsFor(n: number, packs: readonly BundlePack[]): BundlePack[] {
  if (!Number.isInteger(n) || n < 1) throw new Error(`can’t make ${n} pieces`);
  const out: BundlePack[] = [];
  let left = n;
  for (const p of packs) {
    while (left >= p.size) {
      out.push(p);
      left -= p.size;
    }
  }
  if (left !== 0) throw new Error(`no pack makes ${n} pieces`);
  return out;
}

/** One order line of an expanded bundle: one Prodigi item (a pack, or an ornament / sack design × qty). */
export interface BundleOrderLine {
  piece: BundlePiece;
  /** our variant sku (src/server/catalogue.ts) — it carries the Prodigi SKU + print template */
  sku: string;
  art: BundleArt;
  qty: number;
  unitPricePence: number;
  linePence: number;
}

/** The base price, shared between the table's two packs (placemats : coasters = 58 : 32, as on their own). */
const COASTER_BASE_SHARE = 32 / 90;

const designKey = (a: BundleArt) => `${a.assetId}|${a.sourceObjectId ?? ''}`;

/** Spread `pence` across packs in proportion to their pieces — whole pennies, adding up exactly. */
function spread(pence: number, packs: BundlePack[], piece: BundlePiece, table: BundleArt): BundleOrderLine[] {
  const total = packs.reduce((n, p) => n + p.size, 0);
  const shares = packs.map((p) => Math.floor((pence * p.size) / total));
  shares[0]! += pence - shares.reduce((n, s) => n + s, 0);
  return packs.map((p, i) => ({ piece, sku: p.sku, art: table, qty: 1, unitPricePence: shares[i]!, linePence: shares[i]! }));
}

/** One line per distinct design, each at the add-on's price. */
function perDesign(list: BundleArt[], piece: BundlePiece, sku: string, unit: number): BundleOrderLine[] {
  const groups = new Map<string, { art: BundleArt; qty: number }>();
  for (const a of list) {
    const g = groups.get(designKey(a));
    if (g) g.qty++;
    else groups.set(designKey(a), { art: a, qty: 1 });
  }
  return [...groups.values()].map((g) => ({ piece, sku, art: g.art, qty: g.qty, unitPricePence: unit, linePence: unit * g.qty }));
}

/**
 * Split a bundle into order lines. `pricePence` is the SERVER's priced line; it must be exactly this
 * bundle's price (else the composition and the charge disagree — refused). The lines add up to it to
 * the penny: each ornament / sack at its add-on price, the rest (the base + the table extras) spread
 * over the placemat + coaster packs.
 */
export function expandBundle(pricePence: number, b: BundleSpec, basePence: number = BUNDLE_BASE_PENCE): BundleOrderLine[] {
  const c = bundleCounts(b);
  if (!Number.isInteger(pricePence) || pricePence !== bundlePricePence(c, basePence)) throw new Error('bundle price doesn’t match its pieces');
  const { placemats, coasters } = tablePieces(c);
  const coasterBase = Math.round(basePence * COASTER_BASE_SHARE);
  const placematPence = basePence - coasterBase + c.extraPlacemats * BUNDLE_ADDON_PENCE.placemat;
  const coasterPence = coasterBase + (c.extraCoasters / COASTER_STEP) * BUNDLE_ADDON_PENCE.coasterPair;
  return [
    ...spread(placematPence, packsFor(placemats, PLACEMAT_PACKS), 'placemat', b.table),
    ...spread(coasterPence, packsFor(coasters, COASTER_PACKS), 'coaster', b.table),
    ...perDesign(b.ornaments, 'ceramicOrnament', ORNAMENT_SKU, BUNDLE_ADDON_PENCE.ornament),
    ...perDesign(b.sacks, 'sack', SACK_SKU, BUNDLE_ADDON_PENCE.sack),
  ];
}

/** The piece a component sku belongs to ('placemat-packof6' → 'placemat'). */
export const pieceOfSku = (sku: string): BundlePiece | null => {
  const k = sku.split('-')[0];
  return k === 'placemat' || k === 'coaster' || k === 'ceramicOrnament' || k === 'sack' ? k : null;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "4 placemats · 6 coasters · 4 ornaments · 2 sacks" — for the basket + the builder. */
export function bundleSummary(c: BundleCounts): string {
  const { placemats, coasters } = tablePieces(c);
  return [plural(placemats, 'placemat'), plural(coasters, 'coaster'), c.ornaments ? plural(c.ornaments, 'ornament') : null, c.sacks ? plural(c.sacks, 'sack') : null].filter(Boolean).join(' · ');
}
