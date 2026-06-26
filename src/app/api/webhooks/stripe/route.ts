import { getDb } from '@/db/client';
import { handleStripeEvent, verifyStripeEvent } from '@/payments';

// Stripe posts raw JSON; we must verify the signature against the raw body.
export async function POST(req: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response('webhook not configured', { status: 500 });

  const body = await req.text();
  const signature = req.headers.get('stripe-signature') ?? '';

  let event;
  try {
    event = verifyStripeEvent(body, signature, secret);
  } catch {
    return new Response('invalid signature', { status: 400 });
  }

  try {
    await handleStripeEvent(getDb(), event);
  } catch {
    return new Response('handler error', { status: 500 }); // Stripe will retry → idempotency protects us
  }
  return new Response('ok', { status: 200 });
}
