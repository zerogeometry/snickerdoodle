/**
 * The CHRISTMAS FAMILY BUNDLE (founder, 29 Oct 2026 — three simple sizes, no add-ons): N placemats +
 * N coasters + N ceramic ornaments, every piece from Prodigi's uk9 lab, so the lot ships as ONE Royal
 * Mail Tracked 48 parcel.
 *
 *   a set for 2 — £78 · a set for 4 — £145 · a set for 8 — £279   (≈ 20% net after every cost)
 *
 * The drawings: ONE for all the placemats; ONE for all the coasters (the placemats' unless the shopper
 * picks another); ONE per ornament (the placemats' until they pick its own). A Prodigi pack has one
 * print area, so one drawing prints on every piece of it. No names, no extras, no add-ons.
 *
 * The size is the basket line's VARIANT sku (christmasBundle / christmasBundle-for4 /
 * christmasBundle-for8); the SERVER prices it from its catalogue (never a client figure) and at order
 * time splits it into one order line per Prodigi item — the placemat + coaster packs and one per
 * distinct ornament design — at shares of the price (weighted by what each piece costs us) that add
 * up to it to the penny. Client-safe: no I/O.
 */

export const BUNDLE_KEY = 'christmasBundle';

/** Is this basket-line key the bundle (the product key or one of its variant skus)? */
export const isBundleKey = (key: string | null | undefined): boolean => !!key && (key === BUNDLE_KEY || key.startsWith(`${BUNDLE_KEY}-`));

/** How many of each piece: a set for 2, 4 or 8. */
export type BundleSize = 2 | 4 | 8;

/** The three sizes — their variant sku (the set for 2 is the default, so it keeps the product key)
 * and price. Pinned equal to the seeded catalogue by a test. */
export const BUNDLE_SIZES: ReadonlyArray<{ n: BundleSize; size: string; sku: string; pricePence: number }> = [
  { n: 2, size: 'for 2', sku: BUNDLE_KEY, pricePence: 7800 },
  { n: 4, size: 'for 4', sku: `${BUNDLE_KEY}-for4`, pricePence: 14500 },
  { n: 8, size: 'for 8', sku: `${BUNDLE_KEY}-for8`, pricePence: 27900 },
];

/** The size a bundle key stands for (null: not a bundle key we sell). */
export function bundleSizeOf(key: string | null | undefined): BundleSize | null {
  return BUNDLE_SIZES.find((s) => s.sku === key)?.n ?? null;
}
/** The variant sku of a size. */
export const bundleSkuFor = (n: BundleSize): string => BUNDLE_SIZES.find((s) => s.n === n)!.sku;

/** The product keys of the pieces (each seeded in src/server/catalogue.ts with its Prodigi SKU). */
export type BundlePiece = 'placemat' | 'coaster' | 'ceramicOrnament';

/** One Prodigi item of a bundle: our variant sku (it carries the Prodigi SKU + print template). */
export interface BundlePack {
  sku: string;
  prodigiSku: string;
  /** pieces in the pack */
  pieces: number;
  /** what Prodigi charges us for it, ex-VAT, before post (sandbox quote 27 Oct) */
  costPence: number;
}
export const PLACEMAT_2PK: BundlePack = { sku: 'placemat-packof2', prodigiSku: 'H-PLACE-2PK', pieces: 2, costPence: 1650 };
export const PLACEMAT_4PK: BundlePack = { sku: 'placemat', prodigiSku: 'H-PLACE-4PK', pieces: 4, costPence: 3250 };
export const COASTER_2PK: BundlePack = { sku: 'coaster-packof2', prodigiSku: 'H-COAST-2PK', pieces: 2, costPence: 550 };
export const COASTER_4PK: BundlePack = { sku: 'coaster-packof4', prodigiSku: 'H-COAST-4PK', pieces: 4, costPence: 1000 };
/** The ornament is the very same item as on its own (its default variant). */
export const ORNAMENT: BundlePack = { sku: 'ceramicOrnament', prodigiSku: 'XMAS-PORC-BAUB', pieces: 1, costPence: 800 };

