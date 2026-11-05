import { describe, expect, it } from 'vitest';
import {
  FRAME_GRIDS, MAX_FRAME_SLOTS, MULTI_FRAME_COLOURS, fillFrameSlots, frameGridForPx, frameGridOf, frameMarginMm, frameSlotCountOf,
  frameSlotRects, isMultiPhotoFrameKey, slotArea, slotBleedPx, slotIndexOf, slotPx,
} from '@/lib/multi-photo-frame';
import { frameGridLine } from '@/lib/multi-photo-frame-line';
import { orderItemsFor, type BasketItem } from '@/lib/store';
import { definedPriceList } from '@/server/catalogue';
import { assessPrintResolution } from '@/server/print/pattern-geometry';
import { frameSlotTiles } from '@/fulfillment/submit';
import { routeOf } from '@/lib/season';
import { multiBuyTiers, MULTI_BUY, netAt, quote, tierFor, type PricedCatalogue, type UnitEconomics } from '@/pricing';

// The multi photo frame (5 Nov 2026 — PRODUCT-RANGE-global-uk-nov.md).
const T = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 as const };
const pick = (assetId: string) => ({ assetId, transform: T });
const g12 = frameGridOf('12×12″')!;
const g16 = frameGridOf('16×16″')!;

/**
 * Prodigi's own print-file templates (prodigi.com → multi photo frames → "print file templates",
 * downloaded 5 Nov 2026: prodigi-multi-photo-frame-small-square-12x12.png, 3543×3543 px, and
 * -medium-square-16x16.png, 4724×4724 px), measured: the first and last pixel of every window's
 * black "window trim line" along a row through the first row of windows (the columns read the same).
 * The line is drawn just inside each window.
 */
const TEMPLATE_WINDOWS = {
  '12×12″': [[473, 1180], [1417, 2125], [2362, 3069]],
  '16×16″': [[591, 1298], [1535, 2243], [2480, 3188], [3425, 4132]],
} as const;

describe('the grid — Prodigi’s spec and template', () => {
  it('two sizes at Prodigi’s exact print file (sandbox GET /products, 5 Nov): 12×12″ 3×3 no mount, 16×16″ 4×4 mounted', () => {
    expect(FRAME_GRIDS.map((g) => [g.size, g.sku, g.px, g.n, g.mounted])).toEqual([
      ['12×12″', 'GLOBAL-MPF-12X12', 3543, 3, false],
      ['16×16″', 'GLOBAL-MPFM-16X16', 4724, 4, true],
    ]);
    expect(frameSlotCountOf('12×12″')).toBe(9);
    expect(frameSlotCountOf('16×16″')).toBe(16);
    expect(frameSlotCountOf('A4')).toBeNull();
    expect(MAX_FRAME_SLOTS).toBe(16);
    expect(frameGridForPx(3543)).toBe(g12);
    expect(frameGridForPx(4724)).toBe(g16);
  });

  it('60 mm squares 20 mm apart, the grid centred: a 40 mm margin on the 12×12″, 50 mm on the 16×16″', () => {
    expect(frameMarginMm(g12)).toBe(40);
    expect(frameMarginMm(g16)).toBe(50);
    expect(slotPx(g12)).toBe(709); // 60 mm at 300 dpi
    expect(slotPx(g16)).toBe(709);
  });

  for (const g of FRAME_GRIDS) {
    it(`${g.size}: every window lands within 1 px of Prodigi’s template window, in both directions`, () => {
      const rects = frameSlotRects(g);
      expect(rects).toHaveLength(g.n * g.n);
      const lines = TEMPLATE_WINDOWS[g.size];
      for (const [i, r] of rects.entries()) {
        const [cx0, cx1] = lines[i % g.n]!;
        const [cy0, cy1] = lines[Math.floor(i / g.n)]!;
        expect(Math.abs(r.x - cx0), `square ${i + 1} left`).toBeLessThanOrEqual(1);
        expect(Math.abs(r.x + r.size - 1 - cx1), `square ${i + 1} right`).toBeLessThanOrEqual(1);
        expect(Math.abs(r.y - cy0), `square ${i + 1} top`).toBeLessThanOrEqual(1);
        expect(Math.abs(r.y + r.size - 1 - cy1), `square ${i + 1} bottom`).toBeLessThanOrEqual(1);
      }
    });
  }

  it('row by row from the top-left: square 2 is right of square 1, square n+1 starts the second row', () => {
    const r = frameSlotRects(g12);
    expect(r[1]!.x).toBeGreaterThan(r[0]!.x);
    expect(r[1]!.y).toBe(r[0]!.y);
    expect(r[3]!.x).toBe(r[0]!.x);
    expect(r[3]!.y).toBeGreaterThan(r[0]!.y);
  });

  it('under the mount each drawing runs 3 mm past its window; without one it is exactly its square', () => {
    expect(slotBleedPx(g16)).toBe(35);
    expect(slotBleedPx(g12)).toBe(0);
    // the bleed never reaches the next square (20 mm apart)
    const [a, b] = frameSlotRects(g16);
    expect(a!.x + a!.size + slotBleedPx(g16)).toBeLessThan(b!.x - slotBleedPx(g16));
  });

  it('names each square’s print area slot-1…slot-N, and reads them back', () => {
    expect(slotArea(0)).toBe('slot-1');
    expect(slotIndexOf('slot-16')).toBe(15);
    expect(slotIndexOf('default')).toBeNull();
    expect(slotIndexOf('slot-0')).toBeNull();
    expect(slotIndexOf(null)).toBeNull();
  });

  it('recognises the frame key and its variant skus only', () => {
    expect(isMultiPhotoFrameKey('multiPhotoFrame')).toBe(true);
    expect(isMultiPhotoFrameKey('multiPhotoFrame-12x12-gold')).toBe(true);
    expect(isMultiPhotoFrameKey('framedPrint')).toBe(false);
    expect(isMultiPhotoFrameKey(null)).toBe(false);
  });
});

