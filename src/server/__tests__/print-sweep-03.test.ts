import { describe, expect, it } from 'vitest';
import { definedPrintSpecs, definedPriceList } from '@/server/catalogue';
import { canvasSizePx } from '@/server/print/geometry';
import { printFileSize, type ProdigiAreaVariant } from '@/server/print/printFile';
import { CARD_SPREAD } from '@/server/print/cardPrint';
import { BUNDLE_COMPONENT_SKUS, BUNDLE_PIECE_GEOM, BUNDLE_SIZES, TABLE_PACKS, expandBundle, normalizeBundle, pieceOfSku, type BundleSize } from '@/lib/christmas-bundle';
import fixture from './fixtures/prodigi-print-areas.json';

/**
 * TEST SWEEP 03 (29 Oct 2026) — print output vs Prodigi's templates, the parts a unit test can hold.
 * print-spec.test.ts compares each variant's FIRST print area; this checks EVERY area a variant fills,
 * the bundle pieces' geometry, the bundle's order lines, and pins the card's preview/print shape gap.
 * The fixture is Prodigi's own data (sandbox GET /v4.0/products/{sku}, GB routes) — re-fetched on
 * 29 Oct by the sweep: identical px for all 216 SKUs.
 */
type Fixture = { products: Record<string, { printAreas: string[]; variants: ProdigiAreaVariant[] } | null> };
const prodigi = (fixture as Fixture).products;
const specs = definedPrintSpecs();

/** Prodigi's size(s) for one print area of a variant, matched on the attributes we send. */
function areaSizes(s: (typeof specs)[number], area: string): string[] {
  const want = Object.entries(s.prodigiAttrs ?? {}).map(([k, v]) => [k.toLowerCase(), String(v).toLowerCase()] as const);
  const out = new Set<string>();
  for (const v of prodigi[s.prodigiSku]?.variants ?? []) {
    const a = Object.fromEntries(Object.entries(v.attributes).map(([k, x]) => [k.toLowerCase(), String(x).toLowerCase()]));
    if (want.every(([k, x]) => !(k in a) || a[k] === x) && v.printAreaSizes[area]) out.add(`${v.printAreaSizes[area]!.w}×${v.printAreaSizes[area]!.h}`);
  }
  return [...out];
}

// print-spec.test.ts KNOWN (hidden from the shop until fixed)
const KNOWN_PRODUCTS = new Set(['adultHoodie', 'babyBodysuit']);

describe('sweep 03 — every print area a variant fills is Prodigi’s exact size', () => {
  it('each area in printTo exists at Prodigi with one size — the file’s, or (the jigsaw tin lid only) a known, documented crop', () => {
    const issues = new Set<string>();
    for (const s of specs.filter((x) => !KNOWN_PRODUCTS.has(x.productKey))) {
      const f = printFileSize(s.productKey, s.attributes, s.template);
      for (const area of s.printTo) {
        const sizes = areaSizes(s, area);
        if (sizes.length !== 1) issues.add(`${s.productKey} ${s.prodigiSku} "${area}": Prodigi ${sizes.join(' / ') || 'none'}`);
        else if (sizes[0] !== `${f.w}×${f.h}`) issues.add(`${s.productKey} ${s.prodigiSku} "${area}": file ${f.w}×${f.h} vs Prodigi ${sizes[0]}`);
      }
    }
    // The jigsaw's tin LID gets the board's file (catalogue.ts: "Prodigi trims a sliver off the lid's
    // sides"): 2952×2362 (1.250) onto 869×674 (1.289) — 3% of the lid's height is cropped by fillPrintArea.
    expect([...issues].sort()).toEqual([
      'jigsaw JIGSAW-PUZZLE-110 "lid": file 2952×2362 vs Prodigi 869×674',
      'jigsaw JIGSAW-PUZZLE-252 "lid": file 4429×3366 vs Prodigi 869×674',
      'jigsaw JIGSAW-PUZZLE-30 "lid": file 2952×2362 vs Prodigi 869×674',
    ]);
  });

  it('the products that need more than one area fill the right ones (sandbox `required` flags, 29 Oct)', () => {
    const areasOf = (key: string) => [...new Set(specs.filter((s) => s.productKey === key).map((s) => s.printTo.join('+')))];
    expect(areasOf('jigsaw')).toEqual(['jigsaw+lid']); // both required
    expect(areasOf('calendar')).toEqual(['cover+january+february+march+april+may+june+july+august+september+october+november+december']); // 'back cover' is optional
    for (const g of ['kidsTee', 'adultTee', 'kidsHoodie', 'adultHoodie', 'kidsJumper', 'christmasJumper', 'babyBodysuit']) expect(areasOf(g), g).toEqual(['front']); // 'back' optional
    expect(areasOf('socks')).toEqual(['front', 'default']); // ankle → front, tube → default
  });
});