/** The packs that make each size's table (founder, 29 Oct): a set for 8 is two 4-packs of each. */
export const TABLE_PACKS: Record<BundleSize, { placemat: { pack: BundlePack; qty: number }; coaster: { pack: BundlePack; qty: number } }> = {
  2: { placemat: { pack: PLACEMAT_2PK, qty: 1 }, coaster: { pack: COASTER_2PK, qty: 1 } },
  4: { placemat: { pack: PLACEMAT_4PK, qty: 1 }, coaster: { pack: COASTER_4PK, qty: 1 } },
  8: { placemat: { pack: PLACEMAT_4PK, qty: 2 }, coaster: { pack: COASTER_4PK, qty: 2 } },
};

/** Prodigi uk9 post: the first item £4.30, each extra item in the parcel +£1 (a pack is one item). */
export const BUNDLE_POST = { firstPence: 430, extraPence: 100 } as const;

/** How many Prodigi items (postage units) a size is: its packs + one per ornament. */
export const bundleItems = (n: BundleSize): number => TABLE_PACKS[n].placemat.qty + TABLE_PACKS[n].coaster.qty + n;

/** What a size costs us, ex-VAT, post included — £45.30 / £83.80 / £164.30 (pinned by a test). */
export function bundleCostPence(n: BundleSize): number {
  const t = TABLE_PACKS[n];
  const product = t.placemat.pack.costPence * t.placemat.qty + t.coaster.pack.costPence * t.coaster.qty + ORNAMENT.costPence * n;
  return product + BUNDLE_POST.firstPence + (bundleItems(n) - 1) * BUNDLE_POST.extraPence;
}

/** Pack variants that exist ONLY to fulfil a bundle — never priced or shown on their own. (The placemat
 * 4-pack and the coaster 2/4/6-packs are sold on their own — founder, 29 Oct; the 1/6 placemat and the
 * single coaster are seeded too but no bundle uses them.) */
export const BUNDLE_ONLY_SKUS: ReadonlySet<string> = new Set(['placemat-packof1', 'placemat-packof2', 'placemat-packof6', 'coaster-packof1']);
/** Every variant sku a bundle can expand into. */
export const BUNDLE_COMPONENT_SKUS: readonly string[] = [PLACEMAT_2PK.sku, PLACEMAT_4PK.sku, COASTER_2PK.sku, COASTER_4PK.sku, ORNAMENT.sku];

/**
 * Each piece's print area (Prodigi sandbox GET /v4.0/products, 27 Oct) — the SAME geometry the
 * seeded print templates hold (pinned by a test), so the builder's print-quality check is the
 * order-time gate's.
 */
export const BUNDLE_PIECE_GEOM: Record<BundlePiece, { printWidthPx: number; printHeightPx: number; bleedMm: number; requiredDpi: number }> = {
  placemat: { printWidthPx: 3425, printHeightPx: 2421, bleedMm: 0, requiredDpi: 300 },
  coaster: { printWidthPx: 1251, printHeightPx: 1251, bleedMm: 0, requiredDpi: 300 },
  ceramicOrnament: { printWidthPx: 885, printHeightPx: 885, bleedMm: 0, requiredDpi: 300 },
};

/** A drawing for one piece: which keepsake, and (optionally) its bg-removed cutout. */
export interface BundleArt {
  assetId: string;
  sourceObjectId?: string | null;
}
/** What the shopper chose. */
export interface BundleSpec {
  /** on every placemat */
  placemat: BundleArt;
  /** on every coaster — null: the placemats' drawing */
  coaster: BundleArt | null;
  /** one per ornament — exactly the size's count */
  ornaments: BundleArt[];
}

const art = (x: unknown): BundleArt | null => {
  if (!x || typeof x !== 'object') return null;
  const { assetId, sourceObjectId } = x as { assetId?: unknown; sourceObjectId?: unknown };
  if (typeof assetId !== 'string' || assetId.length === 0 || assetId.length > 64) return null;
  return typeof sourceObjectId === 'string' && sourceObjectId.length > 0 && sourceObjectId.length <= 64 ? { assetId, sourceObjectId } : { assetId };
};

