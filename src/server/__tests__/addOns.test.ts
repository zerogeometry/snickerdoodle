import { describe, expect, it } from 'vitest';
import { basketDrawing, COMPLEMENTS, suggestComplements } from '@/lib/complements';
import { pickAddOns } from '@/server/addOns';
import { parcelSaving, quote, type PricedCatalogue } from '@/pricing';
import type { CatalogueProduct } from '@/server/catalogue';

// CHECKOUT ADD-ONS (founder, 29 Oct): complementary products NOT in the basket, made with the shopper's
// own drawing, each with its REAL server-computed saving (the same-parcel saving, or none claimed).
const SHOW = new Set(['sack', 'mug', 'teaTowel', 'card', 'wrappingPaper', 'ceramicOrnament', 'placemat', 'coaster', 'framedPrint', 'cardPack']);

describe('the complement table', () => {
  it('a christmas family bundle → a sack, a mug and a tea towel (none of them in it; all uk9)', () => {
    expect(suggestComplements(['christmasBundle'], SHOW)).toEqual(['sack', 'mug', 'teaTowel']);
  });
  it('never suggests what’s already in the basket — or inside a bundle in it', () => {
    expect(suggestComplements(['christmasBundle', 'mug'], SHOW)).toEqual(['sack', 'teaTowel']);
    expect(suggestComplements(['christmasBundle', 'sack'], SHOW)).not.toContain('ceramicOrnament');
    expect(suggestComplements(['mug'], SHOW)).toEqual(['coaster', 'teaTowel', 'placemat']);
  });
  it('never suggests a product that isn’t on show, and at most three', () => {
    expect(suggestComplements(['christmasBundle'], new Set(['mug']))).toEqual(['mug']);
    expect(suggestComplements(['christmasBundle', 'card', 'mug'], SHOW).length).toBeLessThanOrEqual(3);
    expect(suggestComplements(['nothing'], SHOW)).toEqual([]);
  });
  it('every complement is a real product key of the table (no typos)', () => {
    const known = new Set([...Object.keys(COMPLEMENTS), 'christmasBundle']);
    for (const list of Object.values(COMPLEMENTS)) for (const k of list) expect(known.has(k), k).toBe(true);
  });
  it('the drawing is the shopper’s own: the first drawn line; a bundle’s placemats (else its first ornament)', () => {
    expect(basketDrawing([{ bundle: { placemat: { assetId: 'table' }, ornaments: [{ assetId: 'orn' }] } }, { artwork: { assetId: 'mugArt' } }])).toEqual({ assetId: 'table', sourceObjectId: null });
    expect(basketDrawing([{ bundle: { placemat: null, ornaments: [{ assetId: 'orn', sourceObjectId: 'cut' }] } }])).toEqual({ assetId: 'orn', sourceObjectId: 'cut' });
    expect(basketDrawing([{ cards: [{ assetId: 'c1' }] }])).toEqual({ assetId: 'c1', sourceObjectId: null });
    expect(basketDrawing([{}])).toBeNull();
  });
});

// the shop's own listing shape (only what's ON SHOW is in it) + the server price list
const product = (key: string, label: string, sku: string, pricePence: number): CatalogueProduct =>
  ({ key, label, blurb: null, description: null, specs: {}, category: 'FESTIVE', fromPence: pricePence, sizes: [], colours: [], orientations: [], grades: [], finishes: [], popularRank: null, variants: [{ id: `v-${sku}`, sku, attributes: {}, pricePence, isDefault: true, printWmm: null, printHmm: null }] }) as CatalogueProduct;
const ON_SHOW = [product('sack', 'christmas sack', 'sack', 3500), product('mug', 'mug', 'mug', 1800), product('card', 'greetings card', 'card', 550)];
const CAT: PricedCatalogue = {
  'christmasBundle-for4': { pricePence: 14500, label: 'christmas family bundle' },
  sack: { pricePence: 3500, label: 'christmas sack' },
  mug: { pricePence: 1800, label: 'mug' },
  card: { pricePence: 550, label: 'greetings card' },
  teaTowel: { pricePence: 2700, label: 'tea towel' }, // priceable, but NOT on show
};
const BUNDLE = [{ productKey: 'christmasBundle-for4', qty: 1, bundle: { placemat: { assetId: 'a' } } }];

describe('pickAddOns — the server’s add-ons with their REAL saving', () => {
  it('bundle → the sack + the mug, each £3 off (same uk9 parcel); the hidden tea towel is never offered', () => {
    const a = pickAddOns(ON_SHOW, BUNDLE, { catalogue: CAT });
    expect(a.map((x) => [x.productKey, x.sku, x.pricePence, x.savingPence])).toEqual([
      ['sack', 'sack', 3500, 300],
      ['mug', 'mug', 1800, 300],
    ]);
  });

  it('the saving IS the engine’s same-parcel saving (parcelSaving) for the basket with it added', () => {
    for (const x of pickAddOns(ON_SHOW, BUNDLE, { catalogue: CAT })) {
      const withIt = quote([...BUNDLE, { productKey: x.sku, qty: 1 }], { catalogue: CAT });
      expect(x.savingPence).toBe(parcelSaving(withIt.lines).savingPence - parcelSaving(quote(BUNDLE, { catalogue: CAT }).lines).savingPence);
    }
  });

  it('a natural fit from another lab carries NO saving claim', () => {
    const a = pickAddOns([product('wrappingPaper', 'wrapping paper', 'wrappingPaper', 2300)], [{ productKey: 'card', qty: 1 }], { catalogue: { ...CAT, wrappingPaper: { pricePence: 2300, label: 'wrapping paper' } } });
    expect(a).toEqual([expect.objectContaining({ productKey: 'wrappingPaper', savingPence: 0 })]);
  });

  it('adding it re-prices server-side: the order goes up by its price less the real saving', () => {
    const base = quote(BUNDLE, { catalogue: CAT });
    const [sack] = pickAddOns(ON_SHOW, BUNDLE, { catalogue: CAT });
    const after = quote([...BUNDLE, { productKey: sack!.sku, qty: 1 }], { catalogue: CAT });
    expect(after.totalPence).toBe(base.totalPence + sack!.pricePence - sack!.savingPence);
  });

  it('nothing for an empty basket; never what’s already in it', () => {
    expect(pickAddOns(ON_SHOW, [], { catalogue: CAT })).toEqual([]);
    expect(pickAddOns(ON_SHOW, [...BUNDLE, { productKey: 'sack', qty: 1 }], { catalogue: CAT }).map((x) => x.productKey)).toEqual(['mug']);
  });
});
