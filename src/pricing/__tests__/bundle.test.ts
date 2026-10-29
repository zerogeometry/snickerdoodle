import { describe, expect, it } from 'vitest';
import { priceBasket, quote, type PricedCatalogue, type PromoRule } from '@/pricing';

// The CHRISTMAS FAMILY BUNDLE through the pricing engine (founder, 29 Oct): the size is the line's
// variant sku and its price is the SERVER catalogue's — nothing the client sends changes it.
const CAT: PricedCatalogue = {
  christmasBundle: { pricePence: 7800, label: 'christmas family bundle' },
  'christmasBundle-for4': { pricePence: 14500, label: 'christmas family bundle' },
  'christmasBundle-for8': { pricePence: 27900, label: 'christmas family bundle' },
  mug: { pricePence: 1800, label: 'mug', unitCostPence: 930, postFirstPence: 430, postExtraPence: 100 },
  placemat: { pricePence: 6000, label: 'placemats', unitCostPence: 3700 },
  coaster: { pricePence: 3200, label: 'coasters', unitCostPence: 1950 },
};
const A = { assetId: 'a' };
const bundle = (o: Record<string, unknown> = {}) => ({ placemat: A, coaster: null, ornaments: [], ...o });
const rule = (over: Partial<PromoRule> = {}): PromoRule => ({ id: 'p', code: 'SAVE10', kind: 'PERCENT', value: 1000, minSpendPence: 0, commissionBps: 0, ...over });
const priceOf = (productKey: string, b: unknown = bundle(), qty = 1) => priceBasket([{ productKey, qty, bundle: b }], { catalogue: CAT });

describe('pricing — the christmas family bundle', () => {
  it('each size is its variant’s server price: £78 / £145 / £279', () => {
    expect(priceOf('christmasBundle').subtotalPence).toBe(7800);
    expect(priceOf('christmasBundle-for4').subtotalPence).toBe(14500);
    expect(priceOf('christmasBundle-for8').subtotalPence).toBe(27900);
  });

  it('ignores any price, count or add-on the client sends — there are no add-ons', () => {
    const forged = { ...bundle({ ornaments: Array.from({ length: 40 }, () => A), sacks: [A, A], extraPlacemats: 12 }), pricePence: 1, unitPricePence: 1 };
    expect(priceOf('christmasBundle-for4', forged).subtotalPence).toBe(14500);
  });

  it('a size we don’t sell is never priced', () => {
    const q = priceOf('christmasBundle-for3');
    expect(q.lines).toEqual([]);
    expect(q.rejectedKeys).toEqual(['christmasBundle-for3']);
  });

  it('is ONE line, ONE bundle — a smuggled qty never buys more sets for one set’s price', () => {
    expect(priceOf('christmasBundle-for8', bundle(), 7).lines).toEqual([{ productKey: 'christmasBundle-for8', label: 'christmas family bundle', unitPricePence: 27900, qty: 1, linePence: 27900 }]);
  });

  it('never stacks with a promo code — the code still works on the rest of the basket', () => {
    const only = quote([{ productKey: 'christmasBundle-for4', qty: 1, bundle: bundle() }], { catalogue: CAT, promo: rule() });
    expect(only.promoSavingPence).toBe(0);
    expect(only.promo).toMatchObject({ applied: false, reason: 'nothing-eligible' });
    expect(only.totalPence).toBe(14500);
    const mixed = quote([{ productKey: 'christmasBundle-for4', qty: 1, bundle: bundle() }, { productKey: 'mug', qty: 1 }], { catalogue: CAT, promo: rule() });
    expect(mixed.promoSavingPence).toBe(180); // 10% of the mug only
  });

  it('earns no same-parcel saving and no multi-buy (its price already counts its parcel)', () => {
    const q = priceBasket([{ productKey: 'christmasBundle', qty: 1, bundle: bundle() }, { productKey: 'christmasBundle-for4', qty: 1, bundle: bundle() }], { catalogue: CAT });
    expect(q.parcelSavingPence).toBe(0);
    expect(q.multiBuySavingPence).toBe(0);
  });

  it('the retired christmas eve bundle can’t be priced', () => {
    expect(priceBasket([{ productKey: 'christmasEveBundle', qty: 1 }]).rejectedKeys).toEqual(['christmasEveBundle']);
  });
});
