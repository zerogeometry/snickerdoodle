import { describe, expect, it } from 'vitest';
import {
  BUNDLE_COMPONENT_SKUS, BUNDLE_ONLY_SKUS, BUNDLE_SIZES, TABLE_PACKS, bundleCostPence, bundleItems, bundleSizeOf, bundleSkuFor,
  bundleSummary, coasterArt, expandBundle, isBundleKey, normalizeBundle, pieceOfSku, type BundleSize,
} from '@/lib/christmas-bundle';
import { netAt } from '@/pricing/multibuy';

// The CHRISTMAS FAMILY BUNDLE (founder, 29 Oct): three sizes, no add-ons.
const A = { assetId: 'a' };
const B = { assetId: 'b' };
const C = { assetId: 'c', sourceObjectId: 'cut' };
const SIZES: BundleSize[] = [2, 4, 8];

describe('christmas family bundle — the three sizes', () => {
  it('pins the prices and skus: a set for 2 £78, for 4 £145, for 8 £279 — no other sizes', () => {
    expect(BUNDLE_SIZES.map((s) => [s.n, s.sku, s.pricePence])).toEqual([
      [2, 'christmasBundle', 7800],
      [4, 'christmasBundle-for4', 14500],
      [8, 'christmasBundle-for8', 27900],
    ]);
    expect(SIZES.map(bundleSkuFor)).toEqual(['christmasBundle', 'christmasBundle-for4', 'christmasBundle-for8']);
    expect(['christmasBundle', 'christmasBundle-for4', 'christmasBundle-for8'].map(bundleSizeOf)).toEqual([2, 4, 8]);
    for (const k of ['christmasBundle-for3', 'christmasBundle-for16', 'placemat', '', null, undefined]) expect(bundleSizeOf(k)).toBeNull();
    expect(isBundleKey('christmasBundle-for8')).toBe(true);
    expect(isBundleKey('christmasEveBundle')).toBe(false);
  });

  it('pins the Prodigi packs (all uk9): 2 → the 2-packs, 4 → the 4-packs, 8 → two 4-packs of each', () => {
    const packs = (n: BundleSize) => ({ placemat: [TABLE_PACKS[n].placemat.pack.prodigiSku, TABLE_PACKS[n].placemat.qty], coaster: [TABLE_PACKS[n].coaster.pack.prodigiSku, TABLE_PACKS[n].coaster.qty] });
    expect(packs(2)).toEqual({ placemat: ['H-PLACE-2PK', 1], coaster: ['H-COAST-2PK', 1] });
    expect(packs(4)).toEqual({ placemat: ['H-PLACE-4PK', 1], coaster: ['H-COAST-4PK', 1] });
    expect(packs(8)).toEqual({ placemat: ['H-PLACE-4PK', 2], coaster: ['H-COAST-4PK', 2] });
    for (const n of SIZES) {
      const t = TABLE_PACKS[n];
      expect(t.placemat.pack.pieces * t.placemat.qty, `placemats in a set for ${n}`).toBe(n);
      expect(t.coaster.pack.pieces * t.coaster.qty, `coasters in a set for ${n}`).toBe(n);
    }
  });

  it('pins the cost incl. post — £45.30 / £83.80 / £164.30 (a pack is one item: £4.30 first, +£1 each extra)', () => {
    expect(SIZES.map(bundleItems)).toEqual([4, 6, 12]);
    expect(SIZES.map(bundleCostPence)).toEqual([4530, 8380, 16430]);
  });

  it('keeps about 20% net after the card fee, 3% reprints, 5% codes allowance and £0.55 running', () => {
    for (const s of BUNDLE_SIZES) {
      const cost = bundleCostPence(s.n);
      const post = 430 + (bundleItems(s.n) - 1) * 100;
      const { netPence, revenueExVatPence } = netAt({ pricePence: s.pricePence, productCostPence: cost - post, postFirstPence: post, postExtraPence: 0, parcelSavingPerExtraPence: 0 }, 1, 0);
      const pct = netPence / revenueExVatPence;
      expect(pct, `a set for ${s.n}`).toBeGreaterThan(0.195);
      expect(pct, `a set for ${s.n}`).toBeLessThan(0.215);
    }
  });

  it('the bundle-only packs are never sold alone; the placemat 4-pack and the coaster 2/4/6-packs are', () => {
    for (const s of ['placemat-packof2', 'placemat-packof1', 'coaster-packof1']) expect(BUNDLE_ONLY_SKUS.has(s)).toBe(true);
    for (const s of ['placemat', 'coaster', 'coaster-packof2', 'coaster-packof4', 'ceramicOrnament']) expect(BUNDLE_ONLY_SKUS.has(s)).toBe(false);
    expect([...BUNDLE_COMPONENT_SKUS].sort()).toEqual(['ceramicOrnament', 'coaster-packof2', 'coaster-packof4', 'placemat', 'placemat-packof2']);
  });
});

