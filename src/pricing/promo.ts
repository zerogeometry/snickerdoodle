/**
 * Promo / partner codes — PURE pricing (no I/O), so the money rules are unit-tested.
 *
 * The client sends a code STRING; the server resolves it to a {@link PromoRule} and this module
 * decides what it's worth. Three rules keep a code from ever selling at a loss:
 *
 *  1. MINIMUM SPEND — FIXED vouchers (£5 / £10) only on baskets big enough to carry them.
 *  2. BEST SINGLE SAVING — a code never stacks with the family-set / multi-buy / same-parcel
 *     savings; the customer gets whichever is bigger (generous AND margin-safe).
 *  3. MARGIN GUARD — whatever happens, the order keeps at least `floorBps` of its full-price
 *     ex-VAT goods revenue as contribution (after product + delivery cost, card fees, the
 *     discount AND any partner commission). The discount is capped first, then the commission.
 *
 * Lines whose unit cost is unknown are left out of the code entirely (never discounted).
 *
 * A FREE_CARD code ("your first card's on us") takes ONE greetings card's price off — the cheapest
 * single card in the basket — or nothing: the guard never turns it into "£1.40 off a card". If giving
 * the card away would take the order under the floor, the code waits for a bigger basket.
 *
 * THE FREE CARD IS THE ONE WELCOME (founder, 17 Nov 2026): one greetings card free on a signed-in
 * buyer's FIRST paid order — and nothing else (the 5% join saving and the parents' "give £5, get £5"
 * referral codes are retired). The caller says, server-side, whether this buyer may have it
 * (`cardEligible`); the shop's own FIRSTCARD code gives it automatically (src/server/promos.ts).
 * A PARTNER code (a creator, a school PTA, or our own campaign) is a free-card code too: when the card
 * can't come off — not a signed-in first order, no single card in the basket, or too small a basket —
 * the code still counts as an attribution code, so the partner's commission and the order's tag stand.
 */

export type PromoKind = 'PERCENT' | 'FIXED' | 'FREE_CARD';
export type PartnerType = 'INFLUENCER' | 'PTA' | 'REFERRAL' | 'CAMPAIGN';

/**
 * WHO a code is for, in one place (founder, Oct 2026; free card 17 Nov 2026). A code is for the
 * buyer's FIRST paid order (by account, or a guest by email) when it's flagged so, or when it's a
 * creator (INFLUENCER) code. A free-card code isn't first-order-only as a CODE (a school's code keeps
 * tagging a family's later orders); the CARD itself only ever comes off a signed-in first order
 * (`cardEligible`, decided by the server). A partner's commission accrues on the follower's first
 * paid order only — exactly once, settled when it's paid (src/server/promos.ts) — for every partner
 * EXCEPT a school PTA, whose pitch is "a share of every order" (briefs/DISCOUNTS.md). Nobody earns
 * on, or saves with, their own code. (REFERRAL codes are retired: resolvePromo refuses them.)
 */
