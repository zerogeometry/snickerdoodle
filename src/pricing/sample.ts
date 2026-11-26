/**
 * SAMPLE ORDERS AT COST: the founder's own samples, ordered through the normal shop (founder, 25 Nov 2026).
 * PURE pricing, no I/O. WHO may have it is decided elsewhere, server-side only (src/server/samples.ts):
 * a signed-in admin who has done two-step login. This file only says what "at cost" costs.
 *
 * "At cost" = what the order costs the company, so the shop ends up exactly even (rounded up to the penny):
 *   Prodigi's product cost + postage (ex-VAT, the catalogue's live costs: product_variants.unit_cost_pence,
 *   post_first_pence, post_extra_pence), with items that share a Prodigi parcel paying the "plus one" post;
 *   + 20% VAT, because the company is VAT-registered and owes VAT on whatever it charges (PRICING.md §VAT);
 *   + Stripe's card fee (1.5% + 20p, on the whole charge), shown as its own "card fee" line.
 * No codes, no credit, no free card, no multi-buy or parcel savings: the cost already counts the shared post.
 * A line whose cost isn't on file is charged its normal shelf price (never below cost) and named in `noCostKeys`.
 */
import { isCardPackKey } from '@/lib/card-packs';
import { bundleCostPence, bundleSizeOf, isBundleKey } from '@/lib/christmas-bundle';
import type { PricedCatalogue } from './catalogue';
import { parcelGroupOf } from './parcels';

export const SAMPLE_ECONOMICS = {
  vatRate: 0.2,
  /** Stripe's standard UK card fee (the same figure as MULTI_BUY and PRICING.md). */
  cardPct: 0.015,
  cardFixedPence: 20,
} as const;

export interface SampleLineIn {
  productKey: string;
  qty: number;
}

export interface SampleLineCost {
  productKey: string;
  qty: number;
  /** What this line costs us, ex-VAT (product + its share of postage). */
  costExVatPence: number;
  /** Charged per unit, VAT-inclusive (rounded up so the line covers its cost + VAT). */
  unitPricePence: number;
  linePence: number;
  /** false: no cost on file, so the line is charged its shelf price. */
  atCost: boolean;
}

export interface SampleCosting {
  lines: SampleLineCost[];
  /** The lines' VAT-inclusive total. */
  subtotalPence: number;
  /** Stripe's fee on the whole charge, grossed up so the company still nets the goods' cost after VAT. */
  cardFeePence: number;
  totalPence: number;
  /** What the goods cost us, ex-VAT (the at-cost lines only). */
  costExVatPence: number;
  /** Lines charged at their shelf price because their cost isn't on file. */
  noCostKeys: string[];
}

/**
 * The card fee that, added to a VAT-inclusive subtotal, leaves the company exactly the subtotal's ex-VAT
 * amount after VAT is paid on the whole charge and Stripe takes its fee:
 *   T/(1+vat) − (cardPct·T + fixed) ≥ S/(1+vat)  ⇒  T ≥ (S/(1+vat) + fixed) / (1/(1+vat) − cardPct).
 */
export function cardFeeFor(subtotalPence: number, e = SAMPLE_ECONOMICS): number {
  if (!(subtotalPence > 0)) return 0;
  const exVat = subtotalPence / (1 + e.vatRate);
  const total = Math.ceil((exVat + e.cardFixedPence) / (1 / (1 + e.vatRate) - e.cardPct) - 1e-9);
  return Math.max(0, total - subtotalPence);
}

/**
 * Cost every line. `lines` must already be the server's priced lines (keys the catalogue sells, quantities
 * clamped) — the engine's priceBasket gives them. Postage: the first item in each Prodigi parcel group pays
 * the first-item post and every other item in that group the "plus one"; an item in no group is its own
 * parcel (its first unit pays the first post, more of the same pay the "plus one").
 */
export function costSampleLines(lines: readonly SampleLineIn[], catalogue: PricedCatalogue, e = SAMPLE_ECONOMICS): SampleCosting {
  const groupStarted = new Set<string>();
  const out: SampleLineCost[] = [];
  const noCostKeys: string[] = [];
  let costExVatPence = 0;

  for (const l of lines) {
    const qty = l.qty;
    if (!(qty > 0)) continue;
    const entry = catalogue[l.productKey];
    if (!entry) continue;
    let lineCost: number | null = null;
    const group = parcelGroupOf(l.productKey);

    if (isBundleKey(l.productKey)) {
      // the bundle's pieces' own costs + its one parcel (src/lib/christmas-bundle.ts)
      const size = bundleSizeOf(l.productKey);
      lineCost = size !== null ? bundleCostPence(size) * qty : null;
    } else {
      const landed = entry.unitCostPence; // product + first-item post, ex-VAT
      const first = entry.postFirstPence;
      const extra = entry.postExtraPence;
      if (typeof landed === 'number' && landed >= 0) {
        if (typeof first === 'number' && typeof extra === 'number' && first >= 0 && extra >= 0 && landed >= first) {
          const product = landed - first;
          const firstUnitPays = group && groupStarted.has(group) ? extra : first;
          lineCost = product * qty + firstUnitPays + (qty - 1) * extra;
        } else {
          lineCost = landed * qty; // post split unknown: every unit pays its full landed cost (never under)
        }
      }
    }
    if (group && lineCost !== null) groupStarted.add(group);

    if (lineCost === null) {
      noCostKeys.push(l.productKey);
      out.push({ productKey: l.productKey, qty, costExVatPence: 0, unitPricePence: entry.pricePence, linePence: entry.pricePence * qty, atCost: false });
      continue;
    }
    costExVatPence += lineCost;
    let unit = Math.ceil((lineCost * (1 + e.vatRate)) / qty - 1e-9);
    // a card pack's price is split equally between its cards at order time (src/lib/card-packs.ts expandCardPack), so it
    // rounds UP to a multiple of 10p — splits evenly for a pack of 5 or 10 (a few pence at most, never under cost)
    if (isCardPackKey(l.productKey)) unit = Math.ceil(unit / 10) * 10;
    out.push({ productKey: l.productKey, qty, costExVatPence: lineCost, unitPricePence: unit, linePence: unit * qty, atCost: true });
  }

  const subtotalPence = out.reduce((n, l) => n + l.linePence, 0);
  const cardFeePence = cardFeeFor(subtotalPence, e);
  return { lines: out, subtotalPence, cardFeePence, totalPence: subtotalPence + cardFeePence, costExVatPence, noCostKeys };
}
