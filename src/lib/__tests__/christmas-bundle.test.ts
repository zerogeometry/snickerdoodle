import { describe, expect, it } from 'vitest';
import {
  BUNDLE_COMPONENT_SKUS,
  BUNDLE_ONLY_SKUS,
  COASTER_PACKS,
  PLACEMAT_PACKS,
  bundleCounts,
  bundleCountsOf,
  bundlePricePence,
  bundleSummary,
  expandBundle,
  isBundleKey,
  normalizeBundle,
  packsFor,
  pieceOfSku,
  type BundleSpec,
} from '@/lib/christmas-bundle';
import { PROMO_ECONOMICS } from '@/pricing';

const A = { assetId: 'a' };
const B = { assetId: 'b', sourceObjectId: 'cut-b' };
const C = { assetId: 'c' };
const spec = (o: Partial<BundleSpec> = {}): BundleSpec => ({ table: A, ornaments: [], sacks: [], extraPlacemats: 0, extraCoasters: 0, ...o });
const n = (k: number, x = A) => Array.from({ length: k }, () => x);

describe('christmas family bundle — the founder’s prices (27 Oct)', () => {
  it('the base set is £90', () => {
    expect(bundlePricePence(bundleCounts(spec()))).toBe(9000);
  });
  it('base + 4 ornaments = £150', () => {
    expect(bundlePricePence(bundleCounts(spec({ ornaments: n(4) })))).toBe(15000);
  });
  it('+ 2 sacks = £204', () => {
    expect(bundlePricePence(bundleCounts(spec({ ornaments: n(4), sacks: n(2) })))).toBe(20400);
  });
  it('+ 4 sacks = £258', () => {
    expect(bundlePricePence(bundleCounts(spec({ ornaments: n(4), sacks: n(4) })))).toBe(25800);
  });
  it('6 placemats, 8 coasters, 6 ornaments, 6 sacks = £385', () => {
    expect(bundlePricePence(bundleCounts(spec({ ornaments: n(6), sacks: n(6), extraPlacemats: 2, extraCoasters: 2 })))).toBe(38500);
  });
  it('each add-on: ornament £15, sack £27, placemat £16, a pair of coasters £11', () => {
    expect(bundlePricePence(bundleCounts(spec({ ornaments: n(1) })))).toBe(10500);
    expect(bundlePricePence(bundleCounts(spec({ sacks: n(1) })))).toBe(11700);
    expect(bundlePricePence(bundleCounts(spec({ extraPlacemats: 1 })))).toBe(10600);
    expect(bundlePricePence(bundleCounts(spec({ extraCoasters: 2 })))).toBe(10100);
  });
});

describe('untrusted input → a bundle the server will make', () => {
  it('no table drawing = no bundle', () => {
    expect(normalizeBundle(null)).toBeNull();
    expect(normalizeBundle({ ornaments: [A] })).toBeNull();
    expect(normalizeBundle({ table: { assetId: '' } })).toBeNull();
    expect(normalizeBundle({ table: 'a' })).toBeNull();
  });
  it('caps every add-on at 12, drops junk slots, keeps coasters in pairs', () => {
    const b = normalizeBundle({ table: A, ornaments: [...n(20), null, 'x', { assetId: 7 }], sacks: n(13, B), extraPlacemats: 99, extraCoasters: 7 })!;
    expect(b.ornaments).toHaveLength(12);
    expect(b.sacks).toHaveLength(12);
    expect(b.extraPlacemats).toBe(12);
    expect(b.extraCoasters).toBe(6); // 7 → a whole number of pairs
    expect(normalizeBundle({ table: A, extraCoasters: 400 })!.extraCoasters).toBe(12);
  });
  it('negative / fractional / non-number counts are never trusted', () => {
    for (const v of [-3, 2.9, NaN, Infinity, '4', null]) {
      const b = normalizeBundle({ table: A, extraPlacemats: v, extraCoasters: v })!;
      expect(b.extraPlacemats).toBe(v === 2.9 ? 2 : 0);
      expect(b.extraCoasters).toBe(v === 2.9 ? 2 : 0);
    }
  });
  it('a price smuggled in is ignored — the counts decide it', () => {
    const b = normalizeBundle({ table: A, ornaments: n(4), pricePence: 1, unitPricePence: 1 })!;
    expect(bundlePricePence(bundleCounts(b))).toBe(15000);
    expect(bundleCountsOf({ pricePence: 1 })).toEqual({ ornaments: 0, sacks: 0, extraPlacemats: 0, extraCoasters: 0 });
  });
  it('only the bundle key (and its skus) is a bundle', () => {
    expect(isBundleKey('christmasBundle')).toBe(true);
    expect(isBundleKey('christmasBundleX')).toBe(false);
    expect(isBundleKey('placemat')).toBe(false);
  });
});

