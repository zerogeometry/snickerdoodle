import { definedPriceList, definedProducts } from '@/server/catalogue';
import { BUNDLE_ONLY_SKUS } from '@/lib/christmas-bundle';
import { deliveryDays, shipsTracked } from '@/lib/delivery';
import { CHRISTMAS_FEATURED } from '@/lib/season';
import { SHOP_PRODUCTS, productPath, type ShopProductCopy } from '@/lib/shop-products';

/**
 * The public shop listing (C7 product pages + structured data, C8 Merchant Center feed): every
 * product ON SHOW (visibleInShop, not paused), with its prices from the SERVER catalogue — the same
 * price list the seed writes and the pricing engine charges (never anything from a client).
 *
 * A bundle-only pack (BUNDLE_ONLY_SKUS) is never listed: no page, structured data or feed item can
 * offer a price nobody can pay.
 *
 * Variants are grouped by PRICE: one offer per price a family can actually pay (four frame sizes,
 * snap vs tough phone cases, 2/3/5 m wrap) — never one per phone model or frame colour.
 */

export interface OfferGroup {
  /** The group's representative sku (its default variant when it holds one) — stable, so a good feed id. */
  sku: string;
  pricePence: number;
  /** What sets this group apart ('11×14″', 'tough', 'pack of 10'); '' when it's the only group. */
  label: string;
  /** Attribute values every variant in the group shares (size / colour / grade …). */
  shared: Record<string, string>;
  variantCount: number;
}

export interface ShopListing extends ShopProductCopy {
  key: string;
  category: string;
  blurb: string;
  description: string;
  specs: Record<string, string>;
  path: string;
  /** Cheapest first. */
  offers: OfferGroup[];
  fromPence: number;
  tracked: boolean;
  /** In the Christmas lead range (src/lib/season.ts) — Merchant Center's custom_label_0. */
  christmas: boolean;
  delivery: { handling: [number, number]; transit: [number, number] };
}

const SIDES: Record<string, string> = { single: 'printed one side', double: 'printed both sides' };
/** The attributes that can tell a price group apart, in the order a label reads. Orientation, finish
 * and phone model never change a price, so they never name one. */
const LABEL_ATTRS = ['size', 'grade', 'sides', 'colour'] as const;

function groupLabel(key: string, shared: Record<string, string>, values: Map<string, Set<string>>, copy: ShopProductCopy, pricePence: number): string {
  if (copy.groupLabel?.[pricePence]) return copy.groupLabel[pricePence];
  const parts: string[] = [];
  for (const a of LABEL_ATTRS) {
    if (a === 'size' && key === 'phoneCase') continue; // size is the phone model there
    const v = shared[a];
    if (v) parts.push(a === 'sides' ? (SIDES[v] ?? v) : v);
    else if (a === 'size' && (values.get(a)?.size ?? 0) > 1 && values.get(a)!.size <= 2) parts.push([...values.get(a)!].join(' or '));
  }
  return parts.join(', ');
}

/** The listing for every product on show, in the catalogue's order. Pure: no DB, no clock. */
export function shopListings(): ShopListing[] {
  // (a bundle's extra packs — the single placemat, the 2- and 6-packs, the single coaster — are never
  // priced or shown on their own, exactly as the catalogue the shop sells from: getCatalogue)
  const prices = definedPriceList().filter((r) => r.visibleInShop && !r.paused && !BUNDLE_ONLY_SKUS.has(r.sku));
  const out: ShopListing[] = [];
  for (const p of definedProducts()) {
    if (!p.visibleInShop || p.paused) continue;
    const copy = SHOP_PRODUCTS[p.key];
    if (!copy) continue; // unit-tested: every product on show has copy
    const rows = prices.filter((r) => r.productKey === p.key);
    if (rows.length === 0) continue;

    const byPrice = new Map<number, typeof rows>();
    for (const r of rows) byPrice.set(r.pricePence, [...(byPrice.get(r.pricePence) ?? []), r]);
    const groups = [...byPrice.entries()].sort(([a], [b]) => a - b);
    const offers: OfferGroup[] = groups.map(([pricePence, vs]) => {
      const values = new Map<string, Set<string>>();
      for (const v of vs) for (const [a, val] of Object.entries(v.attributes)) values.set(a, (values.get(a) ?? new Set()).add(val));
      const shared: Record<string, string> = {};
      for (const [a, set] of values) if (set.size === 1 && vs.every((v) => a in v.attributes)) shared[a] = [...set][0]!;
      const rep = vs.find((v) => v.isDefault) ?? vs[0]!;
      return { sku: rep.sku, pricePence, label: groups.length > 1 ? groupLabel(p.key, shared, values, copy, pricePence) : '', shared, variantCount: vs.length };
    });

    out.push({
      ...copy,
      key: p.key,
      category: p.category,
      blurb: p.blurb,
      description: p.description,
      specs: p.specs,
      path: productPath(p.key),
      offers,
      fromPence: offers[0]!.pricePence,
      tracked: shipsTracked(p.key),
      christmas: (CHRISTMAS_FEATURED as readonly string[]).includes(p.key),
      delivery: deliveryDays(p.key),
    });
  }
  return out;
}

export const shopListing = (key: string): ShopListing | undefined => shopListings().find((l) => l.key === key);
export const shopListingBySlug = (slug: string): ShopListing | undefined => shopListings().find((l) => l.slug === slug);

/** "£21", "£5.50" */
export const gbp = (pence: number): string => `£${pence % 100 ? (pence / 100).toFixed(2) : pence / 100}`;
