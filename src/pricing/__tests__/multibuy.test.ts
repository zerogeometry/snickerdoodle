import { describe, expect, it } from 'vitest';
import { economicsOf, hasMultiBuy, MULTI_BUY, multiBuyTiers, netAt, priceBasket, quote, tierFor, type PricedCatalogue, type PromoRule, type UnitEconomics } from '@/pricing';

// Real unit economics: Prodigi's GB cost sheets (product cost, first post, "plus one" post — Standard,
// ex-VAT) at today's shelf prices; the christmas table packs + the dated calendar from sandbox quotes.
const G = 300; // in a parcel group: £3 off each extra
const e = (price: number, landed: number, first: number, extra: number, grouped = true): UnitEconomics => ({
  pricePence: price, productCostPence: landed - first, postFirstPence: first, postExtraPence: extra, parcelSavingPerExtraPence: grouped ? G : 0,
});
const pct = (tiers: number[]) => tiers.map((b) => b / 100).join('/');

describe('multi-buy tiers — derived from each product’s cost (founder, 27 Oct)', () => {
  // The founder's model's results (go-to-market plan), reproduced from live cost data.
  const FIXTURES: Array<[string, UnitEconomics, string]> = [
    ['mug', e(1800, 930, 430, 100), '15/15/15/15'],
    ['kids tee', e(2500, 1230, 430, 150, false), '15/15/15/15'],
    ['adult tee', e(3200, 1630, 430, 150, false), '15/15/15/15'],
    ['jigsaw, 30 pieces', e(2600, 1675, 675, 0, false), '15/15/15/15'],
    ['framed print 11×14', e(6500, 3785, 785, 300, false), '10/15/15/15'],
    ['12″ square cushion', e(3000, 1630, 430, 100), '15/15/15/15'],
    ['18″ round cushion', e(3000, 1730, 430, 100), '10/10/10/10'],
    ['heart cushion', e(2200, 1330, 430, 100), '5/5/10/10'],
    ['22″ square cushion — no offer', e(4000, 2530, 430, 100), '0/0/0/0'],
    ['blanket, medium', e(6000, 3630, 430, 100), '5/5/5/5'],
    ['blanket, large', e(7500, 4330, 430, 100), '5/10/10/10'],
    ['card pack of 10', e(2100, 1185, 85, 0, false), '10/10/10/10'],
    ['calendar A4', e(2400, 1435, 435, 100), '5/10/10/10'],
    ['ceramic ornament', e(2100, 1230, 430, 100), '5/10/10/10'],
    ['christmas sack', e(3500, 1930, 430, 100), '10/15/15/15'],
    ['wrapping paper 2 m', e(2300, 1370, 570, 100), '10/15/15/15'],
    ['wrapping paper 5 m', e(3800, 2270, 570, 100), '5/10/10/10'],
    ['tea towel', e(2700, 1630, 430, 100), '5/5/5/10'],
    ['placemats 4-pack (£60)', e(6000, 3680, 430, 100), '0/0/5/5'],
    ['coasters 6-pack', e(3200, 1930, 430, 100), '5/5/5/5'],
    // Where the REAL post differs from the plan's model (it assumed ~£1 for every extra item):
    // a second big frame posts at +£4.50 (the sheets), so less to give back…
    ['framed print 18×24 (+£4.50 a frame)', e(9000, 5475, 1075, 450, false), '5/10/10/10'],
    ['framed print 24×32 (+£4.50 a frame)', e(10500, 6745, 1245, 450, false), '0/5/5/5'],
    // …and socks ARE in a parcel group (uk9-socks, £3 off the second pair), which the plan left out.
    ['socks (£3 same-parcel saving too)', e(2000, 1180, 380, 50), '5/10/10/10'],
  ];
  for (const [name, econ, want] of FIXTURES) {
    it(`${name}: ${want}`, () => expect(pct(multiBuyTiers(econ))).toBe(want));
  }

  it('every tier keeps the order at ≥ 15% net, at every quantity it covers (2…12)', () => {
    for (const [name, econ] of FIXTURES) {
      const tiers = multiBuyTiers(econ);
      for (let q = 2; q <= MULTI_BUY.checkUpTo; q++) {
        const { netPence, revenueExVatPence } = netAt(econ, q, tierFor(tiers, q));
        expect(netPence / revenueExVatPence, `${name} × ${q}`).toBeGreaterThanOrEqual(0.15 - 1e-9);
      }
    }
  });

  it('never goes DOWN as the quantity rises, and never past 15%', () => {
    for (let price = 800; price <= 12000; price += 700)
      for (let cost = 200; cost < price * 0.7; cost += 450)
        for (const extra of [0, 100, 450]) {
          const tiers = multiBuyTiers({ pricePence: price, productCostPence: cost, postFirstPence: 430, postExtraPence: extra, parcelSavingPerExtraPence: G });
          expect(tiers.every((t, i) => i === 0 || t >= tiers[i - 1]!)).toBe(true);
          expect(Math.max(...tiers)).toBeLessThanOrEqual(1500);
          expect(tiers.every((t) => (MULTI_BUY.stepsBps as readonly number[]).includes(t))).toBe(true);
        }
  });

  it('unknown costs ⇒ no offer (the notice is never dishonest)', () => {
    expect(multiBuyTiers(null)).toEqual([0, 0, 0, 0]);
    expect(economicsOf({ pricePence: 3100, unitCostPence: null, postFirstPence: 430, postExtraPence: 100 }, true)).toBeNull();
    expect(economicsOf({ pricePence: 3100, unitCostPence: 2000, postFirstPence: null, postExtraPence: 100 }, true)).toBeNull();
    expect(economicsOf(undefined, true)).toBeNull();
    expect(hasMultiBuy([0, 0, 0, 0])).toBe(false);
    expect(hasMultiBuy([0, 0, 500, 500])).toBe(true);
  });

  it('the tier for a quantity: none for one, 5+ covers every bigger basket', () => {
    const t = [500, 1000, 1200, 1500];
    expect([1, 2, 3, 4, 5, 9].map((q) => tierFor(t, q))).toEqual([0, 500, 1000, 1200, 1500, 1500]);
  });
});