describe('packs — only what Prodigi makes, biggest first', () => {
  const sizes = (p: { size: number }[]) => p.map((x) => x.size);
  it('every count from 1 to 12 resolves to valid placemat + coaster SKUs', () => {
    for (const packs of [PLACEMAT_PACKS, COASTER_PACKS]) {
      const valid = new Set(packs.map((p) => p.prodigiSku));
      for (let k = 1; k <= 12; k++) {
        const got = packsFor(k, packs);
        expect(got.reduce((s, p) => s + p.size, 0), `${k}`).toBe(k);
        expect(got.every((p) => valid.has(p.prodigiSku))).toBe(true);
        expect(sizes(got)).toEqual([...sizes(got)].sort((a, b) => b - a)); // biggest first
      }
    }
  });
  it('every table the bundle can make resolves too (4–16 placemats, 6–18 coasters)', () => {
    for (let k = 4; k <= 16; k++) expect(packsFor(k, PLACEMAT_PACKS).reduce((s, p) => s + p.size, 0)).toBe(k);
    for (let k = 6; k <= 18; k += 2) expect(packsFor(k, COASTER_PACKS).reduce((s, p) => s + p.size, 0)).toBe(k);
  });
  it('the fewest items: the base set is one 4-pack + one 6-pack; 6 placemats one 6-pack', () => {
    expect(packsFor(4, PLACEMAT_PACKS).map((p) => p.prodigiSku)).toEqual(['H-PLACE-4PK']);
    expect(packsFor(6, COASTER_PACKS).map((p) => p.prodigiSku)).toEqual(['H-COAST-6PK']);
    expect(packsFor(6, PLACEMAT_PACKS).map((p) => p.prodigiSku)).toEqual(['H-PLACE-6PK']);
    expect(packsFor(8, COASTER_PACKS).map((p) => p.prodigiSku)).toEqual(['H-COAST-6PK', 'H-COAST-2PK']);
    expect(packsFor(7, PLACEMAT_PACKS).map((p) => p.prodigiSku)).toEqual(['H-PLACE-6PK', 'H-PLACE-1PK']);
  });
  it('0 / fractional counts are refused', () => {
    expect(() => packsFor(0, PLACEMAT_PACKS)).toThrow();
    expect(() => packsFor(2.5, PLACEMAT_PACKS)).toThrow();
  });
  it('the pack variants that only exist for the bundle are the non-standalone ones', () => {
    expect([...BUNDLE_ONLY_SKUS].sort()).toEqual(['coaster-packof1', 'coaster-packof2', 'coaster-packof4', 'placemat-packof1', 'placemat-packof2', 'placemat-packof6']);
    expect(BUNDLE_COMPONENT_SKUS).toContain('ceramicOrnament');
    expect(BUNDLE_COMPONENT_SKUS).toContain('sack');
    expect(BUNDLE_COMPONENT_SKUS.map(pieceOfSku).every(Boolean)).toBe(true);
  });
});

