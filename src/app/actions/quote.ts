'use server';

import { quote, type Quote, type RequestedLine } from '@/pricing';
import { resolveSessionJoinProvenance } from '@/server/joinProvenance';

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
}

export async function quoteBasket(req: QuoteRequest): Promise<Quote> {
  const items: RequestedLine[] = (req.items ?? []).map((i) => ({
    productKey: String(i.productKey),
    qty: Number(i.qty),
  }));
  const joinProvenance = await resolveJoinProvenance();
  return quote(items, { gift: req.gift ?? false, joinProvenance });
}

/** The real, server-resolved join provenance (a joined member within their
 * invite window earns the 5%); never trusts the request. */
async function resolveJoinProvenance() {
  return resolveSessionJoinProvenance();
}
