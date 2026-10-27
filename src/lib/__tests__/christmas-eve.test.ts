import { describe, expect, it } from 'vitest';
import { artFor, EVE_PRICE_PENCE, eveSummary, expandEve, isEveKey, mugSkuFor, normalizeEve } from '@/lib/christmas-eve';
import { composedEconomics, multiBuyTiers, netAt, priceBasket, quote, tierFor, type PricedCatalogue } from '@/pricing';

const A = { assetId: 'a' };
const B = { assetId: 'b', sourceObjectId: 'cut-b' };
const SHELF = { sack: 3500, ceramicOrnament: 2100, mug: 1800 };

describe('christmas eve bundle — what gets made', () => {
  it('no drawing = no bundle; junk is dropped; an unknown mug colour is the blue', () => {
    expect(normalizeEve(null)).toBeNull();
    expect(normalizeEve({ own: { sack: A } })).toBeNull();
    const b = normalizeEve({ drawing: A, own: { sack: B, mug: 'x', hat: A }, mugColour: 'tartan', pricePence: 1 })!;
    expect(b).toEqual({ drawing: A, own: { sack: B }, mugColour: 'blue' });
  });

  it('one drawing on all three by default; a piece’s own drawing wins for that piece', () => {
    const b = normalizeEve({ drawing: A, own: { ceramicOrnament: B }, mugColour: 'red' })!;
    expect([artFor(b, 'sack'), artFor(b, 'ceramicOrnament'), artFor(b, 'mug')]).toEqual([A, B, A]);
    expect(eveSummary(b)).toBe('one piece with its own drawing · red mug');
    expect(eveSummary(normalizeEve({ drawing: A })!)).toBe('one drawing on all three · blue mug');
  });

  it('splits into its three Prodigi items, to the penny, for any number of copies', () => {
    const b = normalizeEve({ drawing: A, own: { mug: B }, mugColour: 'pink' })!;
    for (const qty of [1, 2, 3, 7]) {
      const lines = expandEve(EVE_PRICE_PENCE, qty, b, SHELF);
      expect(lines.map((l) => l.sku)).toEqual(['sack', 'ceramicOrnament', 'mug-11oz-pink']);
      expect(lines.reduce((n, l) => n + l.linePence, 0)).toBe(EVE_PRICE_PENCE * qty);
      expect(lines.every((l) => l.qty === qty && l.linePence === l.unitPricePence * qty)).toBe(true);
      expect(lines.find((l) => l.piece === 'mug')!.art).toEqual(B);
    }
    // shared like their own prices (£35 : £21 : £18)
    expect(expandEve(6200, 1, b, SHELF).map((l) => l.unitPricePence)).toEqual([2933, 1759, 1508]);
  });

  it('the mug colours map to the seeded variant skus; only the bundle key is the bundle', () => {
    expect(mugSkuFor('blue')).toBe('mug');
    expect(mugSkuFor('yellow')).toBe('mug-11oz-yellow');
    expect(isEveKey('christmasEveBundle')).toBe(true);
    expect(isEveKey('christmasBundle')).toBe(false);
  });
});

// The three pieces' real costs (Prodigi GB sheets, Standard, ex-VAT): sack £15, ornament £8, mug £5,
// each £4.30 post alone and +£1 in the same parcel.
const CAT: PricedCatalogue = {
  christmasEveBundle: { pricePence: 6200, label: 'christmas eve bundle' },
  sack: { pricePence: 3500, label: 'christmas sack', unitCostPence: 1930, postFirstPence: 430, postExtraPence: 100 },
  ceramicOrnament: { pricePence: 2100, label: 'ceramic christmas ornament', unitCostPence: 1230, postFirstPence: 430, postExtraPence: 100 },
  mug: { pricePence: 1800, label: 'mug', unitCostPence: 930, postFirstPence: 430, postExtraPence: 100 },
  christmasBundle: { pricePence: 9000, label: 'christmas family bundle' },
};

describe('christmas eve bundle — its own multi-buy, from its pieces’ costs', () => {
  const e = composedEconomics(6200, [CAT.sack, CAT.ceramicOrnament, CAT.mug])!;

  it('one bundle nets about £12 (≈23%); five at 15% off still ≈19% each (the founder’s check)', () => {
    expect(e).toMatchObject({ productCostPence: 2800, postFirstPence: 630, postExtraPence: 300, parcelSavingPerExtraPence: 0 });
    const one = netAt(e, 1, 0);
    expect(one.netPence).toBeGreaterThan(1150);
    expect(one.netPence / one.revenueExVatPence).toBeGreaterThan(0.22);
    const five = netAt(e, 5, 1500);
    expect(five.netPence / 5).toBeGreaterThan(780);
    expect(five.netPence / five.revenueExVatPence).toBeGreaterThan(0.17);
  });

  it('tiers 15/15/15/15', () => expect(multiBuyTiers(e)).toEqual([1500, 1500, 1500, 1500]));

  it('a piece with unknown costs ⇒ no offer', () => {
    expect(composedEconomics(6200, [CAT.sack, { pricePence: 2100, unitCostPence: null }, CAT.mug])).toBeNull();
  });

  it('counts bundles across lines (one per child): 3 bundles → 15% each, no parcel saving of its own', () => {
    const q = priceBasket(
      [
        { productKey: 'christmasEveBundle', qty: 1 },
        { productKey: 'christmasEveBundle', qty: 1 },
        { productKey: 'christmasEveBundle', qty: 1 },
      ],
      { catalogue: CAT },
    );
    expect(q.subtotalPence).toBe(18600);
    expect(q.multiBuySavingPence).toBe(3 * 930);
    expect(q.parcelSavingPence).toBe(0);
    expect(tierFor(multiBuyTiers(e), 3)).toBe(1500);
  });

  it('never takes a promo code (its saving is built in); the family bundle still doesn’t count', () => {
    const q = quote([{ productKey: 'christmasEveBundle', qty: 1 }], { catalogue: CAT, promo: { id: 'p', code: 'SAVE', kind: 'PERCENT', value: 1000, minSpendPence: 0, commissionBps: 0 } });
    expect(q.promo).toMatchObject({ applied: false, reason: 'nothing-eligible' });
    const fam = priceBasket([{ productKey: 'christmasBundle', qty: 1, bundle: { table: A } }, { productKey: 'christmasBundle', qty: 1, bundle: { table: A } }], { catalogue: CAT });
    expect(fam.multiBuySavingPence).toBe(0);
  });
});