describe('filling the squares — the empty ones repeat the main drawing', () => {
  it('ONE drawing fills every square', () => {
    const s = fillFrameSlots([pick('a')], 9);
    expect(s).toHaveLength(9);
    expect(s.every((x) => x.assetId === 'a')).toBe(true);
    expect(s.map((x) => x.printArea)).toEqual(Array.from({ length: 9 }, (_, i) => `slot-${i + 1}`));
  });

  it('keeps every chosen square where it was; every empty one takes square 1’s drawing (not a cycle)', () => {
    const s = fillFrameSlots([pick('main'), null, pick('b'), null, pick('c')], 9);
    expect(s.map((x) => x.assetId)).toEqual(['main', 'main', 'b', 'main', 'c', 'main', 'main', 'main', 'main']);
  });

  it('with square 1 empty, the first chosen drawing is the main one', () => {
    expect(fillFrameSlots([null, null, pick('x')], 4).map((x) => x.assetId)).toEqual(['x', 'x', 'x', 'x']);
  });

  it('ignores anything past the frame’s size and malformed squares; refuses a frame with no drawing', () => {
    const many = Array.from({ length: 30 }, (_, i) => pick(`d${i}`));
    expect(fillFrameSlots(many, 16).map((x) => x.assetId)).toEqual(many.slice(0, 16).map((x) => x.assetId));
    expect(fillFrameSlots([{ assetId: '' } as never, pick('y')], 9).every((x) => x.assetId === 'y')).toBe(true);
    expect(() => fillFrameSlots([], 9)).toThrow(/at least one drawing/);
    expect(() => fillFrameSlots([pick('a')], 17)).toThrow(/not a frame size/);
  });
});

describe('the frame basket line', () => {
  const v = { id: 'v', sku: 'multiPhotoFrame-12x12-black', pricePence: 6200, attributes: { size: '12×12″', colour: 'black' } };

  it('carries every square (gaps already filled) and mirrors square 1 as its artwork', () => {
    const line = frameGridLine({ id: 'mpf-1', variant: v, slots: [null, pick('a'), pick('b')] });
    expect(line.slots).toHaveLength(9);
    expect(line.artwork).toEqual(line.slots![0]);
    expect(line.slots![0]!.assetId).toBe('a');
    expect(line.sub).toBe('12×12″ · black frame · 2 drawings');
  });

  it('orders as qty = copies + its squares (which drawing where — never a price)', () => {
    const line = frameGridLine({ id: 'mpf-1', variant: v, slots: [pick('a')] });
    const [sent] = orderItemsFor([{ ...line, qty: 2 } as BasketItem]);
    expect(sent).toMatchObject({ productKey: v.sku, qty: 2 });
    expect((sent as { slots: unknown[] }).slots).toHaveLength(9);
    expect(sent).not.toHaveProperty('artwork');
    expect(JSON.stringify(sent)).not.toMatch(/price/i);
  });
});

