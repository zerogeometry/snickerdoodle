import { CATALOGUE, DELIVERY_PENCE, FAMILY_SET_MIN_QTY, FAMILY_SET_SAVING_BPS, isFamilySetKey, type PricedCatalogue } from './catalogue';
import { resolveJoinContext, type JoinContext, type JoinProvenance } from './joinContext';
import { formatPence } from './format';
import { evaluatePromo, type PromoRule } from './promo';
import { isCardPackKey } from '@/lib/card-packs';

/** What the client is allowed to send: a product key + a quantity. No prices. */
export interface RequestedLine {
  productKey: string;
  qty: number;
}

export interface PricedLine {
  productKey: string;
  label: string;
  unitPricePence: number;
  qty: number;
  linePence: number;
}


export interface Quote {
  lines: PricedLine[];
  subtotalPence: number;
  deliveryPence: number;
  joinSavingPence: number;
  /** The family-set saving: 5% off garment lines when 3+ garments ship together. */
  familySetSavingPence: number;
  totalPence: number;
  gift: boolean;
  joinSavingApplied: boolean;
  familySetApplied: boolean;
  /** Client-supplied keys we don't sell — dropped, never priced, surfaced for honesty. */
  rejectedKeys: string[];
  /** Pence a promo code took off the goods (0 if none / not used). */
  promoSavingPence: number;
  /** What happened to the code the customer entered (null if none). Safe to show. */
  promo: null | { code: string; applied: boolean; reason?: 'min-spend' | 'nothing-eligible' | 'better-saving-applied'; minSpendPence?: number; capped?: boolean };
  /** SERVER-ONLY: what the code's partner earns. Strip before returning to a client. */
  partnerCommissionPence: number;
  /** Account credit (e.g. referral rewards) applied to this order. */
  creditPence: number;
}

/** A card charge can't be tiny — credit always leaves at least this much to pay. */
export const MIN_CHARGE_PENCE = 50;

/** How much of an account's credit an order can use: all of it, but never below the minimum charge. */
export function applicableCredit(totalBeforeCreditPence: number, availablePence: number): number {
  if (!(availablePence > 0)) return 0;
  return Math.max(0, Math.min(Math.floor(availablePence), totalBeforeCreditPence - MIN_CHARGE_PENCE));
}

const MAX_QTY = 99;

export function clampQty(qty: number): number {
  if (!Number.isFinite(qty)) return 0;
  const n = Math.floor(qty);
  if (n <= 0) return 0;
  return Math.min(n, MAX_QTY);
}

/** Is this client-supplied key something the given catalogue sells? */
export function inCatalogue(catalogue: PricedCatalogue, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(catalogue, key);
}

/** Basis-points of an amount, rounded to the nearest penny. */
function bpsOf(amountPence: number, bps: number): number {
  return Math.round((amountPence * bps) / 10000);
}

export interface PriceOpts {
  gift?: boolean;
  /** The ONLY way to grant the join saving. Must come from {@link resolveJoinContext}. */
  joinContext?: JoinContext | null;
  /** Override delivery (e.g. a future free-over-threshold rule). Defaults to standard. */
  deliveryPence?: number;
  /** The price list to price against — the server passes the DB-loaded one; defaults
   * to the static catalogue. The client never supplies it. */
  catalogue?: PricedCatalogue;
  /** A code the SERVER resolved + validated (never a client-built object). */
  promo?: PromoRule | null;
  /** The buyer's credit balance, resolved SERVER-side from the ledger (never the client). */
  creditAvailablePence?: number;
}

/**
 * Price a basket authoritatively. Every unit price comes from the server
 * {@link CATALOGUE}; anything the client claims about price is ignored. The join
 * saving is applied to goods (never delivery) and ONLY when a server-minted
 * {@link JoinContext} is present.
 */
