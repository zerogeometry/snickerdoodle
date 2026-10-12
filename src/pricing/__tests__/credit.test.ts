import { describe, expect, it } from 'vitest';
import { applicableCredit, MIN_CHARGE_PENCE, priceBasket } from '../engine';

const CAT = { mug: { pricePence: 1800, label: 'mug', unitCostPence: 930 } };

describe('account credit', () => {
  it('uses all of a smaller balance', () => {
    expect(applicableCredit(1800, 500)).toBe(500);
  });
  it('never takes the charge below the card minimum', () => {
    expect(applicableCredit(1800, 5000)).toBe(1800 - MIN_CHARGE_PENCE);
    expect(applicableCredit(40, 500)).toBe(0);
  });
  it('ignores junk balances', () => {
    expect(applicableCredit(1800, -100)).toBe(0);
    expect(applicableCredit(1800, Number.NaN)).toBe(0);
  });
  it('comes off after savings, shown separately, and only from a server-supplied balance', () => {
    const q = priceBasket([{ productKey: 'mug', qty: 1 }], { catalogue: CAT, creditAvailablePence: 500 });
    expect(q.creditPence).toBe(500);
    expect(q.totalPence).toBe(1300);
    expect(priceBasket([{ productKey: 'mug', qty: 1 }], { catalogue: CAT }).creditPence).toBe(0);
  });
});
