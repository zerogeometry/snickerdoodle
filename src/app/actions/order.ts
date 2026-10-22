'use server';

import { getDb } from '@/db/client';
import { resolveSessionJoinProvenance } from '@/server/joinProvenance';
import { keepAndFileCreations } from '@/server/keepsakes';
import { placeOrder, type PlaceLine } from '@/server/orders';
import { resolvePromo } from '@/server/promos';
import { getCreditBalance } from '@/server/referrals';
import { getCurrentAccount, getUploadClaims } from '@/server/session';
import type { RawTransform } from '@/server/print/geometry';

/** Never more cards than the biggest pack could hold, whatever the request says. */
const MAX_PACK_CARDS = 20;

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
  items: {
    productKey: string;
    qty: number;
    artwork?: { assetId: string; transform: RawTransform; sourceObjectId?: string; back?: string; ground?: string; message?: unknown; cardImageSpan?: string };
    /** A card PACK line: its cards (which drawing + placement each). Count + price checked server-side. */
    cards?: { assetId: string; transform: RawTransform; sourceObjectId?: string }[];
  }[];
  gift?: boolean;
  subject?: string;
  /** What the customer typed; resolved + priced server-side. */
  promoCode?: string;
}): Promise<{ ok: boolean; needsAuth?: boolean; ref?: string; checkoutUrl?: string; reason?: 'too-small'; productKey?: string }> {
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
            ground: typeof i.artwork.ground === 'string' ? i.artwork.ground : undefined, // untrusted — normalised in placeOrder
            message: i.artwork.message, // untrusted — screened + normalised server-side in placeOrder
            cardImageSpan: typeof i.artwork.cardImageSpan === 'string' ? i.artwork.cardImageSpan : undefined,
          },
        }
      : {}),
    // Untrusted: only WHICH drawings. Capped well above the biggest pack; placeOrder checks the exact count.
    ...(Array.isArray(i.cards)
      ? {
          cards: i.cards.slice(0, MAX_PACK_CARDS).map((c) => ({
            assetId: String(c?.assetId),
            transform: c?.transform ?? {},
            sourceObjectId: typeof c?.sourceObjectId === 'string' ? c.sourceObjectId : undefined,
          })),
        }
      : {}),
  }));

  const account = await getCurrentAccount();
  const hasPersonalised = items.some((i) => i.artwork || i.cards?.length);
  // Personalised orders require the controlling parent — a guest signs up first.
  if (hasPersonalised && !account) return { ok: false, needsAuth: true };

  const db = getDb();

  // File the basket's creations into the family + under the child, so the
  // personalised lines reference real, controller-owned keepsakes (placeOrder requires it).
  if (account && hasPersonalised) {
    const claims = await getUploadClaims();
    const assetIds = [...new Set(items.flatMap((i) => [i.artwork?.assetId, ...(i.cards ?? []).map((c) => c.assetId)]).filter((x): x is string => !!x))];
    // Filed (so the order can print it) but NOT kept: after purchase the parent chooses —
    // keep it in their keepsake box, or have it erased as soon as the order ships.
    await keepAndFileCreations(db, account, claims, assetIds, input.subject, { keep: false });
  }

  const joinProvenance = account ? await resolveSessionJoinProvenance() : null;
  const resolved = input.promoCode
    ? await resolvePromo(db, input.promoCode, new Date(), account ? { accountId: account.id, email: account.email } : null)
    : null;
  const creditAvailablePence = account ? await getCreditBalance(db, account.id) : 0;
  try {
    const res = await placeOrder(db, {
      promo: resolved?.ok ? resolved.rule : null,
      creditAvailablePence,
      buyerEmail: account?.email ?? null,
      items,
      gift: input.gift ?? false,
      account: account ? { id: account.id } : null,
      joinProvenance,
    });
    if (!res.ok) return res.reason === 'too-small' ? { ok: false, reason: 'too-small', productKey: res.productKey } : { ok: false };
    return { ok: true, ref: res.ref, checkoutUrl: res.checkoutUrl };
  } catch {
    return { ok: false }; // e.g. a personalised line the buyer may not order
  }
}
