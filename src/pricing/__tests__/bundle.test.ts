import { describe, expect, it } from 'vitest';
import { priceBasket, quote, type PricedCatalogue, type PromoRule } from '@/pricing';

// The CHRISTMAS FAMILY BUNDLE through the pricing engine: the client sends WHICH drawings + the two
// steppers; the server counts them and prices the bundle — never a client figure.
const CAT: PricedCatalogue = {
  christmasBundle: { pricePence: 9000, label: 'christmas family bundle', unitCostPence: 5000 },
  mug: { pricePence: 1800, label: 'mug', unitCostPence: 930 },
  placemat: { pricePence: 5900, label: 'placemats', unitCostPence: 3700 },
  coaster: { pricePence: 3200, label: 'coasters', unitCostPence: 1950 },
};
const A = { assetId: 'a' };
const n = (k: number) => Array.from({ length: k }, () => A);
const bundle = (o: Record<string, unknown> = {}) => ({ table: A, ornaments: [], sacks: [], extraPlacemats: 0, extraCoasters: 0, ...o });
const rule = (over: Partial<PromoRule> = {}): PromoRule => ({ id: 'p', code: 'SAVE10', kind: 'PERCENT', value: 1000, minSpendPence: 0, commissionBps: 0, ...over });
const priceOf = (b: unknown, extra: Partial<{ qty: number }> = {}) => priceBasket([{ productKey: 'christmasBundle', qty: extra.qty ?? 1, bundle: b }], { catalogue: CAT });

describe('pricing — the christmas family bundle', () => {
  it('is priced from what it carries: the founder’s example totals', () => {
    expect(priceOf(bundle()).subtotalPence).toBe(9000);
    expect(priceOf(bundle({ ornaments: n(4) })).subtotalPence).toBe(15000);
    expect(priceOf(bundle({ ornaments: n(4), sacks: n(2) })).subtotalPence).toBe(20400);
    expect(priceOf(bundle({ ornaments: n(4), sacks: n(4) })).subtotalPence).toBe(25800);
    expect(priceOf(bundle({ ornaments: n(6), sacks: n(6), extraPlacemats: 2, extraCoasters: 2 })).subtotalPence).toBe(38500);
  });

  it('is ONE line, ONE bundle — a smuggled qty never buys more bundles for one bundle’s pieces', () => {
    const q = priceOf(bundle({ ornaments: n(4) }), { qty: 7 });
    expect(q.lines).toEqual([{ productKey: 'christmasBundle', label: 'christmas family bundle', unitPricePence: 15000, qty: 1, linePence: 15000 }]);
  });

  it('ignores any price, and any count past the caps, the client claims', () => {
    expect(priceOf({ ...bundle({ ornaments: n(40), extraPlacemats: 1e6 }), pricePence: 1, unitPricePence: 1 }).subtotalPence).toBe(9000 + 12 * 1500 + 12 * 1600);
    expect(priceOf(bundle({ extraCoasters: -10, extraPlacemats: 'lots' })).subtotalPence).toBe(9000);
  });

  it('the base price is the catalogue’s (DB-loaded), the add-ons the set prices on top', () => {
    const q = priceBasket([{ productKey: 'christmasBundle', qty: 1, bundle: bundle({ sacks: n(1) }) }], { catalogue: { ...CAT, christmasBundle: { pricePence: 9500, label: 'b' } } });
    expect(q.subtotalPence).toBe(9500 + 2700);
  });

  it('never stacks with a promo code — the code still works on the rest of the basket', () => {
    const only = quote([{ productKey: 'christmasBundle', qty: 1, bundle: bundle({ ornaments: n(4) }) }], { catalogue: CAT, promo: rule() });
    expect(only.promoSavingPence).toBe(0);
    expect(only.promo).toMatchObject({ applied: false, reason: 'nothing-eligible' });
    expect(only.totalPence).toBe(15000);

    const mixed = quote(
      [
        { productKey: 'christmasBundle', qty: 1, bundle: bundle({ ornaments: n(4) }) },
        { productKey: 'mug', qty: 1 },
      ],
      { catalogue: CAT, promo: rule() },
    );
    expect(mixed.promoSavingPence).toBe(180); // 10% of the mug only
    expect(mixed.totalPence).toBe(15000 + 1800 - 180);
  });

  it('earns no same-parcel saving of its own (its price already counts its one parcel)', () => {
    const q = priceBasket([{ productKey: 'christmasBundle', qty: 1, bundle: bundle({ ornaments: n(6), sacks: n(6) }) }], { catalogue: CAT });
    expect(q.parcelSavingPence).toBe(0);
  });

  it('standalone placemats + coasters ship in the uk9 homeware parcel (£3 off the second)', () => {
    const q = priceBasket([{ productKey: 'placemat', qty: 1 }, { productKey: 'coaster', qty: 1 }], { catalogue: CAT });
    expect(q.subtotalPence).toBe(5900 + 3200);
    expect(q.parcelSavingPence).toBe(300);
  });

  it('a bundle without a table drawing still quotes its base (the ORDER refuses it — orders.ts)', () => {
    expect(priceOf(undefined).subtotalPence).toBe(9000);
  });
});