// ── the pricing engine ─────────────────────────────────────────────────────────────────────────
const CAT: PricedCatalogue = {
  mug: { pricePence: 1800, label: 'mug', unitCostPence: 930, postFirstPence: 430, postExtraPence: 100 },
  'mug-black': { pricePence: 1800, label: 'mug · black', unitCostPence: 930, postFirstPence: 430, postExtraPence: 100 },
  framedPrint: { pricePence: 6500, label: 'framed print', unitCostPence: 3785, postFirstPence: 785, postExtraPence: 300 },
  'cushion-22square': { pricePence: 4000, label: 'cushion · 22″', unitCostPence: 2530, postFirstPence: 430, postExtraPence: 100 },
  heightChart: { pricePence: 3100, label: 'height chart', unitCostPence: null },
  kidsTee: { pricePence: 2500, label: 'kids tee', unitCostPence: 1230, postFirstPence: 430, postExtraPence: 150 },
  christmasBundle: { pricePence: 9000, label: 'christmas family bundle', unitCostPence: 5000, postFirstPence: 430, postExtraPence: 100 },
};
const p = (items: Array<{ productKey: string; qty: number; bundle?: unknown }>, o: Parameters<typeof priceBasket>[1] = {}) => priceBasket(items, { catalogue: CAT, ...o });

