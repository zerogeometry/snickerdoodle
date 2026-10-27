/**
 * The CHRISTMAS EVE BUNDLE (founder, 27 Oct 2026): a christmas sack + a ceramic ornament + a two-tone
 * 11oz mug (any colour) — all from Prodigi's uk9 lab, so ONE parcel. £62 a bundle (£74 separately).
 *
 * ONE drawing goes on all three by default; any piece can have its own instead. A basket line is one
 * bundle design (qty = copies of it); a family usually builds one per child, and the bundles have their
 * OWN multi-buy on how many there are — the same cost-derived tiers as everything else
 * (src/pricing/multibuy.ts), worked out from the three pieces' live costs.
 *
 * At order time the SERVER splits each bundle into its three Prodigi items, at shares of the bundle
 * price that add up to it to the penny. Client-safe: no I/O.
 */

import type { BundleArt } from '@/lib/christmas-bundle';

export const EVE_KEY = 'christmasEveBundle';
export const isEveKey = (key: string | null | undefined): boolean => !!key && (key === EVE_KEY || key.startsWith(`${EVE_KEY}-`));

/** The bundle's price (the seeded catalogue price — pinned equal by a test). */
export const EVE_PRICE_PENCE = 6200;

/** The three pieces, by our product key (each its own Prodigi SKU + print template). */
export type EvePiece = 'sack' | 'ceramicOrnament' | 'mug';
export const EVE_PIECES: readonly EvePiece[] = ['sack', 'ceramicOrnament', 'mug'];

/** The two-tone mug's colours → our variant sku (the blue is the mug's default, 'mug'). */
export const MUG_COLOURS = ['blue', 'black', 'green', 'orange', 'pink', 'red', 'yellow'] as const;
export type MugColour = (typeof MUG_COLOURS)[number];
export const mugSkuFor = (c: MugColour): string => (c === 'blue' ? 'mug' : `mug-11oz-${c}`);
/** Every variant sku a Christmas Eve bundle can expand into. */
export const EVE_COMPONENT_SKUS: readonly string[] = ['sack', 'ceramicOrnament', ...MUG_COLOURS.map(mugSkuFor)];

export interface EveSpec {
  /** The drawing on all three, unless a piece has its own. */
  drawing: BundleArt;
  /** A piece's OWN drawing (absent = the main one). */
  own: Partial<Record<EvePiece, BundleArt>>;
  mugColour: MugColour;
}

const art = (x: unknown): BundleArt | null => {
  if (!x || typeof x !== 'object') return null;
  const { assetId, sourceObjectId } = x as { assetId?: unknown; sourceObjectId?: unknown };
  if (typeof assetId !== 'string' || assetId.length === 0 || assetId.length > 64) return null;
  return typeof sourceObjectId === 'string' && sourceObjectId.length > 0 && sourceObjectId.length <= 64 ? { assetId, sourceObjectId } : { assetId };
};

/** Untrusted input → a bundle the server will make, or null (no drawing = no bundle). */
export function normalizeEve(raw: unknown): EveSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const drawing = art(r.drawing);
  if (!drawing) return null;
  const own: EveSpec['own'] = {};
  const ownRaw = r.own && typeof r.own === 'object' ? (r.own as Record<string, unknown>) : {};
  for (const p of EVE_PIECES) {
    const a = art(ownRaw[p]);
    if (a) own[p] = a;
  }
  const mugColour = MUG_COLOURS.includes(r.mugColour as MugColour) ? (r.mugColour as MugColour) : 'blue';
  return { drawing, own, mugColour };
}

/** The drawing each piece prints. */
export const artFor = (b: EveSpec, p: EvePiece): BundleArt => b.own[p] ?? b.drawing;

export interface EveOrderLine {
  piece: EvePiece;
  sku: string;
  art: BundleArt;
  qty: number;
  unitPricePence: number;
  linePence: number;
}

/**
 * Split `qty` copies of a bundle into its three order lines. The bundle price is shared in proportion
 * to the pieces' own shelf prices (sack : ornament : mug), whole pennies, adding up exactly.
 */
export function expandEve(bundlePricePence: number, qty: number, b: EveSpec, shelfPence: Record<EvePiece, number>): EveOrderLine[] {
  if (!Number.isInteger(bundlePricePence) || bundlePricePence <= 0 || !Number.isInteger(qty) || qty < 1) throw new Error('not a christmas eve bundle');
  const total = EVE_PIECES.reduce((n, p) => n + shelfPence[p], 0);
  if (!(total > 0)) throw new Error('christmas eve pieces have no prices');
  const shares = EVE_PIECES.map((p) => Math.floor((bundlePricePence * shelfPence[p]) / total));
  shares[0]! += bundlePricePence - shares.reduce((n, s) => n + s, 0);
  return EVE_PIECES.map((p, i) => ({
    piece: p,
    sku: p === 'mug' ? mugSkuFor(b.mugColour) : p,
    art: artFor(b, p),
    qty,
    unitPricePence: shares[i]!,
    linePence: shares[i]! * qty,
  }));
}

/** "one drawing on all three · blue mug" — for the basket + the builder. */
export function eveSummary(b: EveSpec): string {
  const own = EVE_PIECES.filter((p) => b.own[p] && b.own[p]!.assetId !== b.drawing.assetId).length;
  const drawings = own === 0 ? 'one drawing on all three' : own === 1 ? 'one piece with its own drawing' : `${own} pieces with their own drawings`;
  return [drawings, `${b.mugColour} mug`].join(' · ');
}