describe('expanding a bundle into order lines', () => {
  const sum = (ls: { linePence: number }[]) => ls.reduce((s, l) => s + l.linePence, 0);

  it('the base set: one placemat 4-pack + one coaster 6-pack, £58 + £32', () => {
    const lines = expandBundle(9000, spec());
    expect(lines.map((l) => [l.sku, l.qty, l.linePence])).toEqual([
      ['placemat', 1, 5800],
      ['coaster', 1, 3200],
    ]);
  });

  it('the biggest example: lines add up to £385 to the penny; ornaments + sacks grouped by design', () => {
    const b = spec({ ornaments: [A, B, B, C, C, C], sacks: [A, A, A, B, B, B], extraPlacemats: 2, extraCoasters: 2 });
    const lines = expandBundle(38500, b);
    expect(sum(lines)).toBe(38500);
    expect(lines.filter((l) => l.piece === 'placemat').map((l) => l.sku)).toEqual(['placemat-packof6']);
    expect(lines.filter((l) => l.piece === 'coaster').map((l) => l.sku)).toEqual(['coaster', 'coaster-packof2']);
    const orn = lines.filter((l) => l.piece === 'ceramicOrnament');
    expect(orn.map((l) => [l.art.assetId, l.qty, l.unitPricePence])).toEqual([['a', 1, 1500], ['b', 2, 1500], ['c', 3, 1500]]);
    expect(orn.find((l) => l.art.assetId === 'b')!.art.sourceObjectId).toBe('cut-b'); // the cutout rides along
    expect(lines.filter((l) => l.piece === 'sack').map((l) => [l.qty, l.linePence])).toEqual([[3, 8100], [3, 8100]]);
    // the table drawing goes on every placemat + coaster
    expect(lines.filter((l) => l.piece === 'placemat' || l.piece === 'coaster').every((l) => l.art === b.table)).toBe(true);
    // ONE Prodigi item per pack: 1 placemat pack + 2 coaster packs + 6 ornaments + 6 sacks
    expect(lines.reduce((s, l) => s + l.qty, 0)).toBe(15);
  });

  it('every composition up to the caps splits exactly, in whole pennies, never below zero', () => {
    for (let o = 0; o <= 12; o += 3)
      for (let s = 0; s <= 12; s += 4)
        for (let p = 0; p <= 12; p++)
          for (let c = 0; c <= 12; c += 2) {
            const b = spec({ ornaments: n(o), sacks: n(s, B), extraPlacemats: p, extraCoasters: c });
            const price = bundlePricePence(bundleCounts(b));
            const lines = expandBundle(price, b);
            expect(sum(lines)).toBe(price);
            expect(lines.every((l) => Number.isInteger(l.unitPricePence) && l.unitPricePence > 0 && l.linePence === l.unitPricePence * l.qty)).toBe(true);
          }
  });

  it('a price that isn’t this bundle’s is refused (the charge and the parcel must agree)', () => {
    expect(() => expandBundle(9000, spec({ ornaments: n(1) }))).toThrow(/doesn’t match/);
    expect(() => expandBundle(10499, spec({ ornaments: n(1) }))).toThrow(/doesn’t match/);
  });

  it('the summary reads like the parcel', () => {
    expect(bundleSummary(bundleCounts(spec({ ornaments: n(4), sacks: n(1), extraCoasters: 2 })))).toBe('4 placemats · 8 coasters · 4 ornaments · 1 sack');
  });
});

/**
 * The MARGIN GUARD for the bundle: every composition keeps at least the promo floor (10% of ex-VAT
 * revenue) after Prodigi's product cost, postage and card fees. Prodigi costs (ex-VAT, GB, 27 Oct):
 * placemat packs £9 / £16.50 / £32.50 / £48.50, coaster packs £4 / £5.50 / £10 / £15, ceramic ornament
 * £8, sack £15. Postage modelled pessimistically at £4.30 + £1.50 per extra item (the sandbox quote
 * for the biggest example was £21.30 for 15 items in one parcel; this model says £25.30).
 */
describe('margin guard — the bundle never sells below the floor', () => {
  const COST: Record<string, number> = {
    'H-PLACE-1PK': 900, 'H-PLACE-2PK': 1650, 'H-PLACE-4PK': 3250, 'H-PLACE-6PK': 4850,
    'H-COAST-1PK': 400, 'H-COAST-2PK': 550, 'H-COAST-4PK': 1000, 'H-COAST-6PK': 1500,
  };
  const prodigiSkuOf = (sku: string) => [...PLACEMAT_PACKS, ...COASTER_PACKS].find((p) => p.sku === sku)?.prodigiSku;
  const unitCost = (sku: string) => (sku === 'ceramicOrnament' ? 800 : sku === 'sack' ? 1500 : COST[prodigiSkuOf(sku)!]!);

  it('holds for every count of every add-on (0–12)', () => {
    const e = PROMO_ECONOMICS;
    let worst = Infinity;
    for (let o = 0; o <= 12; o++)
      for (let s = 0; s <= 12; s++)
        for (const p of [0, 1, 3, 5, 12])
          for (const c of [0, 2, 4, 12]) {
            const b = spec({ ornaments: n(o), sacks: n(s), extraPlacemats: p, extraCoasters: c });
            const price = bundlePricePence(bundleCounts(b));
            const lines = expandBundle(price, b);
            const items = lines.reduce((k, l) => k + l.qty, 0);
            const cost = lines.reduce((k, l) => k + unitCost(l.sku) * l.qty, 0) + 430 + 150 * (items - 1);
            const exVat = price / (1 + e.vatRate);
            const contribution = exVat - e.stripePct * price - e.stripeFixedPence - cost;
            worst = Math.min(worst, contribution / exVat);
            expect(contribution, `${o} ornaments, ${s} sacks, +${p} placemats, +${c} coasters`).toBeGreaterThanOrEqual((exVat * e.floorBps) / 10000);
          }
    expect(worst).toBeGreaterThan(0.1);
  });
});
