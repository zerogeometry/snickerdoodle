import Stripe from 'stripe';
import type { PricedLine } from '@/pricing';

/**
 * Stripe is OPTIONAL locally: with no STRIPE_SECRET_KEY the order flow uses a dev
 * "mark paid" fallback so the commercial loop is walkable without keys. When keys
 * are set, real Stripe Checkout + the webhook take over. Card data never touches
 * our server — Stripe holds it; we keep only the session/order reference.
 */
let _stripe: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  if (!_stripe) _stripe = new Stripe(key);
  return _stripe;
}

function appUrl(): string {
  return process.env.APP_URL ?? 'http://localhost:3000';
}

/**
 * Create a Checkout Session for an order. Prices come from the server CATALOGUE,
 * never the client. A single negative "Family saving" line carries the join
 * discount so Stripe's total matches our authoritative total.
 */
export async function createCheckoutSession(args: {
  ref: string;
  lines: PricedLine[];
  deliveryPence: number;
  joinSavingPence: number;
  // Required (not optional) on purpose: dropping it at a call-site must be a compile
  // error, or Stripe would charge more than the order total it is meant to mirror.
  familySetSavingPence: number;
}): Promise<{ id: string; url: string | null }> {
  const stripe = getStripe();
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = args.lines.map((l) => ({
    quantity: l.qty,
    price_data: {
      currency: 'gbp',
      unit_amount: l.unitPricePence, // already server-priced
      product_data: { name: l.label },
    },
  }));

  if (args.deliveryPence > 0) {
    lineItems.push({
      quantity: 1,
      price_data: { currency: 'gbp', unit_amount: args.deliveryPence, product_data: { name: 'Delivery' } },
    });
  }

  // Stripe line items can't be negative; carry the discounts as ONE coupon (a
  // Checkout Session allows a single discount) so Stripe's total always equals
  // our authoritative order total.
  const discounts: Stripe.Checkout.SessionCreateParams.Discount[] = [];
  const savingPence = args.joinSavingPence + args.familySetSavingPence;
  if (savingPence > 0) {
    const coupon = await stripe.coupons.create({ amount_off: savingPence, currency: 'gbp', duration: 'once', name: 'Family saving' });
    discounts.push({ coupon: coupon.id });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: lineItems,
    discounts,
    client_reference_id: args.ref,
    success_url: `${appUrl()}/checkout/confirmation?ref=${args.ref}`,
    cancel_url: `${appUrl()}/checkout`,
  });
  return { id: session.id, url: session.url };
}
