import Stripe from 'stripe';
import { and, eq, isNull } from 'drizzle-orm';
import { orders, webhookEvents } from '@/db/schema';
import type { DbHandle } from '@/server/db';
import { markOrderPaid } from '@/server/orders';
import { expireAbandonedCheckouts } from '@/server/retention';

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

/** The session events that can carry a paid order. */
const PAID_EVENTS = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded']);

/**
 * Has the money actually arrived? `checkout.session.completed` fires when the shopper finishes
 * Checkout — for a delayed method (Bacs, bank transfer) that is BEFORE the money lands, with
 * payment_status 'unpaid'; the money then arrives as `checkout.session.async_payment_succeeded`
 * (sweep 05-B2). Only 'paid' (or a nothing-to-pay session) ever queues an order for print.
 */
function sessionIsPaid(session: Stripe.Checkout.Session): boolean {
  return session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
}

/**
 * Handle a verified event idempotently: a replayed event id is a no-op, so a
 * retried webhook never double-fulfils. Marks the matching order paid once its session is PAID —
 * on checkout.session.completed (cards, wallets: paid at once), or on
 * checkout.session.async_payment_succeeded for a delayed method. A completed-but-unpaid session
 * only records the address; the order stays PENDING (never printed) until the money arrives, and an
 * async_payment_failed leaves it PENDING for good.
 */
export async function handleStripeEvent(db: DbHandle, event: Stripe.Event): Promise<{ handled: boolean; duplicate: boolean }> {
  const seen = await db.select({ id: webhookEvents.id }).from(webhookEvents).where(eq(webhookEvents.id, event.id));
  if (seen[0]) return { handled: false, duplicate: true };

  let handled = false;
  if (PAID_EVENTS.has(event.type)) {
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
        if (sessionIsPaid(session)) {
          await markOrderPaid(db, order.id);
          handled = true;
        }
      }
    }
  }

  // The shopper never paid and Stripe closed the session: the order can never be paid now, so it's
  // cancelled at once and its unkept upload follows normal retention (08-B2; the retention job
  // catches any whose event never arrives).
  if (event.type === 'checkout.session.expired') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.id) handled = (await expireAbandonedCheckouts(db, { stripeSessionId: session.id })).length > 0;
  }

  await db.insert(webhookEvents).values({ id: event.id, type: event.type }).onConflictDoNothing();
  return { handled, duplicate: false };
}
