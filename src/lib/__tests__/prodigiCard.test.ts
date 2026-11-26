import { describe, expect, it } from 'vitest';
import { isCardDeclined } from '../prodigiCard';

describe('isCardDeclined — Prodigi refusing our card, told apart from a refused order (founder, 26 Nov 2026)', () => {
  it('the refusal seen live, and the plain wordings of a declined card', () => {
    expect(isCardDeclined('Prodigi createOrder failed: HTTP 500 outcome=PaymentFailed {"outcome":"PaymentFailed","message":"Your card has insufficient funds. Use a different payment method to complete this purchase."}')).toBe(true);
    expect(isCardDeclined('Prodigi createOrder failed: HTTP 402 {"outcome":"PaymentFailed"}')).toBe(true);
    expect(isCardDeclined('Your card was declined')).toBe(true);
    expect(isCardDeclined('…NOTE: the phone case already went to Prodigi as its own order (ord_1) — outcome=PaymentFailed')).toBe(true);
  });

  it('anything else is not', () => {
    expect(isCardDeclined(null)).toBe(false);
    expect(isCardDeclined('')).toBe(false);
    expect(isCardDeclined('Prodigi createOrder failed: HTTP 400 outcome=ValidationFailed items[0].attributes.size')).toBe(false);
    expect(isCardDeclined('Prodigi createOrder failed: HTTP 503 Service Unavailable')).toBe(false);
    expect(isCardDeclined('status sync failed: fetch failed')).toBe(false);
  });
});
