import { describe, expect, it } from 'vitest';
import { computeRetailPence, marginAtPrice, roundUpToX9Pence, RETAIL } from '../retail';

describe('roundUpToX9Pence', () => {
  it('rounds up to the nearest charm price ending in 9p', () => {
    expect(roundUpToX9Pence(1243)).toBe(1249);
    expect(roundUpToX9Pence(1240)).toBe(1249);
    expect(roundUpToX9Pence(1241)).toBe(1249);
    expect(roundUpToX9Pence(1249)).toBe(1249); // already .x9 stays
    expect(roundUpToX9Pence(1250)).toBe(1259); // .x0 rounds up to next .x9
    expect(roundUpToX9Pence(1259)).toBe(1259);
    expect(roundUpToX9Pence(1)).toBe(9);
  });
  it('rounds fractional pence up first', () => {
    expect(roundUpToX9Pence(2704.9)).toBe(2709);
    expect(roundUpToX9Pence(2700.01)).toBe(2709);
  });
});

describe('computeRetailPence — the founder formula', () => {
  it("matches the worked men's-tee example (cost £12.00 + ship £4.30 → £27.09)", () => {
    expect(computeRetailPence(1200, 430)).toBe(2709);
  });

  it('delivers ~25% margin on ex-VAT revenue after cost, shipping + Stripe', () => {
    const price = computeRetailPence(1200, 430);
    const margin = marginAtPrice(price, 1200, 430);
    // >= target (rounding up to .x9 only ever helps the margin), and within ~1pt of 25%
    expect(margin).toBeGreaterThanOrEqual(RETAIL.marginRate);
    expect(margin).toBeLessThan(RETAIL.marginRate + 0.01);
  });

  it('holds the margin floor across a range of costs/shipping', () => {
    for (const [c, s] of [[400, 320], [2200, 430], [6000, 645], [150, 100]] as const) {
      const price = computeRetailPence(c, s);
      expect(price % 10).toBe(9); // always a .x9 charm price
      expect(marginAtPrice(price, c, s)).toBeGreaterThanOrEqual(RETAIL.marginRate);
    }
  });

  it('is monotonic — higher cost never yields a lower price', () => {
    let prev = 0;
    for (const c of [100, 500, 1000, 2000, 5000]) {
      const price = computeRetailPence(c, 430);
      expect(price).toBeGreaterThanOrEqual(prev);
      prev = price;
    }
  });
});