/**
 * Untrusted input → the bundle of size `n` the server will make, or null (no placemat drawing = no
 * bundle). Junk ornament slots are dropped and the list is cut at `n`; an ornament left without a
 * drawing wears the placemats' (the builder's default, shown in its preview).
 */
export function normalizeBundle(raw: unknown, n: BundleSize): BundleSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const placemat = art(r.placemat);
  if (!placemat) return null;
  const given = Array.isArray(r.ornaments) ? r.ornaments.slice(0, 64).map(art).filter((a): a is BundleArt => a !== null).slice(0, n) : [];
  const ornaments = [...given, ...Array.from({ length: n - given.length }, () => ({ ...placemat }))];
  return { placemat, coaster: art(r.coaster), ornaments };
}

/** The coasters' drawing. */
export const coasterArt = (b: BundleSpec): BundleArt => b.coaster ?? b.placemat;

/** One order line of an expanded bundle: one Prodigi item × qty. */
export interface BundleOrderLine {
  piece: BundlePiece;
  sku: string;
  art: BundleArt;
  qty: number;
  unitPricePence: number;
  linePence: number;
}

const designKey = (a: BundleArt) => `${a.assetId}|${a.sourceObjectId ?? ''}`;

/**
 * Split a bundle of size `n` into its order lines. `pricePence` is the SERVER's priced line. Each
 * physical item gets a share of it weighted by what it costs us (whole pennies; the odd pennies go to
 * the first items), and items alike — the same pack or ornament, the same drawing, the same share —
 * become one line. The lines add up to `pricePence` exactly.
 */
export function expandBundle(pricePence: number, b: BundleSpec, n: BundleSize): BundleOrderLine[] {
  if (!Number.isInteger(pricePence) || pricePence <= 0) throw new Error('not a bundle price');
  if (b.ornaments.length !== n) throw new Error('a bundle needs a drawing for every ornament');
  const t = TABLE_PACKS[n];
  const items: Array<{ piece: BundlePiece; pack: BundlePack; art: BundleArt }> = [
    ...Array.from({ length: t.placemat.qty }, () => ({ piece: 'placemat' as const, pack: t.placemat.pack, art: b.placemat })),
    ...Array.from({ length: t.coaster.qty }, () => ({ piece: 'coaster' as const, pack: t.coaster.pack, art: coasterArt(b) })),
    ...b.ornaments.map((a) => ({ piece: 'ceramicOrnament' as const, pack: ORNAMENT, art: a })),
  ];
  const total = items.reduce((s, x) => s + x.pack.costPence, 0);
  const shares = items.map((x) => Math.floor((pricePence * x.pack.costPence) / total));
  let left = pricePence - shares.reduce((s, x) => s + x, 0);
  for (let i = 0; left > 0; i = (i + 1) % shares.length, left--) shares[i]!++;
  const lines = new Map<string, BundleOrderLine>();
  items.forEach((x, i) => {
    const unit = shares[i]!;
    const k = `${x.pack.sku}|${designKey(x.art)}|${unit}`;
    const l = lines.get(k);
    if (l) {
      l.qty++;
      l.linePence += unit;
    } else lines.set(k, { piece: x.piece, sku: x.pack.sku, art: x.art, qty: 1, unitPricePence: unit, linePence: unit });
  });
  return [...lines.values()];
}

/** The piece a component sku belongs to ('placemat-packof2' → 'placemat'). */
export const pieceOfSku = (sku: string): BundlePiece | null => {
  const k = sku.split('-')[0];
  return k === 'placemat' || k === 'coaster' || k === 'ceramicOrnament' ? k : null;
};

/** "4 placemats · 4 coasters · 4 ornaments" — for the basket + the builder. */
export const bundleSummary = (n: BundleSize): string => `${n} placemats · ${n} coasters · ${n} ornaments`;
