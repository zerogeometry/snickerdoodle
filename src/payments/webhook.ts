import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { orders, webhookEvents } from '@/db/schema';
import type { DbHandle } from '@/server/db';
import { markOrderPaid } from '@/server/orders';

/**
 * Verify a Stripe webhook signature. constructEvent recomputes the HMAC locally
 * (no network) and throws on a bad signature or stale timestamp — the API key is
 * irrelevant here, only the webhook signing secret. We never trust an unsigned
 * payload to mark money received.
 */
export function verifyStripeEvent(payload: string, signature: string, secret: string): Stripe.Event {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder');
  return stripe.webhooks.constructEvent(payload, signature, secret);
}

/**
 * Handle a verified event idempotently: a replayed event id is a no-op, so a
 * retried webhook never double-fulfils. Marks the matching order paid on
 * checkout.session.completed.
 */
export async function handleStripeEvent(db: DbHandle, event: Stripe.Event): Promise<{ handled: boolean; duplicate: boolean }> {
  const seen = await db.select({ id: webhookEvents.id }).from(webhookEvents).where(eq(webhookEvents.id, event.id));
  if (seen[0]) return { handled: false, duplicate: true };

  let handled = false;
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.id) {
      const [order] = await db.select({ id: orders.id }).from(orders).where(eq(orders.stripeSessionId, session.id));
      if (order) {
        await markOrderPaid(db, order.id);
        handled = true;
      }
    }
  }

  await db.insert(webhookEvents).values({ id: event.id, type: event.type }).onConflictDoNothing();
  return { handled, duplicate: false };
}
