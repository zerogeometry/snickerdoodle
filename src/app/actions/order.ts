'use server';

import { getDb } from '@/db/client';
import { resolveSessionJoinProvenance } from '@/server/joinProvenance';
import { keepAndFileCreations } from '@/server/keepsakes';
import { placeOrder, type PlaceLine } from '@/server/orders';
import { getCurrentAccount, getUploadClaims } from '@/server/session';
import type { RawTransform } from '@/server/print/geometry';

/**
 * Place an order from the client's basket. The client sends product keys +
 * quantities and (for a personalised line) the keepsake + its placement; the
 * buyer, join provenance, price, variant, print geometry and clamped transform
 * are ALL resolved/frozen server-side. Returns a Stripe Checkout URL when
 * configured, otherwise a placed-order ref (dev).
 *
 * A PERSONALISED line needs an account (the controlling parent): a guest is told to
 * sign up first (needsAuth). For a signed-in buyer the basket's ephemeral drafts are
 * KEPT into their family and filed under the child subject before the order — so the
 * keepsake is real + controller-owned + grows the child's corner of the home.
 */
export async function placeOrderAction(input: {
  items: { productKey: string; qty: number; artwork?: { assetId: string; transform: RawTransform; sourceObjectId?: string; back?: string; message?: unknown } }[];
  gift?: boolean;
  subject?: string;
}): Promise<{ ok: boolean; needsAuth?: boolean; ref?: string; checkoutUrl?: string }> {
  const items: PlaceLine[] = (input.items ?? []).map((i) => ({
    productKey: String(i.productKey),
    qty: Number(i.qty),
    ...(i.artwork
      ? {
          artwork: {
            assetId: String(i.artwork.assetId),
            transform: i.artwork.transform,
            sourceObjectId: i.artwork.sourceObjectId,
            back: typeof i.artwork.back === 'string' ? i.artwork.back : undefined,
            message: i.artwork.message, // untrusted — screened + normalised server-side in placeOrder
          },
        }
      : {}),
  }));

  const account = await getCurrentAccount();
  const hasPersonalised = items.some((i) => i.artwork);
  // Personalised orders require the controlling parent — a guest signs up first.
  if (hasPersonalised && !account) return { ok: false, needsAuth: true };

  const db = getDb();

  // Keep the basket's creations into the family + file them under the child, so the
  // personalised lines reference real, controller-owned keepsakes (placeOrder requires it).
  if (account && hasPersonalised) {
    const claims = await getUploadClaims();
    const assetIds = items.map((i) => i.artwork?.assetId).filter((x): x is string => !!x);
    await keepAndFileCreations(db, account, claims, assetIds, input.subject);
  }

  const joinProvenance = account ? await resolveSessionJoinProvenance() : null;
  try {
    const res = await placeOrder(db, {
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
