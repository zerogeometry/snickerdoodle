import { describe, expect, it } from 'vitest';
import Stripe from 'stripe';
import { verifyStripeEvent } from '@/payments';

/**
 * Webhook signature verification (a launch-gate). No DB, no network — Stripe's
 * test header helper signs a payload and constructEvent verifies the HMAC.
 */
const SECRET = 'whsec_test_secret_value';
const stripe = new Stripe('sk_test_placeholder');
const payload = JSON.stringify({
  id: 'evt_test_1',
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_test_1' } },
});

describe('verifyStripeEvent', () => {
  it('accepts a correctly-signed payload', () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    const event = verifyStripeEvent(payload, header, SECRET);
    expect(event.id).toBe('evt_test_1');
    expect(event.type).toBe('checkout.session.completed');
  });

  it('rejects a tampered payload (signature no longer matches)', () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    const tampered = payload.replace('cs_test_1', 'cs_hacked');
    expect(() => verifyStripeEvent(tampered, header, SECRET)).toThrow();
  });

  it('rejects a payload signed with the wrong secret', () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_attacker' });
    expect(() => verifyStripeEvent(payload, header, SECRET)).toThrow();
  });

  it('rejects a missing/garbage signature', () => {
    expect(() => verifyStripeEvent(payload, 't=1,v1=deadbeef', SECRET)).toThrow();
  });
});
