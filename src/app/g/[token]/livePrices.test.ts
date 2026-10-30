import { describe, expect, it } from 'vitest';
import { CATALOGUE, quote, type PricedCatalogue } from '@/pricing';
import { withLivePrices } from './livePrices';

// 06-B3 (sweep 29 Oct): after a price change the gift page showed the shared price on the line
// (£65) but totalled — and charged — the live one (£70).
describe('06-B3: a gift list’s lines show the price checkout charges', () => {
  const shared = [
    { assetId: 'a', productKey: 'framedPrint', label: 'framed print', unitPricePence: 6500 },
    { assetId: 'b', productKey: 'mug', label: 'mug', unitPricePence: 1800 },
  ];
  const repriced: PricedCatalogue = { ...CATALOGUE, framedPrint: { ...CATALOGUE.framedPrint, pricePence: 7000 } };

  it('re-prices every line from the live catalogue, so the lines add up to the quoted subtotal', () => {
    const lines = withLivePrices(shared, repriced);
    expect(lines.map((l) => l.unitPricePence)).toEqual([7000, 1800]);
    const q = quote(shared.map((i) => ({ productKey: i.productKey, qty: 1 })), { gift: true, catalogue: repriced });
    expect(lines.reduce((n, l) => n + l.unitPricePence, 0)).toBe(q.subtotalPence);
  });

  it('never changes WHAT is offered, and keeps the shared price for a product no longer priced', () => {
    const lines = withLivePrices([...shared, { assetId: 'c', productKey: 'retired', label: 'old thing', unitPricePence: 1200 }], repriced);
    expect(lines.map((l) => [l.assetId, l.productKey, l.label])).toEqual([
      ['a', 'framedPrint', 'framed print'],
      ['b', 'mug', 'mug'],
      ['c', 'retired', 'old thing'],
    ]);
    expect(lines[2]!.unitPricePence).toBe(1200);
    expect(shared[0]!.unitPricePence).toBe(6500); // the frozen snapshot itself is untouched
  });
});
