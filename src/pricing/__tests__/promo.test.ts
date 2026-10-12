import { describe, expect, it } from 'vitest';
import { evaluatePromo, normalisePromoCode, type PromoLine, type PromoRule } from '../promo';

// Real unit economics (scripts/discount-headroom.mjs, live prices × Prodigi costs, 2026-10-12).
const MUG: PromoLine = { linePence: 1800, lineCostPence: 930 }; // £5.00 + £4.30 delivery
const SMALL_CUSHION: PromoLine = { linePence: 2000, lineCostPence: 1330 };
const FRAMED_11X14: PromoLine = { linePence: 6500, lineCostPence: 3785 };
const CARD: PromoLine = { linePence: 500, lineCostPence: 195 };

const rule = (over: Partial<PromoRule>): PromoRule => ({ id: 'p1', code: 'TEST', kind: 'PERCENT', value: 1000, minSpendPence: 0, commissionBps: 0, ...over });

/** Contribution after the outcome, to assert the guard really holds. */
function kept(lines: PromoLine[], discount: number, commission: number) {
  const S = lines.reduce((n, l) => n + l.linePence, 0);
  const C = lines.reduce((n, l) => n + (l.lineCostPence ?? 0), 0);
  const x = S - discount;
  return x / 1.2 - 0.015 * x - 20 - C - commission;
}

describe('evaluatePromo — percent codes', () => {
  it('10% off a mug: applied in full, still above the 10% floor', () => {
    const o = evaluatePromo(rule({ value: 1000 }), [MUG], 0);
    expect(o).toMatchObject({ applied: true, discountPence: 180, capped: false });
    expect(kept([MUG], 180, 0)).toBeGreaterThanOrEqual(150);
  });

  it('15% off the small cushion: the margin guard trims it (never sells at a near-loss)', () => {
    const o = evaluatePromo(rule({ value: 1500 }), [SMALL_CUSHION], 0);
    expect(o.applied).toBe(true);
    if (!o.applied) return;
    expect(o.capped).toBe(true);
    expect(o.discountPence).toBeLessThan(300);
    expect(kept([SMALL_CUSHION], o.discountPence, 0)).toBeGreaterThanOrEqual(2000 / 1.2 / 10 - 1);
  });

  it('a 90% code can never push an order below the floor', () => {
    const lines = [FRAMED_11X14, MUG, CARD];
    const o = evaluatePromo(rule({ value: 9000 }), lines, 0);
    expect(o.applied).toBe(true);
    if (!o.applied) return;
    const S = 6500 + 1800 + 500;
    expect(kept(lines, o.discountPence, 0)).toBeGreaterThanOrEqual(S / 1.2 / 10 - 1);
  });
});

describe('evaluatePromo — £ vouchers', () => {
  it('£10 off needs its minimum spend', () => {
    expect(evaluatePromo(rule({ kind: 'FIXED', value: 1000, minSpendPence: 6000 }), [MUG], 0)).toEqual({
      applied: false,
      reason: 'min-spend',
      minSpendPence: 6000,
    });
  });

  it('£10 off a framed print (over £60) applies in full', () => {
    expect(evaluatePromo(rule({ kind: 'FIXED', value: 1000, minSpendPence: 6000 }), [FRAMED_11X14], 0)).toMatchObject({
      applied: true,
      discountPence: 1000,
      capped: false,
    });
  });

  it('a voucher bigger than the basket is clamped (and guarded)', () => {
    const o = evaluatePromo(rule({ kind: 'FIXED', value: 5000 }), [CARD], 0);
    expect(o.applied).toBe(true);
    if (o.applied) expect(o.discountPence).toBeLessThan(500);
  });
});

describe('evaluatePromo — never stacks; best single saving wins', () => {
  it('10% beats a 5% join saving → the code replaces it', () => {
    expect(evaluatePromo(rule({ value: 1000 }), [FRAMED_11X14], 325)).toMatchObject({ applied: true, discountPence: 650, replacesOtherSavings: true });
  });
  it('a code no bigger than the existing saving is not used', () => {
    expect(evaluatePromo(rule({ value: 500 }), [FRAMED_11X14], 325)).toEqual({ applied: false, reason: 'better-saving-applied' });
  });
  it('a code the guard caps below the existing saving falls back to the existing saving', () => {
    expect(evaluatePromo(rule({ value: 3000 }), [SMALL_CUSHION], 150)).toEqual({ applied: false, reason: 'better-saving-applied' });
  });
});

describe('evaluatePromo — partner commission (influencer / PTA)', () => {
  it('influencer: 10% off + 5% commission on a framed print fits in full', () => {
    const o = evaluatePromo(rule({ value: 1000, commissionBps: 500 }), [FRAMED_11X14], 0);
    expect(o).toMatchObject({ applied: true, discountPence: 650, capped: false });
    if (o.applied) {
      expect(o.commissionPence).toBe(Math.round((5850 / 1.2) * 0.05));
      expect(kept([FRAMED_11X14], 650, o.commissionPence)).toBeGreaterThanOrEqual(541);
    }
  });

  it('influencer: 10% off + 10% commission is too rich for a framed print — the guard trims it', () => {
    const o = evaluatePromo(rule({ value: 1000, commissionBps: 1000 }), [FRAMED_11X14], 0);
    expect(o.applied).toBe(true);
    if (!o.applied) return;
    expect(o.capped).toBe(true);
    expect(kept([FRAMED_11X14], o.discountPence, o.commissionPence)).toBeGreaterThanOrEqual(541);
  });

  it('PTA attribution-only (no discount): 15% to the PTA on a card, keeps any join saving', () => {
    const o = evaluatePromo(rule({ value: 0, commissionBps: 1500 }), [CARD], 0);
    expect(o).toMatchObject({ applied: true, discountPence: 0, commissionPence: 63, replacesOtherSavings: false });
  });

  it('PTA 15% on the thin small cushion: commission capped to protect the floor', () => {
    const o = evaluatePromo(rule({ value: 0, commissionBps: 1500 }), [SMALL_CUSHION], 0);
    expect(o.applied).toBe(true);
    if (!o.applied) return;
    expect(o.capped).toBe(true);
    expect(o.commissionPence).toBeLessThan(250);
    expect(kept([SMALL_CUSHION], 0, o.commissionPence)).toBeGreaterThanOrEqual(2000 / 1.2 / 10 - 1);
  });
});

describe('evaluatePromo — unknown costs + codes', () => {
  it('a line with no known cost is never discounted', () => {
    expect(evaluatePromo(rule({}), [{ linePence: 300, lineCostPence: null }], 0)).toEqual({ applied: false, reason: 'nothing-eligible' });
  });
  it('normalises what people type, rejects junk', () => {
    expect(normalisePromoCode('  welcome 10 ')).toBe('WELCOME10');
    expect(normalisePromoCode('x')).toBeNull();
    expect(normalisePromoCode('DROP TABLE;')).toBeNull();
  });
});
