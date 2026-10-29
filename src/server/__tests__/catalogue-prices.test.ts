import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '@/pricing';
import { definedPriceList, PATTERN_PRODUCT_KEYS } from '../catalogue';
import { packSizeOf } from '@/lib/card-packs';
import {
  BUNDLE_COMPONENT_SKUS, BUNDLE_KEY, BUNDLE_ONLY_SKUS, BUNDLE_PIECE_GEOM, BUNDLE_SIZES, COASTER_2PK, COASTER_4PK, ORNAMENT, PLACEMAT_2PK, PLACEMAT_4PK, pieceOfSku,
} from '@/lib/christmas-bundle';

// The founder-agreed shop prices (2026-10-21: "adjust all prices to the nearest £0.50", plus the
// heart cushion +£2, 30-piece jigsaw +£1 and greetings card +50p). Server-authoritative: this is
// what the seed writes and the pricing engine charges — the client never supplies a price.
const list = definedPriceList();
const price = (sku: string) => {
  const row = list.find((r) => r.sku === sku);
  if (!row) throw new Error(`no variant ${sku}`);
  return row.pricePence;
};
const prices = (productKey: string) => [...new Set(list.filter((r) => r.productKey === productKey).map((r) => r.pricePence))].sort((a, b) => a - b);

describe('shop prices — on the nearest £0.50, never .95/.99', () => {
  it('every variant price is a multiple of 50p', () => {
    const off = list.filter((r) => r.pricePence % 50 !== 0).map((r) => `${r.sku}=${r.pricePence}`);
    expect(off).toEqual([]);
  });

  it('the agreed price per product', () => {
    expect(prices('framedPrint')).toEqual([6500, 7000, 9000, 10500]);
    expect(prices('mug')).toEqual([1800]);
    expect(prices('cushion')).toEqual([2200, 3000, 3500, 4000, 4500]);
    expect(price('cushion')).toBe(2200); // heart (+£2)
    expect(price('cushion-18round')).toBe(3000);
    expect(price('cushion-12square')).toBe(3000);
    expect(price('cushion-12square-double')).toBe(3500);
    expect(price('cushion-22square')).toBe(4000);
    expect(price('cushion-22square-double')).toBe(4500);
    expect(prices('kidsTee')).toEqual([2500, 2700]);
    expect(price('kidsTee')).toBe(2500); // white
    expect(price('kidsTee-34years-black')).toBe(2700); // a colour
    expect(prices('adultTee')).toEqual([3200]);
    expect(price('jigsaw')).toBe(2600); // 30 pieces (+£1)
    expect(prices('jigsaw')).toEqual([2600, 3000, 3500]);
    expect(prices('blanket')).toEqual([6000, 7500]);
    expect(price('card')).toBe(550); // +50p
    expect(prices('storybook')).toEqual([2600, 2900]);
    expect(prices('babyBodysuit')).toEqual([2200]);
    expect(prices('calendar')).toEqual([2200, 2400]); // A5 / A4, dated 2027 (founder, 2026-10-25)
    expect(prices('apron')).toEqual([2500, 2900]);
    expect(prices('christmasBauble')).toEqual([1900]); // the plastic ball £19 (D24)
    expect(prices('ceramicOrnament')).toEqual([2100]); // the ceramic ornament £21
    expect(prices('sack')).toEqual([3500]);
    expect(prices('phoneCase')).toEqual([2500, 3000]); // snap / tough
  });

  it('the static fallback CATALOGUE matches each product’s seeded DEFAULT variant', () => {
    for (const [key, entry] of Object.entries(CATALOGUE)) {
      const def = list.find((r) => r.productKey === key && r.isDefault);
      expect(def, key).toBeDefined();
      expect(entry.pricePence, key).toBe(def!.pricePence);
    }
  });
});

