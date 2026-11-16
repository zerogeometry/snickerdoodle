import type Stripe from 'stripe';
import { and, eq, isNull } from 'drizzle-orm';
import { orders } from '@/db/schema';
import type { DbHandle } from '@/server/db';
import { getStripe, isStripeConfigured } from './stripe';

/**
 * Money going back to a customer (the admin app, 16 Nov 2026): refunds and chargebacks made in Stripe are
 * recorded on the order, so the team sees them and a refunded order never prints. Before this the site only
 * listened for "paid" and "checkout expired", so a refund left the order PAID and on its way to Prodigi.
 */

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === 'string' ? v : (v?.id ?? null));

/** The order a Stripe payment belongs to: by the payment id saved when it was paid, else (orders paid before
 * that was saved) by asking Stripe which checkout session the payment came from. */
export async function orderForPayment(db: DbHandle, paymentIntent: string | null): Promise<{ id: string; ref: string; status: string; prodigiOrderId: string | null } | null> {
  if (!paymentIntent) return null;
  const cols = { id: orders.id, ref: orders.ref, status: orders.status, prodigiOrderId: orders.prodigiOrderId };
  const [byIntent] = await db.select(cols).from(orders).where(eq(orders.stripePaymentIntent, paymentIntent));
  if (byIntent) return byIntent;
  if (!isStripeConfigured()) return null;
  try {
    const sessions = await getStripe().checkout.sessions.list({ payment_intent: paymentIntent, limit: 1 });
    const session = sessions.data[0];
    if (!session?.id) return null;
    const [bySession] = await db.select(cols).from(orders).where(eq(orders.stripeSessionId, session.id));
    if (!bySession) return null;
    await db.update(orders).set({ stripePaymentIntent: paymentIntent }).where(and(eq(orders.id, bySession.id), isNull(orders.stripePaymentIntent)));
    return bySession;
  } catch (e) {
    console.error('[payments] could not find the order for a payment:', e instanceof Error ? e.message : 'unknown');
    return null;
  }
}

/**
 * A refund (charge.refunded, sent for every refund with Stripe's running total). Records the amount; a FULL
 * refund of an order that hasn't reached Prodigi cancels it on the spot, so the fulfilment tick never takes it.
 * One already at (or being handed to) Prodigi stays as it is: the admin app shows it with "cancel at Prodigi".
 */
export async function recordRefund(db: DbHandle, charge: Pick<Stripe.Charge, 'payment_intent' | 'amount' | 'amount_refunded' | 'refunded'>, now = new Date()): Promise<{ ref: string; cancelled: boolean } | null> {
  const order = await orderForPayment(db, idOf(charge.payment_intent));
  if (!order) return null;
  await db.update(orders).set({ refundedPence: charge.amount_refunded, refundedAt: now }).where(eq(orders.id, order.id));
  const full = charge.refunded || charge.amount_refunded >= charge.amount;
  if (!full) return { ref: order.ref, cancelled: false };
  // only an order nobody has started handing to Prodigi: PAID, no Prodigi order (the claim flips PAID → FULFILLING)
  const stopped = await db
    .update(orders)
    .set({ status: 'CANCELLED' })
    .where(and(eq(orders.id, order.id), eq(orders.status, 'PAID'), isNull(orders.prodigiOrderId)))
    .returning({ id: orders.id });
  return { ref: order.ref, cancelled: stopped.length > 0 };
}

/** A chargeback opened, changed or closed (charge.dispute.*): what it is and the deadline to answer by. */
export async function recordDispute(db: DbHandle, d: Pick<Stripe.Dispute, 'id' | 'status' | 'reason' | 'amount' | 'payment_intent' | 'created'> & { evidence_details?: { due_by?: number | null } | null }, closed: boolean, now = new Date()): Promise<{ ref: string } | null> {
  const order = await orderForPayment(db, idOf(d.payment_intent));
  if (!order) return null;
  const [row] = await db.select({ dispute: orders.dispute }).from(orders).where(eq(orders.id, order.id));
  const dueBy = d.evidence_details?.due_by ? new Date(d.evidence_details.due_by * 1000).toISOString() : null;
  await db
    .update(orders)
    .set({
      dispute: {
        id: d.id,
        status: d.status,
        reason: d.reason ?? null,
        amountPence: d.amount,
        dueBy,
        openedAt: row?.dispute?.id === d.id ? row.dispute.openedAt : new Date(d.created * 1000).toISOString(),
        closedAt: closed ? now.toISOString() : null,
      },
    })
    .where(eq(orders.id, order.id));
  return { ref: order.ref };
}
