import Stripe from 'stripe';
import { and, eq, isNull } from 'drizzle-orm';
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
        // Capture the delivery address BEFORE the paid-flip: the fulfilment worker
        // only claims PAID orders, so the address is always present by then. Older
        // Stripe API versions delivered it as session.shipping_details — accept both
        // (and the submitter can still backfill from the session as a last resort).
        const legacy = (session as unknown as { shipping_details?: Stripe.Checkout.Session.CollectedInformation.ShippingDetails | null }).shipping_details;
        const ship = session.collected_information?.shipping_details ?? legacy ?? null;
        if (ship?.address?.line1 && ship.address.city && ship.address.postal_code && ship.address.country) {
          await db
            .update(orders)
            .set({
              shippingAddress: {
                name: ship.name,
                line1: ship.address.line1,
                line2: ship.address.line2 ?? null,
                townOrCity: ship.address.city,
                postcode: ship.address.postal_code,
                countryCode: ship.address.country,
              },
            })
            .where(eq(orders.id, order.id));
        }
        // The payer's email (guests have no account) — used for referral first-order checks.
        const payerEmail = session.customer_details?.email ?? null;
        if (payerEmail) {
          await db.update(orders).set({ buyerEmail: payerEmail.toLowerCase() }).where(and(eq(orders.id, order.id), isNull(orders.buyerEmail)));
        }
        await markOrderPaid(db, order.id);
        handled = true;
      }
    }
  }

  await db.insert(webhookEvents).values({ id: event.id, type: event.type }).onConflictDoNothing();
  return { handled, duplicate: false };
}
