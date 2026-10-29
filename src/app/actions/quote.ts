'use server';

import { lineEconomics, multiBuyTiers, quote, type Quote, type RequestedLine } from '@/pricing';
import { isBundleKey } from '@/lib/christmas-bundle';
import { isCardPackKey } from '@/lib/card-packs';
import { pickAddOns, type AddOn } from '@/server/addOns';
import { getDb } from '@/db/client';
import { getCatalogue, loadCatalogue } from '@/server/catalogue';
import { resolveSessionJoinProvenance } from '@/server/joinProvenance';
import { resolvePromo } from '@/server/promos';
import { getCreditBalance } from '@/server/referrals';
import { getCurrentAccount } from '@/server/session';

/**
 * The authoritative basket quote. The client sends ONLY product keys + quantities
 * (and whether it's a gift); the server re-prices everything from the trusted
 * catalogue and decides — from server-resolved provenance, never the request —
 * whether the join saving applies. This is the seam that makes "never trust the
 * client for price / saving" real: a request can claim anything and still gets
 * charged the catalogue total.
 */
export interface QuoteRequest {
  /** `bundle`: the CHRISTMAS BUNDLE's drawings — its price is its size's variant (the key), never a figure. */
  items: { productKey: string; qty: number; bundle?: unknown }[];
  gift?: boolean;
  /** What the customer typed — resolved + priced server-side; its value is never trusted. */
  promoCode?: string;
}

/** The client's view of a quote: the partner commission is stripped (server-only). */
export type ClientQuote = Omit<Quote, 'partnerCommissionPence'> & {
  /** A code that couldn't be used at all (unknown / expired / used up / not started). */
  promoError?: 'unknown' | 'not-started' | 'expired' | 'used-up' | 'own-code' | 'first-order-only';
  /** Per priced line: its product's multi-buy tiers for 2, 3, 4, 5+ (basis points), from the SERVER's
   * live costs (src/pricing/multibuy.ts) — the basket's quantity dropdown labels its options with
   * them. All 0 = no offer. (The saving itself is only ever what the quote charges.) */
  lineTiers: number[][];
  /** Up to three things that go with the basket, not in it, with their real same-parcel saving (src/server/addOns.ts). */
  addOns: AddOn[];
};

export async function quoteBasket(req: QuoteRequest): Promise<ClientQuote> {
  const items: RequestedLine[] = (req.items ?? []).map((i) => ({
    productKey: String(i.productKey),
    qty: Number(i.qty),
    ...(i.bundle !== undefined ? { bundle: i.bundle } : {}),
  }));
  const joinProvenance = await resolveJoinProvenance();
  const db = getDb();
  const catalogue = await getCatalogue(db);
  const account = await getCurrentAccount();
  const resolved = req.promoCode
    ? await resolvePromo(db, req.promoCode, new Date(), account ? { accountId: account.id, email: account.email } : null)
    : null;
  const creditAvailablePence = account ? await getCreditBalance(db, account.id) : 0;
  const opts = { gift: req.gift ?? false, joinProvenance, catalogue, promo: resolved?.ok ? resolved.rule : null, creditAvailablePence };
  const { partnerCommissionPence: _hidden, ...q } = quote(items, opts);
  void _hidden;
  const lineTiers = q.lines.map((l) => (isBundleKey(l.productKey) || isCardPackKey(l.productKey) ? [0, 0, 0, 0] : multiBuyTiers(lineEconomics(catalogue, l.productKey))));
  const addOns = q.lines.length ? pickAddOns(await loadCatalogue(db), items, opts) : [];
  return resolved && !resolved.ok ? { ...q, lineTiers, addOns, promoError: resolved.reason } : { ...q, lineTiers, addOns };
}

/** The real, server-resolved join provenance (a joined member within their
 * invite window earns the 5%); never trusts the request. */
async function resolveJoinProvenance() {
  return resolveSessionJoinProvenance();
}
