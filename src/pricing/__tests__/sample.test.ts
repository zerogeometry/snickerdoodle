import { describe, expect, it } from 'vitest';
import { cardFeeFor, costSampleLines, priceBasket, quote, SAMPLE_ECONOMICS, type PricedCatalogue, type PromoRule } from '@/pricing';
import { bundleCostPence } from '@/lib/christmas-bundle';
import { expandCardPack } from '@/lib/card-packs';

// (Made-up round costs: the real ones never go in this public repo.)
// An admin's SAMPLE ORDER at cost (founder, 25 Nov 2026): Prodigi's product + post (ex-VAT, shared parcels pay
// the "plus one"), + 20% VAT (the company is VAT-registered), + Stripe's fee, so the shop ends up even.
// The pricing engine only prices at cost when the SERVER passes `sample: true` (src/server/samples.ts decides).
const CAT: PricedCatalogue = {
  // landed = product + first post (ex-VAT), as product_variants.unit_cost_pence holds it
  mug: { pricePence: 1800, label: 'mug', unitCostPence: 1000, postFirstPence: 400, postExtraPence: 100 },
  teaTowel: { pricePence: 2700, label: 'tea towel', unitCostPence: 1200, postFirstPence: 400, postExtraPence: 100 },
  card: { pricePence: 550, label: 'greetings card', unitCostPence: 200, postFirstPence: 100, postExtraPence: 0 },
  framedPrint: { pricePence: 6500, label: 'framed print', unitCostPence: 4000, postFirstPence: 800, postExtraPence: 300 },
  'cardPack-5': { pricePence: 1200, label: 'card pack · 5', unitCostPence: 600 }, // no post split on file
  socks: { pricePence: 2000, label: 'socks' }, // no cost on file at all
  'christmasBundle-for4': { pricePence: 14500, label: 'christmas family bundle', unitCostPence: 5000 },
};
const FREE: PromoRule = { id: 'f', code: 'FIRSTCARD', kind: 'FREE_CARD', value: 0, minSpendPence: 0, commissionBps: 0 };
const PARTNER: PromoRule = { id: 'p', code: 'SCHOOL10', kind: 'PERCENT', value: 1000, minSpendPence: 0, commissionBps: 1000 };

/** What the company keeps from a charge of `total`: less the VAT it owes on it and Stripe's fee. */
const netAfterVatAndFee = (total: number) => total / (1 + SAMPLE_ECONOMICS.vatRate) - (SAMPLE_ECONOMICS.cardPct * total + SAMPLE_ECONOMICS.cardFixedPence);

