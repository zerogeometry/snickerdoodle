'use server';

import { getDb } from '@/db/client';
import { resolveSessionJoinProvenance } from '@/server/joinProvenance';
import { placeOrder } from '@/server/orders';
import { getCurrentAccount } from '@/server/session';

/**
 * Place an order from the client's basket. Only product keys + quantities (and
 * the gift flag) cross the wire; the buyer and their join provenance are resolved
 * here from the session, and the server prices it authoritatively. Returns a
 * Stripe Checkout URL when configured, otherwise a placed-order ref (dev).
 */
export async function placeOrderAction(input: {
  items: { productKey: string; qty: number }[];
  gift?: boolean;
}): Promise<{ ok: boolean; ref?: string; checkoutUrl?: string }> {
  const items = (input.items ?? []).map((i) => ({ productKey: String(i.productKey), qty: Number(i.qty) }));
  const account = await getCurrentAccount();
  const joinProvenance = account ? await resolveSessionJoinProvenance() : null;

  const res = await placeOrder(getDb(), {
    items,
    gift: input.gift ?? false,
    account: account ? { id: account.id } : null,
    joinProvenance,
  });
  if (!res.ok) return { ok: false };
  return { ok: true, ref: res.ref, checkoutUrl: res.checkoutUrl };
}