// The range expansion (D21, 2026-10-21): every SKU, attribute, lab and print size checked against
// the Prodigi SANDBOX (GET /products + POST /quotes to GB) the same day.
describe('range expansion — new products', () => {
  const NEW = ['socks', 'heightChart', 'kidsHoodie', 'adultHoodie', 'wrappingPaper', 'teaTowel', 'petBandana', 'playingCards'];
  const rows = (k: string) => list.filter((r) => r.productKey === k);
  const bySize = (k: string) => Object.fromEntries(rows(k).map((r) => [r.sku, r]));

  it('every new product is defined; the ready ones are ON SHOW, the rest held back (founder, 2026-10-21)', () => {
    const LIVE = ['socks', 'heightChart', 'wrappingPaper', 'teaTowel', 'playingCards'];
    for (const k of NEW) {
      expect(rows(k).length, k).toBeGreaterThan(0);
      expect(rows(k).every((r) => r.visibleInShop === LIVE.includes(k) && !r.paused), k).toBe(true);
    }
  });

  it('the women’s sweatshirt is left out (founder, 2026-10-21)', () => {
    expect(list.some((r) => r.prodigiSku === 'SWEAT-SS-STSW125')).toBe(false);
  });

  it('the acrylic block is gone — no honest preview of a clear block (founder, 2026-10-22)', () => {
    expect(rows('acrylicBlock')).toHaveLength(0);
    expect(list.some((r) => r.prodigiSku?.startsWith('GLOBAL-MOU-PRISM'))).toBe(false);
  });

  it('the agreed prices (whole pounds, free delivery baked in)', () => {
    expect(prices('socks')).toEqual([2000]);
    expect(prices('kidsHoodie')).toEqual([4300]);
    expect(prices('adultHoodie')).toEqual([4200]);
    expect(prices('teaTowel')).toEqual([2700]);
    expect(prices('playingCards')).toEqual([2400]);
    const skuPrice = (k: string) => Object.fromEntries(rows(k).map((r) => [r.prodigiSku, r.pricePence]));
    expect(skuPrice('heightChart')).toEqual({
      'POSTER-HANGER-20-CAN-ROL-SC-8X48': 3100, 'POSTER-HANGER-30-CAN-ROL-SC-12X48': 3400,
      'POSTER-HANGER-20-CAN-ROL-SC-8X60': 3400, 'POSTER-HANGER-30-CAN-ROL-SC-12X60': 3600,
    });
    // rolls only (founder, 22 Oct) — no sheet packs
    // white + brown kraft (D24) — the same price per length
    expect(skuPrice('wrappingPaper')).toEqual({ 'WRAP-ROL-70X200': 2300, 'WRAP-ROL-70X300': 2800, 'WRAP-ROL-70X500': 3800, 'WRAP-KFT-ROL-70X200': 2300, 'WRAP-KFT-ROL-70X300': 2800, 'WRAP-KFT-ROL-70X500': 3800 });
    expect(skuPrice('petBandana')).toEqual({ 'PET-BANDANA-SML': 1800, 'PET-BANDANA-MED': 1800, 'PET-BANDANA-LRG': 1900 });
  });

  it('print files are Prodigi’s EXACT printAreaSizes (sandbox, GB route)', () => {
    const px = (k: string) => Object.fromEntries(rows(k).map((r) => [r.prodigiSku, r.px && `${r.px.w}x${r.px.h}`]));
    expect(px('socks')).toEqual({ 'GLOBAL-ANKLE-SOCKS': '3543x3543', 'GLOBAL-TUBE-SOCKS': '6141x5433' });
    expect(px('heightChart')).toMatchObject({ 'POSTER-HANGER-20-CAN-ROL-SC-8X48': '1200x7200', 'POSTER-HANGER-30-CAN-ROL-SC-12X60': '1800x9000' });
    expect(px('wrappingPaper')).toEqual({ 'WRAP-ROL-70X200': '4133x11811', 'WRAP-ROL-70X300': '4133x17716', 'WRAP-ROL-70X500': '4133x29527', 'WRAP-KFT-ROL-70X200': '8280x23610', 'WRAP-KFT-ROL-70X300': '8280x35430', 'WRAP-KFT-ROL-70X500': '8280x59070' });
    expect(px('teaTowel')).toEqual({ 'H-TEATOWEL-SUB': '8208x5492' }); // designed landscape; the file turns back to 5492×8208
    expect(px('petBandana')).toEqual({ 'PET-BANDANA-SML': '7500x2244', 'PET-BANDANA-MED': '9447x2952', 'PET-BANDANA-LRG': '10158x3306' });
    expect(px('playingCards')).toEqual({ 'PLAY-CARD': '820x1122' });
  });

  it('only UK-made tea towels — never the US-made cotton/poly twill SKUs', () => {
    expect(rows('teaTowel').map((r) => r.prodigiSku)).toEqual(['H-TEATOWEL-SUB']);
    expect(list.some((r) => /^H-TEATOWEL-(COTTON|POLY)/.test(r.prodigiSku ?? ''))).toBe(false);
  });

  it('the adult hoodie comes only in the colours made in the UK (uk9) — Poland-made colours are out', () => {
    const colours = new Set(rows('adultHoodie').map((r) => r.prodigiAttrs?.color));
    expect([...colours].sort()).toEqual(['black', 'burgundy', 'dark heather grey', 'french navy', 'heather grey', 'white']);
    for (const pl of ['khaki', 'anthracite', 'red', 'royal blue', 'bottle green', 'bright orange']) expect(colours.has(pl)).toBe(false);
    expect(new Set(rows('adultHoodie').map((r) => r.prodigiAttrs?.size))).toEqual(new Set(['xs', 's', 'm', 'l', 'xl', '2xl', '3xl']));
    expect(bySize('adultHoodie').adultHoodie!.prodigiAttrs).toEqual({ size: 'm', color: 'white' }); // the default
  });

  it('the kids hoodie: 5 sizes × 5 colours on ONE SKU, with Prodigi’s exact attribute values', () => {
    expect(rows('kidsHoodie')).toHaveLength(25);
    expect(new Set(rows('kidsHoodie').map((r) => r.prodigiSku))).toEqual(new Set(['HOOD-SS-STSK911']));
    expect(new Set(rows('kidsHoodie').map((r) => r.prodigiAttrs?.color))).toEqual(new Set(['black', 'burgundy', 'cotton pink', 'french navy', 'heather grey']));
  });

  it('height-chart hanger colour is sent to Prodigi as its `color` attribute', () => {
    expect(new Set(rows('heightChart').map((r) => r.prodigiAttrs?.color))).toEqual(new Set(['natural', 'black', 'white']));
    expect(rows('heightChart')).toHaveLength(12);
  });

  it('socks, wrapping paper and tea towel are the repeat-pattern products', () => {
    expect([...PATTERN_PRODUCT_KEYS].sort()).toEqual(['socks', 'teaTowel', 'wrappingPaper']);
  });

  it('every variant sku in the whole catalogue is unique (the seed refuses duplicates)', () => {
    const skus = list.map((r) => r.sku);
    expect(skus.length).toBe(new Set(skus).size);
  });
});

