import { CATALOGUE, DELIVERY_PENCE, isCatalogueKey, priceOf, type CatalogueKey } from './catalogue';
import { resolveJoinContext, type JoinContext, type JoinProvenance } from './joinContext';
import { formatPence } from './format';

/** What the client is allowed to send: a product key + a quantity. No prices. */
export interface RequestedLine {
  productKey: string;
  qty: number;
}

export interface PricedLine {
  productKey: CatalogueKey;
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
  totalPence: number;
  gift: boolean;
  joinSavingApplied: boolean;
  /** Client-supplied keys we don't sell — dropped, never priced, surfaced for honesty. */
  rejectedKeys: string[];
}

const MAX_QTY = 99;

function clampQty(qty: number): number {
  if (!Number.isFinite(qty)) return 0;
  const n = Math.floor(qty);
  if (n <= 0) return 0;
  return Math.min(n, MAX_QTY);
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
}

/**
 * Price a basket authoritatively. Every unit price comes from the server
 * {@link CATALOGUE}; anything the client claims about price is ignored. The join
 * saving is applied to goods (never delivery) and ONLY when a server-minted
 * {@link JoinContext} is present.
 */
export function priceBasket(requested: readonly RequestedLine[], opts: PriceOpts = {}): Quote {
  const gift = opts.gift ?? false;
  const lines: PricedLine[] = [];
  const rejectedKeys: string[] = [];

  for (const r of requested) {
    if (!isCatalogueKey(r.productKey)) {
      rejectedKeys.push(r.productKey);
      continue;
    }
    const qty = clampQty(r.qty);
    if (qty <= 0) continue;
    const unit = priceOf(r.productKey); // SERVER price — request price (if any) ignored
    lines.push({
      productKey: r.productKey,
      label: CATALOGUE[r.productKey].label,
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

  const totalPence = Math.max(0, subtotalPence - joinSavingPence + deliveryPence);

  return {
    lines,
    subtotalPence,
    deliveryPence,
    joinSavingPence,
    totalPence,
    gift,
    joinSavingApplied,
    rejectedKeys,
  };
}

/**
 * The full client→quote path: resolves the join context from server-resolved
 * provenance (never from the client), then prices. The server action calls this.
 */
export function quote(
  requested: readonly RequestedLine[],
  opts: { gift?: boolean; joinProvenance?: JoinProvenance | null } = {},
): Quote {
  const joinContext = opts.joinProvenance ? resolveJoinContext(opts.joinProvenance) : null;
  return priceBasket(requested, { gift: opts.gift, joinContext });
}

/**
 * What a line shows to a GIFT RECIPIENT: prices are tucked away on the gift /
 * packing slip when it's a gift (the payer's totals are unaffected — they still
 * pay the real amount).
 */
export function recipientLineLabel(line: PricedLine, gift: boolean): string {
  return gift ? 'gift' : formatPence(line.linePence);
}