export function codeTerms(c: { kind: PromoKind; partnerType: PartnerType | null; firstOrderOnly: boolean }): {
  firstOrderOnly: boolean;
  commissionFirstOrderOnly: boolean;
} {
  return {
    firstOrderOnly: c.firstOrderOnly || c.partnerType === 'INFLUENCER' || c.partnerType === 'REFERRAL',
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
      /** A partner's free-card code that applied as attribution only: why its card didn't come off. */
      cardReason?: CardNotApplied;
    }
  | { applied: false; reason: PromoNotApplied; minSpendPence?: number };

/** Why a free card didn't come off. `needs-card`: no single greetings card in the basket.
 * `needs-more`: the free card would take the order under the margin floor — add something else.
 * `first-order-card`: the card is for a signed-in buyer's first order, and this isn't one.
 * `better-saving-applied`: the basket already earns a bigger saving. */
export type CardNotApplied = 'needs-card' | 'needs-more' | 'first-order-card' | 'better-saving-applied';
/** Why a valid code didn't change this basket. */
export type PromoNotApplied = 'min-spend' | 'nothing-eligible' | CardNotApplied;

/**
 * Evaluate a resolved rule against a priced basket.
 * @param otherSavingPence  the family-set / multi-buy / same-parcel savings the basket already earns.
 * @param opts.cardEligible  SERVER-decided: may this buyer have the free card (a signed-in first order)?
 *   Fail-closed: absent ⇒ no free card.
 */
export function evaluatePromo(
  rule: PromoRule,
  lines: readonly PromoLine[],
  otherSavingPence: number,
  e: PromoEconomics = PROMO_ECONOMICS,
  opts: { cardEligible?: boolean } = {},
): PromoOutcome {
  const subtotal = lines.reduce((n, l) => n + l.linePence, 0);
  if (subtotal < rule.minSpendPence) return { applied: false, reason: 'min-spend', minSpendPence: rule.minSpendPence };

  const eligible = lines.filter((l) => l.lineCostPence !== null);
  const S = eligible.reduce((n, l) => n + l.linePence, 0); // eligible goods, VAT-inclusive
  const C = eligible.reduce((n, l) => n + (l.lineCostPence ?? 0), 0); // their landed cost
  if (S <= 0) return { applied: false, reason: 'nothing-eligible' };

  const exVat = (gross: number) => gross / (1 + e.vatRate);
  const floor = (exVat(S) * e.floorBps) / 10000;
  const c = rule.commissionBps / 10000;
  // Contribution of the eligible goods after a total saving T off them:
  //   x = S − T;  x/(1+v)·(1−c) − stripePct·x − stripeFixed − C   (commission on discounted ex-VAT)
  const contribution = (T: number, commissionRate: number) => {
    const x = S - T;
    return exVat(x) * (1 - commissionRate) - e.stripePct * x - e.stripeFixedPence - C;
  };

  let wanted: number;
  let cardReason: CardNotApplied | undefined;
  if (rule.kind === 'FREE_CARD') {
    const cards = eligible.map((l) => l.freeCardUnitPence ?? 0).filter((p) => p > 0);
    const card = cards.length ? Math.min(...cards) : 0; // ONE card — the cheapest, if they differ
    if (!opts.cardEligible) cardReason = 'first-order-card';
    else if (card === 0) cardReason = 'needs-card';
    else if (card <= otherSavingPence) cardReason = 'better-saving-applied';
    // a free card is all or nothing: if the order can't carry the whole card (even with no
    // commission), it waits for a bigger basket — never a part-price card
    else if (contribution(card, 0) < floor) cardReason = 'needs-more';
    // the card can't come off: a partner's code still tags the order (attribution only, so the
    // commission stands); the shop's own free-card code just doesn't apply
    if (cardReason && rule.commissionBps <= 0) return { applied: false, reason: cardReason };
    wanted = cardReason ? 0 : card;
  } else wanted = rule.kind === 'PERCENT' ? Math.round((S * rule.value) / 10000) : Math.min(rule.value, S);
  const isAttributionOnly = wanted === 0;

  // Best single saving: a real discount must beat what the basket already gets.
  if (!isAttributionOnly && wanted <= otherSavingPence) return { applied: false, reason: 'better-saving-applied' };
  const baseSaving = isAttributionOnly ? otherSavingPence : 0; // attribution codes keep the other savings

  let discount = isAttributionOnly ? 0 : wanted;
  let capped = false;
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
  return { applied: true, discountPence: discount, commissionPence: commission, capped, replacesOtherSavings: discount > 0, ...(cardReason ? { cardReason } : {}) };
}

/** Normalise what a customer typed: trim, upper-case, collapse spaces. */
export function normalisePromoCode(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
  return /^[A-Z0-9-]{3,32}$/.test(v) ? v : null;
}
