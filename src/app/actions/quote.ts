'use server';

import { quote, type Quote, type RequestedLine } from '@/pricing';
import type { JoinProvenance } from '@/pricing';

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

/**
 * Resolves the real join provenance from the session + DB. Until auth and the
 * invite/membership flow are wired, there is no verified join server-side, so
 * this returns null (guest) and the join saving correctly never applies live —
 * the engine's join logic is exhaustively unit-tested and ready to light up the
 * moment auth lands. Wiring a client-trusted shortcut here would break a
 * non-negotiable, so we don't.
 */
async function resolveJoinProvenance(): Promise<JoinProvenance | null> {
  return null;
}
