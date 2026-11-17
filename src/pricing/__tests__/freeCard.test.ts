import { describe, expect, it } from 'vitest';
import { quote, type PricedCatalogue, type PromoRule } from '@/pricing';

// "Your first card's on us" through the whole basket: one greetings card's price off, never stacked
// with multi-buy / the bundle / the family-set saving (the best single saving wins), margin-guarded, and only
// for a buyer the SERVER says may have it — a signed-in first order (freeCardEligible; founder, 17 Nov 2026).
const CAT: PricedCatalogue = {
  card: { pricePence: 550, label: 'greetings card', unitCostPence: 195, postFirstPence: 85, postExtraPence: 0 },
  'card-a5': { pricePence: 700, label: 'greetings card · A5', unitCostPence: 260, postFirstPence: 85, postExtraPence: 0 },
  'cardPack-5': { pricePence: 1200, label: 'card pack · 5', unitCostPence: 600 },
  mug: { pricePence: 1800, label: 'mug', unitCostPence: 930, postFirstPence: 430, postExtraPence: 100 },
  framedPrint: { pricePence: 6500, label: 'framed print', unitCostPence: 3785, postFirstPence: 785, postExtraPence: 300 },
  'christmasBundle-for4': { pricePence: 9000, label: 'christmas family bundle', unitCostPence: 5000 },
};
const FREE: PromoRule = { id: 'f', code: 'FIRSTCARD', kind: 'FREE_CARD', value: 0, minSpendPence: 0, commissionBps: 0 };
const q = (items: Array<{ productKey: string; qty: number }>, promo: PromoRule | null = FREE, freeCardEligible = true) => quote(items, { catalogue: CAT, promo, freeCardEligible });

describe('a free first card, priced through the basket', () => {
  it('card + mug: the card comes off, delivery unchanged, the line is labelled as a free card', () => {
    const r = q([{ productKey: 'card', qty: 1 }, { productKey: 'mug', qty: 1 }]);
    expect(r.promo).toMatchObject({ code: 'FIRSTCARD', kind: 'FREE_CARD', applied: true });
    expect(r.promoSavingPence).toBe(550);
    expect(r.deliveryPence).toBe(q([{ productKey: 'card', qty: 1 }, { productKey: 'mug', qty: 1 }], null).deliveryPence);
    expect(r.totalPence).toBe(1800 + r.deliveryPence);
  });

  it('any single-card size counts (the cheapest card is the free one)', () => {
    expect(q([{ productKey: 'card-a5', qty: 1 }, { productKey: 'card', qty: 1 }, { productKey: 'mug', qty: 1 }]).promoSavingPence).toBe(550);
  });

  it('a card pack is not a single card — the code says to add one', () => {
    const r = q([{ productKey: 'cardPack-5', qty: 1 }, { productKey: 'mug', qty: 1 }]);
    expect(r.promo).toMatchObject({ applied: false, reason: 'needs-card' });
    expect(r.promoSavingPence).toBe(0);
  });

  it('the christmas bundle never takes it (and a card beside the bundle alone can’t be given away)', () => {
    const r = q([{ productKey: 'christmasBundle-for4', qty: 1 }, { productKey: 'card', qty: 1 }]);
    expect(r.promo).toMatchObject({ applied: false, reason: 'needs-more' });
    expect(r.totalPence).toBe(9000 + 550 + r.deliveryPence - r.multiBuySavingPence - r.parcelSavingPence);
  });

  it('a card alone: the margin guard keeps the code for a bigger order — full price, nothing off', () => {
    const r = q([{ productKey: 'card', qty: 1 }]);
    expect(r.promo).toMatchObject({ applied: false, reason: 'needs-more' });
    expect(r.totalPence).toBe(550 + r.deliveryPence);
  });

  it('never stacks with multi-buy: the bigger single saving applies, never both', () => {
    const cards = q([{ productKey: 'card', qty: 6 }, { productKey: 'mug', qty: 1 }]);
    expect(cards.promoSavingPence > 0 && cards.multiBuySavingPence > 0).toBe(false);
    const frames = q([{ productKey: 'framedPrint', qty: 3 }, { productKey: 'card', qty: 1 }]);
    expect(frames.promoSavingPence > 0 && frames.multiBuySavingPence > 0).toBe(false);
    if (frames.multiBuySavingPence > 550) expect(frames.promo).toMatchObject({ applied: false, reason: 'better-saving-applied' });
  });

  it('not a signed-in first order (or eligibility not given): no free card — full price', () => {
    const r = q([{ productKey: 'card', qty: 1 }, { productKey: 'mug', qty: 1 }], FREE, false);
    expect(r.promo).toMatchObject({ applied: false, reason: 'first-order-card' });
    expect(r.promoSavingPence).toBe(0);
    expect(quote([{ productKey: 'card', qty: 1 }, { productKey: 'mug', qty: 1 }], { catalogue: CAT, promo: FREE }).promoSavingPence).toBe(0); // fail-closed
  });

  it('a school’s free-card code with commission: no card in the basket ⇒ the order is still tagged and earns', () => {
    const SCHOOL: PromoRule = { ...FREE, id: 's', code: 'OAKFIELD-PTA', commissionBps: 1000 };
    const r = quote([{ productKey: 'framedPrint', qty: 1 }], { catalogue: CAT, promo: SCHOOL, freeCardEligible: true });
    expect(r.promo).toMatchObject({ applied: true, cardReason: 'needs-card' });
    expect(r.promoSavingPence).toBe(0);
    expect(r.partnerCommissionPence).toBe(Math.round(6500 / 1.2 / 10));
    expect(r.totalPence).toBe(6500 + r.deliveryPence);
  });
});
