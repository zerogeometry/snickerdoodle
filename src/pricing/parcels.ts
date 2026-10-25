/**
 * The SAME-PARCEL saving (founder, 2026-10-25, D24: "honest bundles only, no Black Friday discount").
 *
 * Every product's price bakes in its own single-item postage. When two things from the same Prodigi
 * PARCEL GROUP are in one order, Prodigi packs them into one shipment and charges ~£1 more, not a
 * second full postage. We pass most of that saving back: £3 off each EXTRA item in a group.
 *
 * Groups are what Prodigi actually ships together, NOT just "same lab". Verified by sandbox quotes
 * to GB on Standard, 2026-10-25 (project-office/briefs/CHRISTMAS-range-and-postage.md §1):
 *   uk9 homeware   bauble + sack £5.30 for two (vs £4.30 each); mug, tea towel, bandana join it
 *   uk3 textiles   apron + cushion, cushion + blanket £5.30 (FedEx, vs £4.30 each)
 *   gb2 wrap       two rolls £6.70 (vs £5.70 each)
 *   uk15 calendar  two £5.35 (vs £4.35 each)
 *   uk9 socks      two pairs £4.30 (vs £4.30 each)
 *   uk5 ornament   two plastic balls £6.70 (vs £6.45 each)
 * The real saving per extra item is £3.30–£6.20 ex-VAT, so a flat £3 is always covered.
 * Deliberately NOT grouped: garments (uk9 garments ship apart from homeware, and already have the
 * family-set saving), cards (flat £0.95 postage, already cheap), framed prints / jigsaws (gb3 ships
 * them on different services), and the AWDis jumper (Prodigi picks uk2 OR uk9 per colour/size).
 *
 * Resolved from priced-line keys alone (product key or variant sku). No client flag exists.
 */

export const PARCEL_SAVING_PER_EXTRA_PENCE = 300;

export type ParcelGroup = 'uk9-home' | 'uk3-textile' | 'gb2-wrap' | 'uk15-calendar' | 'uk9-socks' | 'uk5-ornament';

/** Product key → its parcel group. Variant overrides come first (see {@link parcelGroupOf}). */
const BY_PRODUCT: Record<string, ParcelGroup> = {
  bauble: 'uk9-home', // the CERAMIC bauble; the plastic ball is overridden below
  sack: 'uk9-home',
  mug: 'uk9-home',
  teaTowel: 'uk9-home',
  petBandana: 'uk9-home',
  apron: 'uk3-textile',
  cushion: 'uk3-textile',
  blanket: 'uk3-textile',
  wrappingPaper: 'gb2-wrap',
  calendar: 'uk15-calendar',
  socks: 'uk9-socks',
};

/** Variant skus (`${key}-${slug}…`) that ship from a different lab than their product. */
const BY_VARIANT_PREFIX: Array<[string, ParcelGroup]> = [['bauble-plasticball', 'uk5-ornament']];

/** The parcel group a priced-line key (product key OR variant sku) ships in, or null. */
export function parcelGroupOf(lineKey: string): ParcelGroup | null {
  for (const [prefix, group] of BY_VARIANT_PREFIX) if (lineKey === prefix || lineKey.startsWith(`${prefix}-`)) return group;
  if (BY_PRODUCT[lineKey]) return BY_PRODUCT[lineKey]!;
  const dash = lineKey.indexOf('-');
  if (dash > 0) return BY_PRODUCT[lineKey.slice(0, dash)] ?? null;
  return null;
}

/**
 * The same-parcel saving for a set of priced lines: £3 for every item beyond the first in each
 * group. Never more than the goods in that group.
 */
export function parcelSaving(lines: ReadonlyArray<{ productKey: string; qty: number; linePence: number }>): {
  savingPence: number;
  byGroup: Partial<Record<ParcelGroup, { qty: number; savingPence: number }>>;
} {
  const groups = new Map<ParcelGroup, { qty: number; pence: number }>();
  for (const l of lines) {
    const g = parcelGroupOf(l.productKey);
    if (!g || l.qty <= 0) continue;
    const cur = groups.get(g) ?? { qty: 0, pence: 0 };
    groups.set(g, { qty: cur.qty + l.qty, pence: cur.pence + l.linePence });
  }
  const byGroup: Partial<Record<ParcelGroup, { qty: number; savingPence: number }>> = {};
  let savingPence = 0;
  for (const [g, { qty, pence }] of groups) {
    if (qty < 2) continue;
    const s = Math.min((qty - 1) * PARCEL_SAVING_PER_EXTRA_PENCE, pence);
    byGroup[g] = { qty, savingPence: s };
    savingPence += s;
  }
  return { savingPence, byGroup };
}
