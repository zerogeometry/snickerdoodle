'use server';

import { getDb } from '@/db/client';
import { resolveSessionJoinProvenance } from '@/server/joinProvenance';
import { placeOrder, type PlaceLine } from '@/server/orders';
import { getCurrentAccount } from '@/server/session';
import type { RawTransform } from '@/server/print/geometry';

/**
 * Place an order from the client's basket. The client sends product keys +
 * quantities and (for a personalised line) the keepsake + its placement; the
 * buyer, join provenance, price, variant, print geometry and clamped transform
 * are ALL resolved/frozen server-side. Returns a Stripe Checkout URL when
 * configured, otherwise a placed-order ref (dev).
 */
export async function placeOrderAction(input: {
  items: { productKey: string; qty: number; artwork?: { assetId: string; transform: RawTransform } }[];
  gift?: boolean;
}): Promise<{ ok: boolean; ref?: string; checkoutUrl?: string }> {
  const items: PlaceLine[] = (input.items ?? []).map((i) => ({
    productKey: String(i.productKey),
    qty: Number(i.qty),
    ...(i.artwork ? { artwork: { assetId: String(i.artwork.assetId), transform: i.artwork.transform } } : {}),
  }));
  const account = await getCurrentAccount();
  const joinProvenance = account ? await resolveSessionJoinProvenance() : null;

  try {
    const res = await placeOrder(getDb(), {
      items,
      gift: input.gift ?? false,
      account: account ? { id: account.id } : null,
      joinProvenance,
    });
    if (!res.ok) return { ok: false };
    return { ok: true, ref: res.ref, checkoutUrl: res.checkoutUrl };
  } catch {
    return { ok: false }; // e.g. a personalised line the buyer may not order
  }
}
