import { describe, expect, it } from 'vitest';
import { expandBundle } from '@/lib/christmas-bundle';
import { receiptLines, receiptSavings, type StoredOrderLine } from '@/lib/order-lines';

// 05-B5 (sweep 29 Oct): the receipt listed a bundle as "placemats — £63.26 · coaster-packof4 — £19.46 ·
// ceramic christmas ornament × 4 — £62.28", with no savings, so nothing added up.
describe('05-B5: how an order reads on the receipt and the orders page', () => {
  const art = { assetId: 'a' };
  const parts = expandBundle(14500, { placemat: art, coaster: null, ornaments: [art, art, art, art] } as never, 4);

  it('a christmas bundle is ONE line at its price, however many pieces it was made as', () => {
    const lines: StoredOrderLine[] = [
      ...parts.map((p) => ({ productKey: p.sku, qty: p.qty, linePence: p.linePence, bundleKey: 'christmasBundle-for4' })),
      { productKey: 'mug', qty: 2, linePence: 3600, spec: { attributes: { size: '11oz', colour: 'blue' } } },
      { productKey: 'coaster-packof4', qty: 1, linePence: 2600, spec: { attributes: { size: 'pack of 4' } } },
    ];
    expect(parts.length).toBeGreaterThan(1);
    expect(receiptLines(lines)).toEqual([
      { productKey: 'christmasBundle', label: 'christmas family bundle · a set for 4', qty: 1, linePence: 14500 },
      { productKey: 'mug', label: 'mug · 11oz, blue', qty: 2, linePence: 3600 },
      { productKey: 'coaster', label: 'coasters · pack of 4', qty: 1, linePence: 2600 },
    ]);
  });

  it('never shows a raw sku, and two bundles stay two lines', () => {
    const two: StoredOrderLine[] = [
      { productKey: 'placemat-packof2', qty: 1, linePence: 3000, bundleKey: 'christmasBundle' },
      { productKey: 'placemat', qty: 1, linePence: 9000, bundleKey: 'christmasBundle-for4' },
      { productKey: 'coaster-packof2', qty: 1, linePence: 4800, bundleKey: 'christmasBundle' },
      { productKey: 'something-new', qty: 1, linePence: 100 },
    ];
    const out = receiptLines(two);
    expect(out.map((l) => [l.label, l.linePence])).toEqual([
      ['christmas family bundle · a set for 2', 7800],
      ['christmas family bundle · a set for 4', 9000],
      ['keepsake', 100],
    ]);
    for (const l of out) expect(l.label).not.toMatch(/-|packof/);
  });

  it('lists only the savings the order got', () => {
    expect(receiptSavings({ joinSavingPence: 0, familySetSavingPence: 0, parcelSavingPence: 900, multiBuySavingPence: 540, promoSavingPence: 0, creditAppliedPence: 0 })).toEqual([
      { label: 'same-parcel saving', pence: 900 },
      { label: 'buy more & save', pence: 540 },
    ]);
  });
});
