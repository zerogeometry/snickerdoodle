import { describe, expect, it } from 'vitest';
import { multiBuyNudges, priceBasket, quoteNudges, type PricedCatalogue, type PromoRule } from '@/pricing';

// "add one more and save" (founder, 29 Oct): the checkout's small nudge, worked out by the SAME engine
// that charges — never by the client. Costs as in multibuy.test.ts (mug: 15% from 2; frame: 10% for
// 2, 15% for 3; the 22″ cushion has no offer).
const CAT: PricedCatalogue = {
  mug: { pricePence: 1800, label: 'mug', unitCostPence: 930, postFirstPence: 430, postExtraPence: 100 },
  'mug-black': { pricePence: 1800, label: 'mug · black', unitCostPence: 930, postFirstPence: 430, postExtraPence: 100 },
  framedPrint: { pricePence: 6500, label: 'framed print', unitCostPence: 3785, postFirstPence: 785, postExtraPence: 300 },
  'cushion-22square': { pricePence: 4000, label: 'cushion · 22″', unitCostPence: 2530, postFirstPence: 430, postExtraPence: 100 },
  cardPack: { pricePence: 1200, label: 'card pack', unitCostPence: 500, postFirstPence: 200, postExtraPence: 50 },
  christmasBundle: { pricePence: 7800, label: 'christmas family bundle' },
};
const nudges = (items: Array<{ productKey: string; qty: number; bundle?: unknown }>, o: Parameters<typeof multiBuyNudges>[1] = {}) => multiBuyNudges(items, { catalogue: CAT, ...o });

describe('pricing — the "add one more and save" nudge', () => {
  it('one mug → "add 1 more — both 15% off", and the figure is what the engine would really charge', () => {
    const n = nudges([{ productKey: 'mug', qty: 1 }]);
    expect(n).toEqual([{ lineIndex: 0, nextQty: 2, bps: 1500 }]);
    expect(priceBasket([{ productKey: 'mug', qty: 2 }], { catalogue: CAT }).lines[0]!.multiBuyBps).toBe(n[0]!.bps);
  });

  it('only when one more reaches a BETTER tier — hidden once the best tier is reached', () => {
    expect(nudges([{ productKey: 'framedPrint', qty: 2 }])).toEqual([{ lineIndex: 0, nextQty: 3, bps: 1500 }]); // 10% → 15%
    expect(nudges([{ productKey: 'framedPrint', qty: 3 }])).toEqual([]);
    expect(nudges([{ productKey: 'mug', qty: 2 }])).toEqual([]);
  });

  it('never for a product with no offer, a card pack (always one) or the bundle', () => {
    expect(nudges([{ productKey: 'cushion-22square', qty: 1 }])).toEqual([]);
    expect(nudges([{ productKey: 'cardPack', qty: 1 }])).toEqual([]);
    expect(nudges([{ productKey: 'christmasBundle', qty: 1, bundle: { placemat: { assetId: 'a' } } }])).toEqual([]);
  });

  it('ONE per product, on its last line (any drawing, any variant counts together)', () => {
    const n = nudges([{ productKey: 'framedPrint', qty: 1 }, { productKey: 'mug', qty: 1 }, { productKey: 'framedPrint', qty: 1 }]);
    expect(n).toEqual([{ lineIndex: 1, nextQty: 2, bps: 1500 }, { lineIndex: 2, nextQty: 3, bps: 1500 }]);
    // its index is the PRICED line's: a key we don't sell is skipped, like the quote skips it
    expect(nudges([{ productKey: 'nope', qty: 1 }, { productKey: 'mug', qty: 1 }])).toEqual([{ lineIndex: 0, nextQty: 2, bps: 1500 }]);
  });

  it('never on a gift (prices are hidden), and never when a code would win instead (they don’t stack)', () => {
    expect(nudges([{ productKey: 'mug', qty: 1 }], { gift: true })).toEqual([]);
    const big: PromoRule = { id: 'p', code: 'BIG', kind: 'FIXED', value: 1500, minSpendPence: 0, commissionBps: 0 };
    expect(nudges([{ productKey: 'mug', qty: 1 }], { promo: big })).toEqual([]);
  });

  it('a nudge’s promise holds against the join saving: shown only when multi-buy would really win', () => {
    const join = { savingBps: 500 } as NonNullable<Parameters<typeof priceBasket>[1]>['joinContext'];
    expect(nudges([{ productKey: 'mug', qty: 1 }], { joinContext: join })).toEqual([{ lineIndex: 0, nextQty: 2, bps: 1500 }]);
  });

  it('quoteNudges reads the same server-resolved options as quote()', () => {
    expect(quoteNudges([{ productKey: 'mug', qty: 1 }], { catalogue: CAT })).toEqual([{ lineIndex: 0, nextQty: 2, bps: 1500 }]);
    expect(quoteNudges([{ productKey: 'mug', qty: 1 }], { catalogue: CAT, gift: true })).toEqual([]);
  });
});