describe('frame catalogue + SERVER-SIDE price', () => {
  const rows = definedPriceList().filter((r) => r.productKey === 'multiPhotoFrame');

  it('two sizes × the eight classic-frame colours, Prodigi’s SKU + `color` attribute, exact px, hidden until the photos are in', () => {
    expect(rows).toHaveLength(16);
    for (const g of FRAME_GRIDS) {
      const mine = rows.filter((r) => r.attributes.size === g.size);
      expect(mine.map((r) => r.attributes.colour)).toEqual([...MULTI_FRAME_COLOURS]);
      for (const r of mine) {
        expect(r.prodigiSku).toBe(g.sku);
        expect(r.prodigiAttrs).toEqual({ color: r.attributes.colour });
        expect(r.px).toEqual({ w: g.px, h: g.px });
        expect(r.bleedMm).toBe(0); // the grid's margins + bleed are drawn into Prodigi's file
      }
    }
    expect(rows.every((r) => !r.visibleInShop && !r.paused)).toBe(true);
    expect(rows.find((r) => r.isDefault)!.attributes).toEqual({ size: '12×12″', colour: 'gold' });
  });

  it('priced ≈ 20% net after every cost: P ≈ (1.03 × landed + £0.75) / 0.61 → £62 and £80', () => {
    const rule = (landedPence: number) => (1.03 * landedPence + 75) / 0.61;
    const p12 = rows.find((r) => r.attributes.size === '12×12″')!.pricePence;
    const p16 = rows.find((r) => r.attributes.size === '16×16″')!.pricePence;
    expect(p12).toBe(6200);
    expect(p16).toBe(8000);
    expect(Math.abs(p12 - rule(2800 + 785))).toBeLessThan(100); // £28 + £7.85 (sandbox quote, gb3)
    expect(Math.abs(p16 - rule(3900 + 785))).toBeLessThan(100); // £39 + £7.85
    expect(rows.every((r) => r.pricePence === (r.attributes.size === '12×12″' ? 6200 : 8000))).toBe(true); // every colour the same
  });

  it('the engine prices a frame from the SERVER catalogue — copies multiply, the client sends no price', () => {
    const cat: PricedCatalogue = Object.fromEntries(definedPriceList().map((r) => [r.sku, { pricePence: r.pricePence, label: r.productKey }]));
    const s16 = rows.find((r) => r.attributes.size === '16×16″' && r.attributes.colour === 'silver')!.sku;
    expect(quote([{ productKey: 'multiPhotoFrame', qty: 1 }], { catalogue: cat }).subtotalPence).toBe(6200);
    expect(quote([{ productKey: s16, qty: 2 }], { catalogue: cat }).subtotalPence).toBe(16000);
  });

  it('multi-buy tiers come from its costs (gb3: £7.85 first, +£3.00 a frame) and keep every order ≥ 15% net', () => {
    // [price, cost, first post, plus-one post] — scripts/discount-headroom.mjs SANDBOX (5 Nov quotes)
    const econ = (price: number, cost: number): UnitEconomics => ({ pricePence: price, productCostPence: cost, postFirstPence: 785, postExtraPence: 300, parcelSavingPerExtraPence: 0 });
    for (const e of [econ(6200, 2800), econ(8000, 3900)]) {
      const tiers = multiBuyTiers(e);
      for (let q = 2; q <= MULTI_BUY.checkUpTo; q++) {
        const { netPence, revenueExVatPence } = netAt(e, q, tierFor(tiers, q));
        expect(netPence / revenueExVatPence).toBeGreaterThanOrEqual(0.15 - 1e-9);
      }
    }
  });

  it('is made at gb3 (Christmas cut-off with the framed prints)', () => {
    expect(routeOf('multiPhotoFrame')).toBe('gb3');
    expect(routeOf('framedPrint')).toBe('gb3');
  });
});

describe('the per-square DPI gate — each drawing judged on its own 6 cm square', () => {
  const geom = { printWidthPx: 4724, printHeightPx: 4724, bleedMm: 0, requiredDpi: 300 };

  it('a modest phone photo is plenty for a 6 cm square (it would be soft on the whole 40 cm sheet)', () => {
    const src = { width: 1200, height: 900 };
    expect(assessPrintResolution(geom, src, T, 'multiPhotoFrame').decision).toBe('OK');
    expect(assessPrintResolution(geom, src, T, 'framedPrint').decision).not.toBe('OK');
  });

  it('a thumbnail is still refused', () => {
    expect(assessPrintResolution(geom, { width: 40, height: 30 }, T, 'multiPhotoFrame-16x16-gold').decision).toBe('BLOCK');
  });
});

describe('frameSlotTiles — every square, once, before anything reaches the printer', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ printArea: `slot-${i + 1}`, printObjectId: `tile-${i}` }));

  it('orders the tiles by square, whatever order the rows come in', () => {
    const shuffled = rows(9).reverse();
    expect(frameSlotTiles('12×12″', shuffled)).toEqual({ grid: g12, tiles: rows(9).map((r) => r.printObjectId) });
  });

  it('is not a frame line when no row is a square', () => {
    expect(frameSlotTiles(undefined, [{ printArea: null, printObjectId: 'x' }])).toBeNull();
  });

  it('refuses a missing, doubled or out-of-range square, a mixed line, or an unknown size', () => {
    expect(() => frameSlotTiles('12×12″', rows(8))).toThrow(/missing square 9/);
    expect(() => frameSlotTiles('12×12″', [...rows(8), { printArea: 'slot-1', printObjectId: 'again' }])).toThrow(/doubled/);
    expect(() => frameSlotTiles('12×12″', [...rows(9), { printArea: 'slot-10', printObjectId: 'extra' }])).toThrow(/unexpected/);
    expect(() => frameSlotTiles('16×16″', rows(9))).toThrow(/missing squares 10, 11/);
    expect(() => frameSlotTiles('12×12″', [...rows(9), { printArea: null, printObjectId: 'x' }])).toThrow(/mixes/);
    expect(() => frameSlotTiles('A4', rows(9))).toThrow(/unknown size/);
  });
});