describe('pricing — multi-buy in the basket', () => {
  it('counts the SAME product across lines — any drawing, any variant', () => {
    // two mug lines (different drawings / colours) = 2 mugs → 15% each; parcel saving £3 on top
    const q = p([{ productKey: 'mug', qty: 1 }, { productKey: 'mug-black', qty: 1 }]);
    expect(q.multiBuySavingPence).toBe(270 + 270);
    expect(q.lines.map((l) => [l.multiBuyBps, l.multiBuySavingPence])).toEqual([[1500, 270], [1500, 270]]);
    expect(q.parcelSavingPence).toBe(300); // postage — stacks
    expect(q.totalPence).toBe(3600 - 540 - 300);
  });

  it('one of a product earns nothing; different products don’t count together', () => {
    expect(p([{ productKey: 'mug', qty: 1 }]).multiBuySavingPence).toBe(0);
    expect(p([{ productKey: 'mug', qty: 1 }, { productKey: 'framedPrint', qty: 1 }]).multiBuySavingPence).toBe(0);
  });

  it('each line at ITS variant’s tier for the product’s quantity (frames: 10% for two, 15% for three)', () => {
    expect(p([{ productKey: 'framedPrint', qty: 2 }]).multiBuySavingPence).toBe(1300);
    expect(p([{ productKey: 'framedPrint', qty: 3 }]).multiBuySavingPence).toBe(Math.round(19500 * 0.15));
  });

  it('a product with no offer (22″ cushion), or unknown costs (height chart), is never discounted', () => {
    expect(p([{ productKey: 'cushion-22square', qty: 5 }]).multiBuySavingPence).toBe(0);
    expect(p([{ productKey: 'heightChart', qty: 5 }]).multiBuySavingPence).toBe(0);
  });

  it('the family bundle never counts and is never discounted again', () => {
    const b = { table: { assetId: 'a' } };
    const q = p([{ productKey: 'christmasBundle', qty: 1, bundle: b }, { productKey: 'christmasBundle', qty: 1, bundle: b }, { productKey: 'mug', qty: 1 }]);
    expect(q.multiBuySavingPence).toBe(0);
    expect(q.lines.every((l) => !l.multiBuyBps)).toBe(true);
  });

  it('never stacks with the join saving — the bigger one wins', () => {
    const join = { savingBps: 500 } as Parameters<typeof priceBasket>[1] extends infer O ? (O extends { joinContext?: infer J } ? NonNullable<J> : never) : never;
    // 2 mugs: multi-buy 15% (£5.40) beats 5% join (£1.80) → join dropped
    const two = p([{ productKey: 'mug', qty: 2 }], { joinContext: join });
    expect([two.multiBuySavingPence, two.joinSavingPence]).toEqual([540, 0]);
    // a single framed print: no multi-buy → the join saving stands
    const one = p([{ productKey: 'framedPrint', qty: 1 }], { joinContext: join });
    expect([one.multiBuySavingPence, one.joinSavingPence]).toEqual([0, 325]);
  });

  it('never stacks with the family-set saving on garments either', () => {
    const q = p([{ productKey: 'kidsTee', qty: 3 }]);
    expect(q.multiBuySavingPence).toBe(Math.round(7500 * 0.15));
    expect(q.familySetSavingPence).toBe(0);
  });

  it('never stacks with a promo code — the best single saving wins', () => {
    const rule = (value: number): PromoRule => ({ id: 'p', code: 'SAVE', kind: 'PERCENT', value, minSpendPence: 0, commissionBps: 0 });
    // a 10% code on 2 mugs is smaller than multi-buy 15% + parcel → the code steps aside
    const small = quote([{ productKey: 'mug', qty: 2 }], { catalogue: CAT, promo: rule(1000) });
    expect(small.promo).toMatchObject({ applied: false, reason: 'better-saving-applied' });
    expect(small.multiBuySavingPence).toBe(540);
    // a code that beats it replaces it (and the parcel saving) — never both
    const big = quote([{ productKey: 'framedPrint', qty: 2 }], { catalogue: CAT, promo: { id: 'p', code: 'BIG', kind: 'FIXED', value: 2000, minSpendPence: 0, commissionBps: 0 } });
    if (big.promo?.applied) {
      expect(big.multiBuySavingPence).toBe(0);
      expect(big.lines.every((l) => !l.multiBuyBps)).toBe(true);
    } else {
      expect(big.promoSavingPence).toBe(0);
    }
    expect(big.promoSavingPence > 0 && big.multiBuySavingPence > 0).toBe(false);
  });

  it('margin guard: what the basket charges keeps every multi-buy order at ≥ 15% net', () => {
    for (const [key, q] of [['mug', 2], ['mug', 6], ['framedPrint', 2], ['framedPrint', 4], ['kidsTee', 5]] as const) {
      const r = p([{ productKey: key, qty: q }]);
      const c = CAT[key]!;
      const paid = r.totalPence;
      const revenue = paid / 1.2;
      const fulfil = q * (c.unitCostPence! - c.postFirstPence!) + c.postFirstPence! + (q - 1) * c.postExtraPence!;
      const net = revenue - fulfil - (0.015 * paid + 20) - 0.03 * fulfil - 0.05 * revenue - 55;
      expect(net / revenue, `${key} × ${q}`).toBeGreaterThanOrEqual(0.15 - 1e-9);
    }
  });
});