describe('sweep 03 — the christmas bundle’s pieces', () => {
  const tplOf = (sku: string) => specs.find((s) => s.sku === sku)!;

  it('BUNDLE_PIECE_GEOM is each component pack’s seeded template, and Prodigi’s print area', () => {
    for (const sku of BUNDLE_COMPONENT_SKUS) {
      const s = tplOf(sku);
      const g = BUNDLE_PIECE_GEOM[pieceOfSku(sku)!];
      expect({ printWidthPx: s.template.printWidthPx, printHeightPx: s.template.printHeightPx, bleedMm: s.template.bleedMm, requiredDpi: s.template.requiredDpi }, sku).toEqual(g);
      expect(areaSizes(s, 'default'), sku).toEqual([`${g.printWidthPx}×${g.printHeightPx}`]);
      const c = canvasSizePx(s.template);
      expect([c.width, c.height], `${sku}: no bleed added on top of Prodigi's area`).toEqual([g.printWidthPx, g.printHeightPx]);
    }
  });

  it('every component sku is a real catalogue variant with the Prodigi SKU the bundle says', () => {
    const list = new Map(definedPriceList().map((v) => [v.sku, v]));
    for (const n of [2, 4, 8] as BundleSize[]) {
      const t = TABLE_PACKS[n];
      for (const p of [t.placemat.pack, t.coaster.pack]) expect(list.get(p.sku)?.prodigiSku, p.sku).toBe(p.prodigiSku);
    }
    expect(list.get('ceramicOrnament')?.prodigiSku).toBe('XMAS-PORC-BAUB');
  });

  it('a set for N expands to N placemats, N coasters and N ornaments, and the lines add up to the price to the penny', () => {
    const designs = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((x) => ({ assetId: `asset-${x}` }));
    for (const size of BUNDLE_SIZES) {
      const n = size.n;
      const combos = [
        { placemat: designs[0] }, // everything wears the placemats' drawing
        { placemat: designs[0], coaster: designs[1] },
        { placemat: designs[0], coaster: designs[1], ornaments: designs.slice(0, n) }, // every ornament its own
        { placemat: designs[2], ornaments: [designs[3], designs[3]] }, // two the same, the rest the placemats'
      ];
      for (const raw of combos) {
        for (const price of [size.pricePence, size.pricePence + 1, size.pricePence - 7, 9999, 1]) {
          const b = normalizeBundle(raw, n)!;
          const lines = expandBundle(price, b, n);
          expect(lines.reduce((s, l) => s + l.linePence, 0), `${size.sku} £${price / 100}`).toBe(price);
          for (const l of lines) expect(l.linePence).toBe(l.unitPricePence * l.qty);
          const pieces = (piece: string) => lines.filter((l) => l.piece === piece).reduce((s, l) => s + l.qty * (piece === 'ceramicOrnament' ? 1 : TABLE_PACKS[n][piece as 'placemat' | 'coaster'].pack.pieces), 0);
          expect([pieces('placemat'), pieces('coaster'), pieces('ceramicOrnament')], size.sku).toEqual([n, n, n]);
          expect(lines.find((l) => l.piece === 'coaster')!.art).toEqual(raw.coaster ?? raw.placemat);
        }
      }
    }
  });
});

describe('sweep 03 — the greetings card: what the positioner frames vs the panel that prints', () => {
  // 03-B2 (fixed): the positioner and the card mockup placed the design on a 127×178 mm + 3 mm bleed canvas
  // (1570×2172) while the print placed it on the spread's outer-front PANEL (1530×2160) — a ~2% shape
  // difference. The card's template is now that panel exactly, so all three frame the same shape.
  const card = specs.find((s) => s.productKey === 'card')!;
  const packs = specs.filter((s) => s.productKey === 'cardPack');
  it('03-B2: the card (and every pack card) frames exactly the panel that prints', () => {
    const panel = { w: CARD_SPREAD.widthPx / 4, h: CARD_SPREAD.heightPx };
    expect(panel).toEqual({ w: 1530, h: 2160 });
    for (const s of [card, ...packs]) {
      const c = canvasSizePx(s.template);
      expect([c.width, c.height], s.sku).toEqual([panel.w, panel.h]);
    }
  });
});
