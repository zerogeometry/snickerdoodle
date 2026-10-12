/**
 * Promo / partner codes — PURE pricing (no I/O), so the money rules are unit-tested.
 *
 * The client sends a code STRING; the server resolves it to a {@link PromoRule} and this module
 * decides what it's worth. Three rules keep a code from ever selling at a loss:
 *
 *  1. MINIMUM SPEND — FIXED vouchers (£5 / £10) only on baskets big enough to carry them.
 *  2. BEST SINGLE SAVING — a code never stacks with the 5% join / family-set savings; the
 *     customer gets whichever is bigger (generous AND margin-safe).
 *  3. MARGIN GUARD — whatever happens, the order keeps at least `floorBps` of its full-price
 *     ex-VAT goods revenue as contribution (after product + delivery cost, card fees, the
 *     discount AND any partner commission). The discount is capped first, then the commission.
 *
 * Lines whose unit cost is unknown are left out of the code entirely (never discounted).
 */

export interface PromoRule {
  id: string;
  code: string;
  kind: 'PERCENT' | 'FIXED';
  /** PERCENT: basis points (1000 = 10%). FIXED: pence. 0 = attribution only (e.g. a PTA code). */
  value: number;
  minSpendPence: number;
  /** Partner commission, basis points of the discounted ex-VAT eligible goods. */
  commissionBps: number;
}

export interface PromoLine {
  linePence: number; // VAT-inclusive line total (unit price × qty)
  /** Landed cost of the whole line, ex-VAT (unit cost × qty); null ⇒ unknown ⇒ ineligible. */
  lineCostPence: number | null;
}

export interface PromoEconomics {
  vatRate: number;
  stripePct: number;
  stripeFixedPence: number;
  /** Minimum contribution kept, as basis points of full-price ex-VAT eligible revenue. */
  floorBps: number;
}

export const PROMO_ECONOMICS: PromoEconomics = { vatRate: 0.2, stripePct: 0.015, stripeFixedPence: 20, floorBps: 1000 };

export type PromoOutcome =
  | {
      applied: true;
      /** Pence off the goods (VAT-inclusive). 0 for an attribution-only code. */
      discountPence: number;
      /** What the partner earns (pence) once the order is paid. Server-only. */
      commissionPence: number;
      /** The guard trimmed the discount or commission below the code's face value. */
      capped: boolean;
      /** The code's discount beat the other savings (which are therefore dropped). */
      replacesOtherSavings: boolean;
    }
  | { applied: false; reason: 'min-spend' | 'nothing-eligible' | 'better-saving-applied'; minSpendPence?: number };

/**
 * Evaluate a resolved rule against a priced basket.
 * @param otherSavingPence  the join + family-set savings the basket already earns.
 */
export function evaluatePromo(
  rule: PromoRule,
  lines: readonly PromoLine[],
  otherSavingPence: number,
  e: PromoEconomics = PROMO_ECONOMICS,
): PromoOutcome {
  const subtotal = lines.reduce((n, l) => n + l.linePence, 0);
  if (subtotal < rule.minSpendPence) return { applied: false, reason: 'min-spend', minSpendPence: rule.minSpendPence };

  const eligible = lines.filter((l) => l.lineCostPence !== null);
  const S = eligible.reduce((n, l) => n + l.linePence, 0); // eligible goods, VAT-inclusive
  const C = eligible.reduce((n, l) => n + (l.lineCostPence ?? 0), 0); // their landed cost
  if (S <= 0) return { applied: false, reason: 'nothing-eligible' };

  const wanted = rule.kind === 'PERCENT' ? Math.round((S * rule.value) / 10000) : Math.min(rule.value, S);
  const isAttributionOnly = wanted === 0;

  // Best single saving: a real discount must beat what the basket already gets.
  if (!isAttributionOnly && wanted <= otherSavingPence) return { applied: false, reason: 'better-saving-applied' };
  const baseSaving = isAttributionOnly ? otherSavingPence : 0; // attribution codes keep the other savings

  const exVat = (gross: number) => gross / (1 + e.vatRate);
  const floor = (exVat(S) * e.floorBps) / 10000;
  const c = rule.commissionBps / 10000;
  // Contribution of the eligible goods after a total saving T off them:
  //   x = S − T;  x/(1+v)·(1−c) − stripePct·x − stripeFixed − C   (commission on discounted ex-VAT)
  const contribution = (T: number, commissionRate: number) => {
    const x = S - T;
    return exVat(x) * (1 - commissionRate) - e.stripePct * x - e.stripeFixedPence - C;
  };

  let discount = isAttributionOnly ? 0 : wanted;
  let capped = false;
  // 1) cap the discount so contribution (with full commission) stays ≥ floor
  if (!isAttributionOnly && contribution(discount, c) < floor) {
    const k = (1 - c) / (1 + e.vatRate) - e.stripePct; // contribution per pence of x
    const xMin = k > 0 ? (floor + e.stripeFixedPence + C) / k : Infinity;
    discount = Math.max(0, Math.floor(S - xMin));
    capped = true;
    // Capped below what the basket already earns? Then the code isn't the better saving.
    if (discount <= otherSavingPence) return { applied: false, reason: 'better-saving-applied' };
  }
  // 2) commission on the discounted ex-VAT goods, capped so contribution never dips below floor
  const T = discount + baseSaving;
  let commission = Math.round(exVat(S - T) * c);
  const room = Math.floor(contribution(T, 0) - floor); // contribution with no commission, above floor
  if (commission > Math.max(0, room)) {
    commission = Math.max(0, room);
    capped = true;
  }
  if (!isAttributionOnly && discount === 0) return { applied: false, reason: 'nothing-eligible' };
  return { applied: true, discountPence: discount, commissionPence: commission, capped, replacesOtherSavings: discount > 0 };
}

/** Normalise what a customer typed: trim, upper-case, collapse spaces. */
export function normalisePromoCode(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
  return /^[A-Z0-9-]{3,32}$/.test(v) ? v : null;
}
