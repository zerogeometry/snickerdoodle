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
 *
 * A FREE_CARD code ("your first card's on us") takes ONE greetings card's price off — the cheapest
 * single card in the basket — or nothing: the guard never turns it into "£1.40 off a card". If giving
 * the card away would take the order under the floor, the code waits for a bigger basket.
 */

export type PromoKind = 'PERCENT' | 'FIXED' | 'FREE_CARD';
export type PartnerType = 'INFLUENCER' | 'PTA' | 'REFERRAL' | 'CAMPAIGN';

/**
 * WHO a code is for, in one place (founder, Oct 2026). A code is for the buyer's FIRST paid order
 * (by account, or a guest by email) when it's flagged so, when it's a free card, or when it's a
 * creator (INFLUENCER) or a friend's REFERRAL code — the follower's 10% is a welcome, not a standing
 * discount. A partner's commission accrues on the follower's first paid order only — exactly once,
 * settled when it's paid (src/server/promos.ts) — for every partner EXCEPT a school PTA, whose pitch
 * is "a share of every order" (briefs/DISCOUNTS.md). Nobody earns on, or saves with, their own code.
 */
export function codeTerms(c: { kind: PromoKind; partnerType: PartnerType | null; firstOrderOnly: boolean }): {
  firstOrderOnly: boolean;
  commissionFirstOrderOnly: boolean;
} {
  return {
    firstOrderOnly: c.firstOrderOnly || c.kind === 'FREE_CARD' || c.partnerType === 'INFLUENCER' || c.partnerType === 'REFERRAL',
    commissionFirstOrderOnly: c.partnerType !== 'PTA',
  };
}

export interface PromoRule {
  id: string;
  code: string;
  kind: PromoKind;
  /** PERCENT: basis points (1000 = 10%). FIXED: pence. 0 = attribution only (e.g. a PTA code).
   * FREE_CARD: unused (the card's own price comes off). */
  value: number;
  minSpendPence: number;
  /** Partner commission, basis points of the discounted ex-VAT eligible goods. */
  commissionBps: number;
}

export interface PromoLine {
  linePence: number; // VAT-inclusive line total (unit price × qty)
  /** Landed cost of the whole line, ex-VAT (unit cost × qty); null ⇒ unknown ⇒ ineligible. */
  lineCostPence: number | null;
  /** A single greetings card line: one card's price (what a FREE_CARD code takes off). Not a pack. */
  freeCardUnitPence?: number | null;
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
  | { applied: false; reason: PromoNotApplied; minSpendPence?: number };

/** Why a valid code didn't change this basket. `needs-card`: a free-card code with no single card in
 * it. `needs-more`: the free card would take the order under the margin floor — add something else. */
export type PromoNotApplied = 'min-spend' | 'nothing-eligible' | 'better-saving-applied' | 'needs-card' | 'needs-more';

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

  let wanted: number;
  if (rule.kind === 'FREE_CARD') {
    const cards = eligible.map((l) => l.freeCardUnitPence ?? 0).filter((p) => p > 0);
    if (cards.length === 0) return { applied: false, reason: 'needs-card' };
    wanted = Math.min(...cards); // ONE card — the cheapest, if they differ
  } else wanted = rule.kind === 'PERCENT' ? Math.round((S * rule.value) / 10000) : Math.min(rule.value, S);
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
  // 0) a free card is all or nothing: if the order can't carry the whole card (even with no
  //    commission), the code waits for a bigger basket — never a part-price card
  if (rule.kind === 'FREE_CARD' && contribution(discount, 0) < floor) return { applied: false, reason: 'needs-more' };
  // 1) cap the discount so contribution (with full commission) stays ≥ floor
  if (rule.kind !== 'FREE_CARD' && !isAttributionOnly && contribution(discount, c) < floor) {
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