export function priceBasket(requested: readonly RequestedLine[], opts: PriceOpts = {}): Quote {
  const gift = opts.gift ?? false;
  const catalogue: PricedCatalogue = opts.catalogue ?? CATALOGUE;
  const lines: PricedLine[] = [];
  const rejectedKeys: string[] = [];

  for (const r of requested) {
    if (!inCatalogue(catalogue, r.productKey)) {
      rejectedKeys.push(r.productKey);
      continue;
    }
    // A card PACK line is always ONE pack — its N cards ride with it (src/lib/card-packs.ts), so a
    // client asking for "qty 3" of a pack can't get three packs' worth of cards for one pack's price.
    const qty = isCardPackKey(r.productKey) ? Math.min(1, clampQty(r.qty)) : clampQty(r.qty);
    if (qty <= 0) continue;
    const entry = catalogue[r.productKey]!;
    const unit = entry.pricePence; // SERVER price — request price (if any) ignored
    lines.push({
      productKey: r.productKey,
      label: entry.label,
      unitPricePence: unit,
      qty,
      linePence: unit * qty,
    });
  }

  const subtotalPence = lines.reduce((n, l) => n + l.linePence, 0);
  const deliveryPence = lines.length > 0 ? (opts.deliveryPence ?? DELIVERY_PENCE) : 0;

  const ctx = opts.joinContext ?? null;
  const joinSavingApplied = ctx !== null && subtotalPence > 0;
  // Clamp defensively: a saving can never exceed the goods it discounts, and a
  // total can never go negative — true no matter what savingBps or delivery
  // override is handed in server-side.
  const joinSavingPence = joinSavingApplied ? Math.min(bpsOf(subtotalPence, ctx.savingBps), subtotalPence) : 0;

  // Family-set saving: resolved from the priced lines alone (keys + quantities) —
  // there is NO client flag to forge. 3+ garments in one order ship as one
  // consignment, and 5% of the garment lines goes back to the customer.
  const garmentLines = lines.filter((l) => isFamilySetKey(l.productKey));
  const garmentQty = garmentLines.reduce((n, l) => n + l.qty, 0);
  const garmentPence = garmentLines.reduce((n, l) => n + l.linePence, 0);
  const familySetApplied = garmentQty >= FAMILY_SET_MIN_QTY && garmentPence > 0;
  const familySetSavingPence = familySetApplied
    ? Math.min(bpsOf(garmentPence, FAMILY_SET_SAVING_BPS), garmentPence, subtotalPence - joinSavingPence)
    : 0;

  // Promo code — best single saving, margin-guarded (src/pricing/promo.ts).
  let promoSavingPence = 0;
  let partnerCommissionPence = 0;
  let promo: Quote['promo'] = null;
  let finalJoin = joinSavingPence;
  let finalSet = familySetSavingPence;
  if (opts.promo && lines.length > 0) {
    const outcome = evaluatePromo(
      opts.promo,
      lines.map((l) => {
        const cost = catalogue[l.productKey]?.unitCostPence;
        return { linePence: l.linePence, lineCostPence: typeof cost === 'number' ? cost * l.qty : null };
      }),
      joinSavingPence + familySetSavingPence,
    );
    if (outcome.applied) {
      promoSavingPence = outcome.discountPence;
      partnerCommissionPence = outcome.commissionPence;
      if (outcome.replacesOtherSavings) {
        finalJoin = 0;
        finalSet = 0;
      }
      promo = { code: opts.promo.code, applied: true, capped: outcome.capped };
    } else {
      promo = { code: opts.promo.code, applied: false, reason: outcome.reason, minSpendPence: outcome.minSpendPence };
    }
  }

  const beforeCredit = Math.max(0, subtotalPence - finalJoin - finalSet - promoSavingPence + deliveryPence);
  const creditPence = lines.length > 0 ? applicableCredit(beforeCredit, opts.creditAvailablePence ?? 0) : 0;
  const totalPence = beforeCredit - creditPence;

  return {
    lines,
    subtotalPence,
    deliveryPence,
    joinSavingPence: finalJoin,
    familySetSavingPence: finalSet,
    totalPence,
    gift,
    joinSavingApplied: joinSavingApplied && finalJoin > 0,
    familySetApplied: familySetApplied && finalSet > 0,
    rejectedKeys,
    promoSavingPence,
    promo,
    partnerCommissionPence,
    creditPence,
  };
}

/**
 * The full client→quote path: resolves the join context from server-resolved
 * provenance (never from the client), then prices. The server action calls this.
 */
export function quote(
  requested: readonly RequestedLine[],
  opts: { gift?: boolean; joinProvenance?: JoinProvenance | null; catalogue?: PricedCatalogue; promo?: PromoRule | null; creditAvailablePence?: number } = {},
): Quote {
  const joinContext = opts.joinProvenance ? resolveJoinContext(opts.joinProvenance) : null;
  return priceBasket(requested, { gift: opts.gift, joinContext, catalogue: opts.catalogue, promo: opts.promo ?? null, creditAvailablePence: opts.creditAvailablePence ?? 0 });
}

/**
 * What a line shows to a GIFT RECIPIENT: prices are tucked away on the gift /
 * packing slip when it's a gift (the payer's totals are unaffected — they still
 * pay the real amount).
 */
export function recipientLineLabel(line: PricedLine, gift: boolean): string {
  return gift ? 'gift' : formatPence(line.linePence);
}