describe('a sample order is priced at what it costs us', () => {
  it('one mug: product + post, + VAT, + the card fee — and the shop breaks even (to within a few pence)', () => {
    const q = quote([{ productKey: 'mug', qty: 1 }], { catalogue: CAT, sample: true });
    // cost ex-VAT: 600 product + 400 post = 1000 → +20% VAT = 1200
    expect(q.lines).toEqual([expect.objectContaining({ productKey: 'mug', qty: 1, unitPricePence: 1200, linePence: 1200 })]);
    expect(q.subtotalPence).toBe(1200);
    expect(q.sample).toEqual({ cardFeePence: q.deliveryPence, costExVatPence: 1000, noCostKeys: [] });
    expect(q.totalPence).toBe(1200 + q.deliveryPence);
    expect(q.deliveryPence).toBeGreaterThan(20); // at least Stripe's fixed 20p
    // the company nets at least the ex-VAT cost, and never more than a few pence over (rounding only)
    expect(netAfterVatAndFee(q.totalPence)).toBeGreaterThanOrEqual(1000);
    expect(netAfterVatAndFee(q.totalPence) - 1000).toBeLessThan(3);
    expect(q.totalPence).toBeLessThan(1800); // well under the shelf price
  });

  it('items sharing a Prodigi parcel pay the "plus one" post after the first (mug + tea towel are both uk9)', () => {
    const q = quote([{ productKey: 'mug', qty: 1 }, { productKey: 'teaTowel', qty: 1 }], { catalogue: CAT, sample: true });
    // mug 600 + 400 first post = 1000; tea towel 800 product + 100 extra post = 900
    expect(q.sample?.costExVatPence).toBe(1000 + 900);
    expect(q.lines.map((l) => l.linePence)).toEqual([1200, 1080]);
  });

  it('more of the same: the first pays the first post, the rest the "plus one"', () => {
    const q = quote([{ productKey: 'mug', qty: 3 }], { catalogue: CAT, sample: true });
    expect(q.sample?.costExVatPence).toBe(3 * 600 + 400 + 2 * 100);
    // the unit price covers the line (rounded UP so the line is never below cost + VAT)
    expect(q.lines[0]!.linePence).toBeGreaterThanOrEqual(Math.ceil((3 * 600 + 400 + 2 * 100) * 1.2));
    expect(q.lines[0]!.linePence).toBe(q.lines[0]!.unitPricePence * 3);
  });

  it('products in different parcels each pay their own first post', () => {
    const q = quote([{ productKey: 'mug', qty: 1 }, { productKey: 'framedPrint', qty: 1 }], { catalogue: CAT, sample: true });
    expect(q.sample?.costExVatPence).toBe(1000 + 4000);
  });

  it('a product without a cost on file is charged its shelf price (never below cost) and named', () => {
    const q = quote([{ productKey: 'socks', qty: 2 }, { productKey: 'mug', qty: 1 }], { catalogue: CAT, sample: true });
    expect(q.sample?.noCostKeys).toEqual(['socks']);
    expect(q.lines[0]).toMatchObject({ productKey: 'socks', unitPricePence: 2000, linePence: 4000 });
    expect(q.sample?.costExVatPence).toBe(1000);
  });

  it('a cost with no post split on file: every unit pays its whole landed cost', () => {
    const q = quote([{ productKey: 'cardPack-5', qty: 1 }], { catalogue: CAT, sample: true });
    expect(q.sample?.costExVatPence).toBe(600);
    expect(q.lines[0]!.linePence).toBe(720);
  });

  it('a card pack at cost still splits evenly between its cards (a 5 or a 10), so the order can be placed', () => {
    const cat: PricedCatalogue = { cardPack: { pricePence: 1200, label: 'pack of 5', unitCostPence: 653, postFirstPence: 95, postExtraPence: 0 }, 'cardPack-packof10': { pricePence: 2100, label: 'pack of 10', unitCostPence: 1197, postFirstPence: 95, postExtraPence: 0 } };
    const q = quote([{ productKey: 'cardPack', qty: 1 }, { productKey: 'cardPack-packof10', qty: 2 }], { catalogue: cat, sample: true });
    const [five, ten] = q.lines;
    expect(five!.unitPricePence % 10).toBe(0);
    expect(ten!.unitPricePence % 10).toBe(0);
    expect(five!.unitPricePence).toBeGreaterThanOrEqual(Math.ceil(653 * 1.2)); // never under cost + VAT
    const card = { assetId: 'a', transform: {} };
    expect(() => expandCardPack(five!.unitPricePence, 5, Array.from({ length: 5 }, () => card), undefined, five!.qty)).not.toThrow();
    expect(() => expandCardPack(ten!.unitPricePence, 10, Array.from({ length: 10 }, () => card), undefined, ten!.qty)).not.toThrow();
  });

  it('the christmas bundle is costed from its pieces (src/lib/christmas-bundle.ts)', () => {
    const q = quote([{ productKey: 'christmasBundle-for4', qty: 1 }], { catalogue: CAT, sample: true });
    expect(q.sample?.costExVatPence).toBe(bundleCostPence(4));
    expect(q.totalPence).toBeLessThan(14500);
  });

  it('no code, credit or free card ever rides on a sample — and it earns no partner anything', () => {
    for (const promo of [FREE, PARTNER]) {
      const q = priceBasket([{ productKey: 'card', qty: 1 }, { productKey: 'mug', qty: 1 }], { catalogue: CAT, sample: true, promo, creditAvailablePence: 5000, freeCardEligible: true });
      expect(q.promo).toBeNull();
      expect(q.promoSavingPence).toBe(0);
      expect(q.partnerCommissionPence).toBe(0);
      expect(q.creditPence).toBe(0);
      expect([q.familySetSavingPence, q.parcelSavingPence, q.multiBuySavingPence]).toEqual([0, 0, 0]);
    }
  });

  it('keys we don’t sell are still refused, and quantities still clamped', () => {
    const q = quote([{ productKey: 'notAThing', qty: 1 }, { productKey: 'mug', qty: 500 }], { catalogue: CAT, sample: true });
    expect(q.rejectedKeys).toEqual(['notAThing']);
    expect(q.lines[0]!.qty).toBe(99);
  });

  it('any price a request carries is ignored: the cost comes from the server catalogue', () => {
    const forged = [{ productKey: 'mug', qty: 1, unitPricePence: 1, pricePence: 1, costPence: 1 }] as unknown as Parameters<typeof quote>[0];
    expect(quote(forged, { catalogue: CAT, sample: true }).subtotalPence).toBe(1200);
  });
});

describe('without the server saying "sample", the price is the normal one', () => {
  const basket = [{ productKey: 'mug', qty: 1 }, { productKey: 'framedPrint', qty: 1 }];
  const normal = quote(basket, { catalogue: CAT });

  it('absent, false, or anything that isn’t exactly true ⇒ shelf prices, no sample', () => {
    expect(normal.sample).toBeUndefined();
    expect(normal.subtotalPence).toBe(1800 + 6500);
    for (const flag of [undefined, false, 'true', 1, {}, 'yes'] as unknown[]) {
      const q = quote(basket, { catalogue: CAT, sample: flag as boolean });
      expect(q).toEqual(normal);
    }
  });

  it('a sample really is cheaper than the shelf', () => {
    expect(quote(basket, { catalogue: CAT, sample: true }).totalPence).toBeLessThan(normal.totalPence);
  });
});

describe('the card fee', () => {
  it('leaves the company the goods’ ex-VAT amount after VAT on the whole charge and Stripe’s 1.5% + 20p', () => {
    for (const subtotal of [120, 999, 1200, 5000, 23_456, 100_000]) {
      const fee = cardFeeFor(subtotal);
      const total = subtotal + fee;
      expect(netAfterVatAndFee(total)).toBeGreaterThanOrEqual(subtotal / 1.2 - 1e-6);
      // and no more than a penny's rounding over
      expect(netAfterVatAndFee(total - 1)).toBeLessThan(subtotal / 1.2);
    }
  });

  it('nothing to pay ⇒ no fee', () => {
    expect(cardFeeFor(0)).toBe(0);
    expect(costSampleLines([], CAT)).toMatchObject({ lines: [], subtotalPence: 0, cardFeePence: 0, totalPence: 0 });
  });
});
