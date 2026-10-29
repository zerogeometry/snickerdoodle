import { productOfKey, quote, type RequestedLine } from '@/pricing';
import { suggestComplements } from '@/lib/complements';
import type { CatalogueProduct } from './catalogue';

/**
 * CHECKOUT ADD-ONS (founder, 29 Oct): up to three products NOT in the basket that go with what is,
 * from the one complement table (src/lib/complements.ts), each with its REAL saving: the basket is
 * re-priced by the same engine that charges, with that product added, and the saving is exactly the
 * extra same-parcel saving that buys (src/pricing/parcels.ts — £3 when it rides in the same Prodigi
 * parcel, 0 when it doesn't, in which case nothing is claimed). Server-only figures; the client just
 * shows them. The picture is made by the client from the shopper's own drawing through the usual
 * authz-gated mockup route — nothing here touches a drawing.
 */
export interface AddOn {
  productKey: string;
  label: string;
  /** its default variant — what "+" adds */
  sku: string;
  variantId: string;
  attributes: Record<string, string>;
  pricePence: number;
  /** what adding it takes off this order (same-parcel), 0 = no claim */
  savingPence: number;
}

type QuoteOpts = Parameters<typeof quote>[1];

/** Pure: the add-ons for this basket, given the products ON SHOW (the shop's own listing). */
export function pickAddOns(onShow: readonly CatalogueProduct[], requested: readonly RequestedLine[], opts: QuoteOpts, max = 3): AddOn[] {
  const base = quote(requested, opts);
  if (base.lines.length === 0) return [];
  const shown = new Map(onShow.filter((p) => p.category !== 'ADDON').map((p) => [p.key, p]));
  const keys = suggestComplements(base.lines.map((l) => productOfKey(l.productKey)), new Set(shown.keys()), max);
  return keys.flatMap((k) => {
    const p = shown.get(k)!;
    const v = p.variants.find((x) => x.isDefault) ?? p.variants[0];
    if (!v) return [];
    const withIt = quote([...requested, { productKey: v.sku, qty: 1 }], opts);
    const added = withIt.lines.find((l) => l.productKey === v.sku);
    if (!added) return []; // not priceable here — never offer what can't be bought
    return [{ productKey: k, label: p.label, sku: v.sku, variantId: v.id, attributes: v.attributes, pricePence: added.unitPricePence, savingPence: Math.max(0, withIt.parcelSavingPence - base.parcelSavingPence) }];
  });
}
