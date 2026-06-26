import { randomBytes } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { memberships, orderItems, orders } from '@/db/schema';
import { createCheckoutSession, isStripeConfigured } from '@/payments/stripe';
import { quote, type JoinProvenance, type RequestedLine } from '@/pricing';
import type { DbHandle } from './db';

function newRef(): string {
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return `SNK-${n.toString().padStart(6, '0')}`;
}

export interface PlaceOrderResult {
  ok: boolean;
  reason?: 'empty';
  ref?: string;
  checkoutUrl?: string;
}

/**
 * Place an order. The total is computed SERVER-SIDE from the catalogue + the
 * account's real join provenance — the client's items are just keys + quantities.
 * With Stripe configured we return a Checkout URL (the webhook later marks it
 * paid); without it (local dev) we mark it paid immediately so the loop is
 * walkable. Card data never touches our server either way.
 */
export async function placeOrder(
  db: DbHandle,
  input: {
    items: RequestedLine[];
    gift?: boolean;
    /** The buyer (null for a guest) and their server-resolved join provenance —
     * resolved by the caller (the action) from the session, never the request. */
    account: { id: string } | null;
    joinProvenance: JoinProvenance | null;
  },
): Promise<PlaceOrderResult> {
  const { account, joinProvenance } = input;
  const q = quote(input.items, { gift: input.gift, joinProvenance });
  if (q.lines.length === 0) return { ok: false, reason: 'empty' };

  const ref = newRef();
  const [order] = await db
    .insert(orders)
    .values({
      ref,
      accountId: account?.id ?? null,
      status: 'PENDING',
      subtotalPence: q.subtotalPence,
      deliveryPence: q.deliveryPence,
      joinSavingPence: q.joinSavingPence,
      totalPence: q.totalPence,
      isGift: q.gift,
    })
    .returning();
  await db.insert(orderItems).values(
    q.lines.map((l) => ({
      orderId: order!.id,
      productKey: l.productKey,
      qty: l.qty,
      unitPricePence: l.unitPricePence,
      linePence: l.linePence,
    })),
  );

  if (isStripeConfigured()) {
    const session = await createCheckoutSession({
      ref,
      lines: q.lines,
      deliveryPence: q.deliveryPence,
      joinSavingPence: q.joinSavingPence,
    });
    await db.update(orders).set({ stripeSessionId: session.id }).where(eq(orders.id, order!.id));
    return { ok: true, ref, checkoutUrl: session.url ?? undefined };
  }

  await markOrderPaid(db, order!.id); // dev fallback
  return { ok: true, ref };
}

/** Mark an order paid — idempotent (only PENDING→PAID) — and spend the one-time join saving. */
export async function markOrderPaid(db: DbHandle, orderId: string): Promise<void> {
  const [updated] = await db
    .update(orders)
    .set({ status: 'PAID', paidAt: new Date() })
    .where(and(eq(orders.id, orderId), eq(orders.status, 'PENDING')))
    .returning();
  if (!updated) return; // already paid / unknown → no-op (idempotent)
  if (updated.joinSavingPence > 0 && updated.accountId) {
    await consumeJoinSaving(db, updated.accountId);
  }
}

async function consumeJoinSaving(db: DbHandle, accountId: string): Promise<void> {
  const [m] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.accountId, accountId),
        eq(memberships.status, 'ACTIVE'),
        eq(memberships.isOwner, false),
        isNull(memberships.joinSavingConsumedAt),
      ),
    )
    .orderBy(desc(memberships.joinedAt))
    .limit(1);
  if (m) await db.update(memberships).set({ joinSavingConsumedAt: new Date() }).where(eq(memberships.id, m.id));
}

export interface OrderSummary {
  ref: string;
  status: string;
  totalPence: number;
  createdAtISO: string;
  items: { productKey: string; qty: number; linePence: number }[];
}

export async function getOrdersForAccount(db: DbHandle, accountId: string): Promise<OrderSummary[]> {
  const rows = await db.select().from(orders).where(eq(orders.accountId, accountId)).orderBy(desc(orders.createdAt));
  const result: OrderSummary[] = [];
  for (const o of rows) {
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id));
    result.push({
      ref: o.ref,
      status: o.status,
      totalPence: o.totalPence,
      createdAtISO: o.createdAt.toISOString(),
      items: items.map((i) => ({ productKey: i.productKey, qty: i.qty, linePence: i.linePence })),
    });
  }
  return result;
}