describe('christmas family bundle — the drawings', () => {
  it('needs a placemat drawing; nothing else is required', () => {
    expect(normalizeBundle(null, 2)).toBeNull();
    expect(normalizeBundle({ ornaments: [A, A] }, 2)).toBeNull();
    expect(normalizeBundle({ placemat: { assetId: '' } }, 2)).toBeNull();
    expect(normalizeBundle({ table: A }, 2)).toBeNull(); // the old shape is not a bundle any more
  });

  it('the coasters wear the placemats’ drawing unless they have their own', () => {
    const plain = normalizeBundle({ placemat: A }, 4)!;
    expect(plain.coaster).toBeNull();
    expect(coasterArt(plain)).toEqual(A);
    expect(coasterArt(normalizeBundle({ placemat: A, coaster: B }, 4)!)).toEqual(B);
  });

  it('exactly one drawing per ornament: missing ones wear the placemats’, extras + junk are dropped', () => {
    expect(normalizeBundle({ placemat: A }, 2)!.ornaments).toEqual([A, A]);
    expect(normalizeBundle({ placemat: A, ornaments: [B] }, 4)!.ornaments).toEqual([B, A, A, A]);
    expect(normalizeBundle({ placemat: A, ornaments: [B, 'x', null, { assetId: 7 }, C, B, C, B] }, 2)!.ornaments).toEqual([B, C]);
    expect(normalizeBundle({ placemat: A, ornaments: Array.from({ length: 40 }, () => B) }, 8)!.ornaments).toHaveLength(8);
  });

  it('never carries anything but asset ids (+ a cutout id) — no prices, no counts', () => {
    const b = normalizeBundle({ placemat: { assetId: 'a', sourceObjectId: 's', pricePence: 1 }, pricePence: 1, extraPlacemats: 9, sacks: [A] }, 2)!;
    expect(b).toEqual({ placemat: { assetId: 'a', sourceObjectId: 's' }, coaster: null, ornaments: [{ assetId: 'a', sourceObjectId: 's' }, { assetId: 'a', sourceObjectId: 's' }] });
  });
});

describe('christmas family bundle — splitting an order into Prodigi items', () => {
  const lines = (n: BundleSize, price = BUNDLE_SIZES.find((s) => s.n === n)!.pricePence, o: Record<string, unknown> = {}) => expandBundle(price, normalizeBundle({ placemat: A, ...o }, n)!, n);

  it('adds up to the price to the penny, every size', () => {
    for (const s of BUNDLE_SIZES) {
      const ls = lines(s.n, s.pricePence, { coaster: B, ornaments: [A, B, C] });
      expect(ls.reduce((n, l) => n + l.linePence, 0), `a set for ${s.n}`).toBe(s.pricePence);
      for (const l of ls) expect(l.linePence).toBe(l.unitPricePence * l.qty);
    }
    // an awkward price still adds up exactly
    expect(lines(4, 14501).reduce((n, l) => n + l.linePence, 0)).toBe(14501);
  });

  it('makes the right items: one placemat pack + one coaster pack + N ornaments (8: two of each pack)', () => {
    const count = (ls: ReturnType<typeof lines>, sku: string) => ls.filter((l) => l.sku === sku).reduce((n, l) => n + l.qty, 0);
    const two = lines(2);
    expect([count(two, 'placemat-packof2'), count(two, 'coaster-packof2'), count(two, 'ceramicOrnament')]).toEqual([1, 1, 2]);
    const four = lines(4);
    expect([count(four, 'placemat'), count(four, 'coaster-packof4'), count(four, 'ceramicOrnament')]).toEqual([1, 1, 4]);
    const eight = lines(8);
    expect([count(eight, 'placemat'), count(eight, 'coaster-packof4'), count(eight, 'ceramicOrnament')]).toEqual([2, 2, 8]);
    expect(eight.every((l) => pieceOfSku(l.sku))).toBe(true);
  });

  it('each piece carries its own drawing: placemats, coasters (default the placemats’), each ornament', () => {
    const ls = lines(4, 14500, { coaster: B, ornaments: [C, C, B] });
    expect(ls.filter((l) => l.piece === 'placemat').every((l) => l.art === A || l.art.assetId === 'a')).toBe(true);
    expect(ls.filter((l) => l.piece === 'coaster').map((l) => l.art.assetId)).toEqual(['b']);
    const orn = ls.filter((l) => l.piece === 'ceramicOrnament');
    expect(orn.reduce((n, l) => n + l.qty, 0)).toBe(4);
    expect(new Set(orn.map((l) => `${l.art.assetId}:${l.art.sourceObjectId ?? ''}`))).toEqual(new Set(['c:cut', 'b:', 'a:']));
  });

  it('shares the price by what each item costs us (an ornament ~£8 of every £38)', () => {
    const ls = lines(2);
    const orn = ls.filter((l) => l.piece === 'ceramicOrnament').reduce((n, l) => n + l.linePence, 0);
    expect(Math.abs(orn - Math.round((7800 * 1600) / 3800))).toBeLessThanOrEqual(2);
  });

  it('refuses a price that isn’t one, or a spec that isn’t this size', () => {
    expect(() => expandBundle(0, normalizeBundle({ placemat: A }, 2)!, 2)).toThrow();
    expect(() => expandBundle(7800.5, normalizeBundle({ placemat: A }, 2)!, 2)).toThrow();
    expect(() => expandBundle(7800, normalizeBundle({ placemat: A }, 2)!, 4)).toThrow();
  });

  it('reads plainly in the basket', () => {
    expect(bundleSummary(4)).toBe('4 placemats · 4 coasters · 4 ornaments');
  });
});
