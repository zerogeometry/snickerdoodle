import { describe, expect, it } from 'vitest';
import type { BasketItem } from '@/lib/store';
import type { CatalogueProduct, CatalogueVariant } from '@/server/catalogue';
import { filterCatalogue, lineIdForSku, matchesQuery, productQtyInBasket, sizeDimsCm, splitCatalogue } from '@/lib/catalogue-view';

const variant = (sku: string, attrs: Record<string, string> = {}, isDefault = false): CatalogueVariant => ({
  id: `id-${sku}`, sku, attributes: attrs, pricePence: 1400, isDefault, printWmm: 209, printHmm: 98,
});
const product = (key: string, opts: Partial<CatalogueProduct> & { variants: CatalogueVariant[] }): CatalogueProduct => ({
  key, label: opts.label ?? key, blurb: opts.blurb ?? null, description: null, specs: {},
  category: opts.category ?? 'MUG', fromPence: 1400, sizes: opts.sizes ?? [], colours: opts.colours ?? [],
  orientations: opts.orientations ?? [],
  variants: opts.variants, popularRank: opts.popularRank ?? null,
});
const line = (id: string, qty: number, product: string): BasketItem => ({ id, name: id, product: product as BasketItem['product'], pricePence: 1400, qty });

// The mug: default variant sku === product key, plus customized size/colour variants.
const mug = product('mug', {
  category: 'MUG', popularRank: 2,
  variants: [variant('mug', { size: '11oz', colour: 'white' }, true), variant('mug-15oz-white', { size: '15oz', colour: 'white' }), variant('mug-11oz-pink', { size: '11oz', colour: 'pink' })],
});

describe('lineIdForSku — one scheme everywhere', () => {
  it('prefixes the sku', () => expect(lineIdForSku('mug-15oz-white')).toBe('cat-mug-15oz-white'));
});

describe('productQtyInBasket — the qty-shows-0 fix', () => {
  it('counts the DEFAULT variant line', () => {
    expect(productQtyInBasket([line('cat-mug', 2, 'mug')], mug)).toBe(2);
  });
  it('counts a CUSTOMIZED non-default variant line (the bug)', () => {
    // Before the fix the tile only checked `cat-mug`, so this 15oz line showed 0.
    expect(productQtyInBasket([line('cat-mug-15oz-white', 1, 'mug')], mug)).toBe(1);
  });
  it('sums across ALL the product variants', () => {
    const items = [line('cat-mug', 1, 'mug'), line('cat-mug-15oz-white', 2, 'mug'), line('cat-mug-11oz-pink', 1, 'mug')];
    expect(productQtyInBasket(items, mug)).toBe(4);
  });
  it('ignores other products lines', () => {
    expect(productQtyInBasket([line('cat-card', 3, 'card')], mug)).toBe(0);
  });
});

describe('splitCatalogue — Most Popular + your picks', () => {
  const card = product('card', { category: 'CARD', popularRank: 5, variants: [variant('card', {}, true)] });
  const tote = product('toteBag', { category: 'BAG', popularRank: null, variants: [variant('toteBag', {}, true)] }); // full-catalogue-only
  const giftWrap = product('giftWrap', { category: 'ADDON', popularRank: null, variants: [variant('giftWrap', {}, true)] });
  const all = [mug, card, tote, giftWrap];

  it('popular is rank-sorted and excludes addons + unranked', () => {
    const { popular } = splitCatalogue(all, []);
    expect(popular.map((p) => p.key)).toEqual(['mug', 'card']); // ranks 2,5; tote (null) + addon excluded
  });
  it('a basketed non-popular product becomes a pick', () => {
    const { picks } = splitCatalogue(all, [line('cat-toteBag', 1, 'toteBag')]);
    expect(picks.map((p) => p.key)).toEqual(['toteBag']);
  });
  it('a basketed POPULAR product is NOT duplicated into picks', () => {
    const { picks } = splitCatalogue(all, [line('cat-mug', 1, 'mug')]);
    expect(picks).toHaveLength(0);
  });
  it('a basketed ADDON is never a pick', () => {
    const { picks } = splitCatalogue(all, [line('cat-giftWrap', 1, 'giftWrap')]);
    expect(picks).toHaveLength(0);
  });
});

describe('sizeDimsCm — physical size sub-label (the blanket buttons)', () => {
  const bv = (size: string, orientation: string, wMm: number, hMm: number): CatalogueVariant => ({
    id: `b-${size}-${orientation}`, sku: `blanket-${size}-${orientation}`, attributes: { size, orientation },
    pricePence: 5795, isDefault: false, printWmm: wMm, printHmm: hMm,
  });
  const blanket = product('blanket', {
    category: 'BLANKET', sizes: ['medium', 'large'],
    variants: [bv('medium', 'portrait', 600, 1000), bv('medium', 'landscape', 1000, 600), bv('large', 'portrait', 1000, 1500)],
  });
  it('formats a size as min × max cm from the variant print mm', () => {
    expect(sizeDimsCm(blanket, 'medium')).toBe('60 × 100 cm');
    expect(sizeDimsCm(blanket, 'large')).toBe('100 × 150 cm');
  });
  it('is orientation-agnostic — the swapped landscape canvas reads the same nominal size', () => {
    const landscapeOnly = product('blanket', { sizes: ['medium'], variants: [bv('medium', 'landscape', 1000, 600)] });
    expect(sizeDimsCm(landscapeOnly, 'medium')).toBe('60 × 100 cm');
  });
  it('returns undefined when the size has no print mm', () => {
    const noMm = product('x', { sizes: ['one'], variants: [{ id: 'x1', sku: 'x', attributes: { size: 'one' }, pricePence: 100, isDefault: true, printWmm: null, printHmm: null }] });
    expect(sizeDimsCm(noMm, 'one')).toBeUndefined();
  });
});

describe('search', () => {
  const tee = product('kidsTee', { label: 'kids tee', blurb: 'worn with pride', category: 'APPAREL', colours: ['white', 'pink'], variants: [variant('kidsTee', {}, true)] });
  it('matches label, blurb, friendly group, and colour', () => {
    expect(matchesQuery(tee, 'tee')).toBe(true);
    expect(matchesQuery(tee, 'pride')).toBe(true);
    expect(matchesQuery(tee, 'wear')).toBe(true); // APPAREL → friendly group "wear"
    expect(matchesQuery(tee, 'pink')).toBe(true);
    expect(matchesQuery(tee, 'jigsaw')).toBe(false);
  });
  it('empty query matches everything; ADDONs are filtered out of the browse list', () => {
    const giftWrap = product('giftWrap', { category: 'ADDON', variants: [variant('giftWrap', {}, true)] });
    expect(filterCatalogue([tee, giftWrap], '')).toEqual([tee]);
    expect(filterCatalogue([tee, giftWrap], 'tee')).toEqual([tee]);
  });
});
