/**
 * MULTI-BUY — buy more of the same product, save more (founder, 27 Oct 2026). PURE pricing, no I/O.
 *
 * Each product's tiers are DERIVED FROM ITS COST, never typed in: for each quantity (2, 3, 4, 5+)
 * the discount is the LARGEST step (0 / 5 / 10 / 15%) that still keeps the order at ≥ 15% net of
 * its ex-VAT revenue after ALL costs —
 *   Prodigi product cost × q + post (the first unit + the real "plus one" post for each extra in the
 *   same parcel) + the card fee (1.5% + 20p) + 3% reprints (of fulfilment) + a 5% allowance for codes /
 *   partner commission (kept, so a PTA or creator commission still fits) + £0.55 running per order.
 * The same-parcel saving (£3 per extra item, src/pricing/parcels.ts) is counted first — it always
 * stands (it's postage) — and the multi-buy % comes off the shelf price on top of it. Tiers never go down as quantity rises, and cap at 15%. A product whose every
 * tier is 0 shows no offer. Live costs come from the catalogue (product_variants.unit_cost_pence +
 * post_first_pence / post_extra_pence); anything unknown ⇒ no offer — the notice is never dishonest.
 */

import { PARCEL_SAVING_PER_EXTRA_PENCE } from './parcels';

export const MULTI_BUY = {
  /** The discount steps, in basis points (0, 5%, 10%, 15%) — the most it ever is is the last. */
  stepsBps: [0, 500, 1000, 1500] as const,
  /** The quantities with their own tier: 2, 3, 4, and 5+ (the last covers every bigger basket). */
  quantities: [2, 3, 4, 5] as const,
  /** "5+" must hold for every basket up to this many (fixed per-order costs only shrink beyond). */
  checkUpTo: 12,
  /** The profit floor: net ≥ 15% of ex-VAT revenue. */
  targetNetBps: 1500,
  vatRate: 0.2,
  cardPct: 0.015,
  cardFixedPence: 20,
  /** Reprints (damaged / misprinted), as a share of fulfilment (product + post). */
  reprintBps: 300,
  /** Kept back for codes / partner commission, as a share of ex-VAT revenue. */
  codesAllowanceBps: 500,
  /** Running costs per order (hosting, email, storage…). */
  runningPencePerOrder: 55,
} as const;

/** What one unit of a product costs + sells for. */
export interface UnitEconomics {
  /** VAT-inclusive shelf price. */
  pricePence: number;
  /** Prodigi's product cost, ex-VAT (no post). */
  productCostPence: number;
  /** Post for the first unit, ex-VAT. */
  postFirstPence: number;
  /** Post for each extra unit in the same parcel ("plus one"), ex-VAT. */
  postExtraPence: number;
  /** The same-parcel saving we give per extra unit (0 when it ships in no parcel group). */
  parcelSavingPerExtraPence: number;
}

/** Net (pence) on q units at discount `bps`, and the ex-VAT revenue it's measured against. */
export function netAt(e: UnitEconomics, q: number, bps: number, m = MULTI_BUY): { netPence: number; revenueExVatPence: number } {
  const goods = q * e.pricePence;
  const parcel = Math.min(e.parcelSavingPerExtraPence * (q - 1), goods);
  const paid = goods * (1 - bps / 10000) - parcel; // the % is off the shelf price; the parcel saving on top
  const revenue = paid / (1 + m.vatRate);
  const fulfil = q * e.productCostPence + e.postFirstPence + (q - 1) * e.postExtraPence;
  const card = m.cardPct * paid + m.cardFixedPence;
  const reprints = (fulfil * m.reprintBps) / 10000;
  const codes = (revenue * m.codesAllowanceBps) / 10000;
  return { netPence: revenue - fulfil - card - reprints - codes - m.runningPencePerOrder, revenueExVatPence: revenue };
}

const holds = (e: UnitEconomics, q: number, bps: number, m = MULTI_BUY) => {
  const { netPence, revenueExVatPence } = netAt(e, q, bps, m);
  return revenueExVatPence > 0 && netPence >= (revenueExVatPence * m.targetNetBps) / 10000;
};

/**
 * The tiers for quantities 2, 3, 4, 5+ (basis points each). The largest step that keeps the floor at
 * that quantity (5+ must hold at every quantity up to checkUpTo), then made never to go DOWN as the
 * quantity rises — each tier is the smallest of itself and every tier above it, so all still hold.
 */
export function multiBuyTiers(e: UnitEconomics | null, m = MULTI_BUY): number[] {
  if (!e || ![e.pricePence, e.productCostPence, e.postFirstPence, e.postExtraPence].every((x) => Number.isFinite(x) && x >= 0) || e.pricePence <= 0) {
    return m.quantities.map(() => 0);
  }
  const best = (qs: number[]): number => [...m.stepsBps].reverse().find((bps) => qs.every((q) => holds(e, q, bps, m))) ?? 0;
  const raw: number[] = m.quantities.map((q, i) => (i === m.quantities.length - 1 ? best(Array.from({ length: m.checkUpTo - q + 1 }, (_, k) => q + k)) : best([q])));
  for (let i = raw.length - 2; i >= 0; i--) raw[i] = Math.min(raw[i]!, raw[i + 1]!);
  return raw;
}

/** The tier for a quantity (0 below 2). */
export function tierFor(tiers: readonly number[], q: number, m = MULTI_BUY): number {
  const first = m.quantities[0], last = m.quantities[m.quantities.length - 1]!;
  if (q < first) return 0;
  const i = Math.min(q, last) - first;
  return tiers[i] ?? 0;
}

/** Does this product carry an offer at all? */
export const hasMultiBuy = (tiers: readonly number[]) => tiers.some((t) => t > 0);

/**
 * A catalogue entry's economics, from its LIVE costs: the landed unit cost (product + first post)
 * and the first / plus-one post. Any of them unknown ⇒ null ⇒ no offer.
 */
export function economicsOf(entry: { pricePence: number; unitCostPence?: number | null; postFirstPence?: number | null; postExtraPence?: number | null } | undefined, grouped: boolean): UnitEconomics | null {
  if (!entry) return null;
  const { unitCostPence: landed, postFirstPence: first, postExtraPence: extra } = entry;
  if (typeof landed !== 'number' || typeof first !== 'number' || typeof extra !== 'number' || landed < first) return null;
  return { pricePence: entry.pricePence, productCostPence: landed - first, postFirstPence: first, postExtraPence: extra, parcelSavingPerExtraPence: grouped ? PARCEL_SAVING_PER_EXTRA_PENCE : 0 };
}

/**
 * A BUNDLE's economics from its pieces' live costs: the pieces' product costs together, one parcel
 * for them (the first piece's post + the others' "plus one"), and each extra bundle adding every
 * piece's "plus one". Any piece unknown ⇒ null ⇒ no offer. Not in a parcel group (the bundle's price
 * already counts its one parcel).
 */
export function composedEconomics(pricePence: number, pieces: ReadonlyArray<Parameters<typeof economicsOf>[0]>): UnitEconomics | null {
  const parts = pieces.map((p) => economicsOf(p, false));
  if (parts.length === 0 || parts.some((x) => !x)) return null;
  const ps = parts as UnitEconomics[];
  return {
    pricePence,
    productCostPence: ps.reduce((n, x) => n + x.productCostPence, 0),
    postFirstPence: ps[0]!.postFirstPence + ps.slice(1).reduce((n, x) => n + x.postExtraPence, 0),
    postExtraPence: ps.reduce((n, x) => n + x.postExtraPence, 0),
    parcelSavingPerExtraPence: 0,
  };
}
