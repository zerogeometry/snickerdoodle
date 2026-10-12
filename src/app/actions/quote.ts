'use server';

import { quote, type Quote, type RequestedLine } from '@/pricing';
import { getDb } from '@/db/client';
import { getCatalogue } from '@/server/catalogue';
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
  items: { productKey: string; qty: number }[];
  gift?: boolean;
  /** What the customer typed — resolved + priced server-side; its value is never trusted. */
  promoCode?: string;
}

/** The client's view of a quote: the partner commission is stripped (server-only). */
export type ClientQuote = Omit<Quote, 'partnerCommissionPence'> & {
  /** A code that couldn't be used at all (unknown / expired / used up / not started). */
  promoError?: 'unknown' | 'not-started' | 'expired' | 'used-up' | 'own-code' | 'first-order-only';
};

export async function quoteBasket(req: QuoteRequest): Promise<ClientQuote> {
  const items: RequestedLine[] = (req.items ?? []).map((i) => ({
    productKey: String(i.productKey),
    qty: Number(i.qty),
  }));
  const joinProvenance = await resolveJoinProvenance();
  const db = getDb();
  const catalogue = await getCatalogue(db);
  const account = await getCurrentAccount();
  const resolved = req.promoCode
    ? await resolvePromo(db, req.promoCode, new Date(), account ? { accountId: account.id, email: account.email } : null)
    : null;
  const creditAvailablePence = account ? await getCreditBalance(db, account.id) : 0;
  const { partnerCommissionPence: _hidden, ...q } = quote(items, {
    gift: req.gift ?? false,
    joinProvenance,
    catalogue,
    promo: resolved?.ok ? resolved.rule : null,
    creditAvailablePence,
  });
  void _hidden;
  return resolved && !resolved.ok ? { ...q, promoError: resolved.reason } : q;
}

/** The real, server-resolved join provenance (a joined member within their
 * invite window earns the 5%); never trusts the request. */
async function resolveJoinProvenance() {
  return resolveSessionJoinProvenance();
}