describe('greetings-card multipacks', () => {
  const packs = list.filter((r) => r.productKey === 'cardPack');

  it('pack of 5 £12 (the default) and pack of 10 £21 — on show', () => {
    expect(packs.map((r) => [r.sku, r.pricePence, r.isDefault])).toEqual([['cardPack', 1200, true], ['cardPack-packof10', 2100, false]]);
    expect(packs.every((r) => r.visibleInShop && !r.paused)).toBe(true);
  });

  it('every pack price splits evenly between its cards (the order lines must add up to the penny)', () => {
    for (const r of packs) {
      const n = packSizeOf(r.sku === 'cardPack' ? 'pack of 5' : 'pack of 10')!;
      expect(r.pricePence % n, r.sku).toBe(0);
    }
  });

  it('is the same blank-inside 7×5″ card as the single, at the same print size', () => {
    const single = list.find((r) => r.sku === 'card')!;
    for (const r of packs) {
      expect(r.prodigiSku).toBe('CLASSIC-GRE-FEDR-7X5-BLA');
      expect(r.px).toEqual(single.px);
    }
  });
});

// The CHRISTMAS FAMILY BUNDLE (founder, 29 Oct — three sizes, no add-ons). Prices + Prodigi SKUs + print
// areas (sandbox GET /v4.0/products, 27 Oct) pinned against src/lib/christmas-bundle.ts, so the builder's
// DPI check, the order's split and the seeded templates can never disagree.
describe('christmas family bundle — catalogue entries', () => {
  const row = (sku: string) => {
    const r = list.find((x) => x.sku === sku);
    if (!r) throw new Error(`no variant ${sku}`);
    return r;
  };

  it('the three sizes are seeded at £78 / £145 / £279, not printed themselves, on show — and nothing else', () => {
    const rows = list.filter((r) => r.productKey === BUNDLE_KEY);
    expect(rows.map((r) => [r.sku, r.pricePence, r.isDefault, r.attributes.size])).toEqual([
      ['christmasBundle', 7800, true, 'for 2'],
      ['christmasBundle-for4', 14500, false, 'for 4'],
      ['christmasBundle-for8', 27900, false, 'for 8'],
    ]);
    expect(rows.map((r) => r.sku)).toEqual(BUNDLE_SIZES.map((s) => s.sku));
    for (const r of rows) expect(r).toMatchObject({ prodigiSku: null, visibleInShop: true, paused: false });
    expect(CATALOGUE.christmasBundle.pricePence).toBe(7800);
  });

  it('placemats (4-pack £60) and coasters (2 / 4 / 6-packs £18 / £26 / £34) are seeded as standalone products', () => {
    expect(row('placemat')).toMatchObject({ isDefault: true, pricePence: 6000, prodigiSku: 'H-PLACE-4PK' });
    // coasters start at TWO (founder, 29 Oct); the 6-pack keeps the product key; the single isn't sold
    const coasters = list.filter((r) => r.productKey === 'coaster' && !BUNDLE_ONLY_SKUS.has(r.sku)).map((r) => [r.sku, r.prodigiSku, r.pricePence, r.isDefault]);
    expect(coasters).toEqual([
      ['coaster-packof2', 'H-COAST-2PK', 1800, false],
      ['coaster-packof4', 'H-COAST-4PK', 2600, false],
      ['coaster', 'H-COAST-6PK', 3400, true],
    ]);
    expect(BUNDLE_ONLY_SKUS.has('coaster-packof1')).toBe(true);
  });

  it('every coaster pack still clears 10% net with a 10% creator code + 5% commission (the margin-guard floor)', () => {
    // Prodigi product cost ex-VAT, before post (scripts/discount-headroom.mjs); uk9 post £4.30
    const COST: Record<string, number> = { 'coaster-packof2': 550, 'coaster-packof4': 1000, coaster: 1500 };
    for (const [sku, product] of Object.entries(COST)) {
      const price = row(sku).pricePence;
      const paid = price * 0.9; // the 10% code
      const revenue = paid / 1.2;
      const fulfil = product + 430;
      const net = revenue - fulfil - (0.015 * paid + 20) - 0.03 * fulfil - 0.05 * revenue /* commission */ - 55;
      expect(net / revenue, sku).toBeGreaterThanOrEqual(0.1);
    }
  });

  it('every item the bundle expands into is seeded with its own Prodigi SKU', () => {
    for (const p of [PLACEMAT_2PK, PLACEMAT_4PK, COASTER_2PK, COASTER_4PK, ORNAMENT]) expect(row(p.sku).prodigiSku, p.sku).toBe(p.prodigiSku);
  });

  it('each piece’s seeded print template is the geometry the builder + the order gate use', () => {
    for (const sku of BUNDLE_COMPONENT_SKUS) {
      const r = row(sku);
      const g = BUNDLE_PIECE_GEOM[pieceOfSku(sku)!];
      expect({ w: r.px!.w, h: r.px!.h, dpi: r.dpi, bleed: r.bleedMm }, sku).toEqual({ w: g.printWidthPx, h: g.printHeightPx, dpi: g.requiredDpi, bleed: g.bleedMm });
    }
    // Prodigi's exact areas: placemat 3425×2421, coaster 1251×1251, ornament 885×885 (no bleed)
    expect(row('placemat').px).toEqual({ w: 3425, h: 2421 });
    expect(row('coaster').px).toEqual({ w: 1251, h: 1251 });
    expect(row('ceramicOrnament')).toMatchObject({ px: { w: 885, h: 885 }, bleedMm: 0 });
  });

  it('the bundle-only packs are never priceable on their own (the static list doesn’t carry them)', () => {
    for (const sku of BUNDLE_ONLY_SKUS) expect(Object.prototype.hasOwnProperty.call(CATALOGUE, sku), sku).toBe(false);
  });
});

// The CHRISTMAS EVE BUNDLE — retired (founder, 29 Oct: "drop it for simplicity").
describe('christmas eve bundle — retired', () => {
  it('is PAUSED and off the shop: the seed deactivates it, so it can never be priced or ordered', () => {
    expect(list.find((x) => x.sku === 'christmasEveBundle')).toMatchObject({ paused: true, visibleInShop: false });
    expect(Object.prototype.hasOwnProperty.call(CATALOGUE, 'christmasEveBundle')).toBe(false);
  });
});
