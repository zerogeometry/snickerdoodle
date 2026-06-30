/**
 * Retail price derivation (founder-approved, see project-office/briefs/PRICING.md).
 *
 * Turns a Prodigi cost + shipping into the VAT-inclusive shelf price that yields a target
 * margin on ex-VAT revenue after product cost, postage (baked in = free delivery) and card
 * fees — then rounds UP to a charm price ending in .x9.
 *
 * Pure + dependency-free so the catalogue, tests, and the price-list generator all share
 * ONE implementation (never re-derive the maths elsewhere).
 */

export interface RetailParams {
  /** Target gross margin on ex-VAT revenue (0.25 = 25%). */
  marginRate: number;
  /** VAT rate added on top for the shown price (UK standard = 0.20). */
  vatRate: number;
  /** Stripe percentage fee, charged on the VAT-INCLUSIVE total the customer pays. */
  stripePct: number;
  /** Stripe fixed fee, in pence. */
  stripeFixedPence: number;
}

export const RETAIL: RetailParams = {
  marginRate: 0.25,
  vatRate: 0.2,
  stripePct: 0.015,
  stripeFixedPence: 20,
};

/**
 * Smallest whole-pence amount ending in 9 (i.e. a `.x9` charm price) that is >= `pence`.
 * Fractional pence are rounded up first. e.g. 1243→1249, 1250→1259, 1249→1249.
 */
export function roundUpToX9Pence(pence: number): number {
  const whole = Math.ceil(pence - 1e-6);
  return Math.floor(whole / 10) * 10 + 9;
}

/**
 * VAT-inclusive retail price (pence) for a single item, free Standard delivery baked in.
 *
 * Derivation: let R = ex-VAT price. Stripe takes `stripePct` of the gross (R·(1+vat)) plus a
 * fixed fee, and margin is measured on R:
 *   R − cost − ship − (stripePct·R·(1+vat) + fixed) = marginRate·R
 *   ⇒ R = (cost + ship + fixed) / (1 − marginRate − stripePct·(1+vat))
 * The shown price is R·(1+vat), rounded up to .x9.
 *
 * @param costPence  Prodigi product cost, ex-VAT, in GBP pence.
 * @param shipPence  Prodigi Standard first-item shipping, ex-VAT, in GBP pence.
 */
export function computeRetailPence(costPence: number, shipPence: number, p: RetailParams = RETAIL): number {
  const denom = 1 - p.marginRate - p.stripePct * (1 + p.vatRate);
  if (denom <= 0) throw new Error('retail denominator <= 0 — margin/fees exceed 100%');
  const exVat = (costPence + shipPence + p.stripeFixedPence) / denom;
  return roundUpToX9Pence(exVat * (1 + p.vatRate));
}

/**
 * The actual margin achieved at a given shown (VAT-inclusive) price — for verification /
 * reporting. Returns the fraction of ex-VAT revenue kept as profit after all costs.
 */
export function marginAtPrice(shownPence: number, costPence: number, shipPence: number, p: RetailParams = RETAIL): number {
  const exVat = shownPence / (1 + p.vatRate);
  const stripe = p.stripePct * shownPence + p.stripeFixedPence;
  return (exVat - costPence - shipPence - stripe) / exVat;
}
