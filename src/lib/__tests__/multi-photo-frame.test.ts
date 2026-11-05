import { describe, expect, it } from 'vitest';
import {
  FRAME_GRIDS, MAX_FRAME_SLOTS, MULTI_FRAME_COLOURS, fillFrameSlots, frameGridForPx, frameGridOf, frameMarginsMm, frameSlotCountOf,
  frameSlotRects, isMultiPhotoFrameKey, prodigiPx, slotArea, slotBleedPx, slotIndexOf, slotPx,
} from '@/lib/multi-photo-frame';
import { frameGridLine } from '@/lib/multi-photo-frame-line';
import { orderItemsFor, type BasketItem } from '@/lib/store';
import { definedPriceList } from '@/server/catalogue';
import { assessPrintResolution } from '@/server/print/pattern-geometry';
import { printFileSize } from '@/server/print/printFile';
import { templateGeom } from '@/server/print/geometry';
import { frameSlotTiles } from '@/fulfillment/submit';
import { routeOf } from '@/lib/season';
import { multiBuyTiers, MULTI_BUY, netAt, quote, tierFor, type PricedCatalogue, type UnitEconomics } from '@/pricing';

// The multi photo frame (5 Nov 2026 — PRODUCT-RANGE-global-uk-nov.md).
const T = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 as const };
const pick = (assetId: string) => ({ assetId, transform: T });
const g12 = frameGridOf('12×12″')!;
const g1624 = frameGridOf('16×24″')!;
const g2436 = frameGridOf('24×36″')!;

/**
 * Prodigi's own print-file templates (prodigi.com → multi photo frames → "print file templates",
 * downloaded 5 Nov 2026 — prodigi-multi-photo-frame-small-square-12x12.png 3543×3543, -medium-16x24.png
 * 7086×4724, -x-large-24x36.png 10630×7087; the rectangles are drawn LANDSCAPE), measured: the outer pixels of every window's black "window trim line", across (x)
 * and down (y). The line is 3–6 px thick and sits on or just inside the window's edge.
 */
const TEMPLATE_WINDOWS: Record<string, { x: number[][]; y: number[][] }> = {
  '12×12″': { x: [[473, 1180], [1417, 2125], [2362, 3069]], y: [[473, 1180], [1417, 2125], [2362, 3069]] },
  '16×24″': {
    x: [[825, 1536], [1770, 2481], [2714, 3426], [3659, 4371], [4604, 5315], [5549, 6260]],
    y: [[589, 1300], [1533, 2245], [2478, 3190], [3423, 4134]],
  },
  '24×36″': {
    x: [[709, 1416], [1654, 2361], [2599, 3306], [3544, 4251], [4488, 5196], [5433, 6141], [6378, 7085], [7323, 8030], [8268, 8975], [9213, 9920]],
    y: [[827, 1534], [1772, 2479], [2717, 3424], [3662, 4369], [4607, 5314], [5552, 6259]],
  },
};

describe('the grid — Prodigi’s spec and template', () => {
  it('the founder’s three — 3 × 3, 6 × 4 and 10 × 6 drawings — at Prodigi’s exact print file (sandbox GET /products, 5 Nov)', () => {
    expect(FRAME_GRIDS.map((g) => [g.name, g.size, g.orientation, g.sku, g.cols, g.rows, g.mounted, prodigiPx(g)])).toEqual([
      ['3x3', '12×12″', 'square', 'GLOBAL-MPF-12X12', 3, 3, false, { w: 3543, h: 3543 }],
      ['6x4', '16×24″', 'landscape', 'GLOBAL-MPF-16X24', 6, 4, false, { w: 4724, h: 7086 }],
      ['10x6', '24×36″', 'landscape', 'GLOBAL-MPF-24X36', 10, 6, false, { w: 7086, h: 10629 }],
    ]);
    expect([frameSlotCountOf('12×12″'), frameSlotCountOf('16×24″', 'landscape'), frameSlotCountOf('24×36″')]).toEqual([9, 24, 60]);
    expect(frameSlotCountOf('A4')).toBeNull();
    expect(frameSlotCountOf('16×16″')).toBeNull(); // retired (founder, 5 Nov)
    expect(MAX_FRAME_SLOTS).toBe(60);
    // a landscape frame is DESIGNED landscape (Prodigi's template, the founder's photo) and turned to their portrait file
    expect([g1624.pxW, g1624.pxH, g1624.turned]).toEqual([7086, 4724, true]);
    expect([g2436.pxW, g2436.pxH, g2436.turned]).toEqual([10629, 7086, true]);
    expect(frameGridOf('16×24″', 'portrait')).toBeNull(); // not offered: no photo of it
    expect(frameGridForPx(3543, 3543)).toBe(g12);
    expect(frameGridForPx(10629, 7086)).toBe(g2436);
  });

  it('60 mm squares 20 mm apart, the grid centred on the sheet', () => {
    expect([g12, g1624, g2436].map(frameMarginsMm)).toEqual([{ x: 40, y: 40 }, { x: 70, y: 50 }, { x: 60, y: 70 }]);
    expect(FRAME_GRIDS.every((g) => slotPx(g) === 709)).toBe(true); // 60 mm at 300 dpi
  });

  for (const g of FRAME_GRIDS.filter((x) => x.orientation !== 'portrait')) {
    it(`${g.size}: every window is centred within 1 px of Prodigi’s template window, its edges on the trim line (±2 px)`, () => {
      const rects = frameSlotRects(g);
      expect(rects).toHaveLength(g.cols * g.rows);
      const t = TEMPLATE_WINDOWS[g.size]!;
      expect([t.x.length, t.y.length]).toEqual([g.cols, g.rows]);
      for (const [i, r] of rects.entries()) {
        const [x0, x1] = t.x[i % g.cols]!;
        const [y0, y1] = t.y[Math.floor(i / g.cols)]!;
        expect(Math.abs(r.x + (r.size - 1) / 2 - (x0! + x1!) / 2), `square ${i + 1} centre across`).toBeLessThanOrEqual(1);
        expect(Math.abs(r.y + (r.size - 1) / 2 - (y0! + y1!) / 2), `square ${i + 1} centre down`).toBeLessThanOrEqual(1);
        for (const [ours, line] of [[r.x, x0], [r.x + r.size - 1, x1], [r.y, y0], [r.y + r.size - 1, y1]] as const) {
          expect(Math.abs(ours - line!), `square ${i + 1} edge`).toBeLessThanOrEqual(2);
        }
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

  it('no mount on any of them: each drawing is exactly its 60 mm square (a mount would add 3 mm of bleed)', () => {
    expect(FRAME_GRIDS.map(slotBleedPx)).toEqual([0, 0, 0]);
    expect(slotBleedPx({ ...g12, mounted: true })).toBe(35);
  });

  it('names each square’s print area slot-1…slot-N, and reads them back', () => {
    expect(slotArea(0)).toBe('slot-1');
    expect(slotIndexOf('slot-60')).toBe(59);
    expect(slotIndexOf('default')).toBeNull();
    expect(slotIndexOf('slot-0')).toBeNull();
    expect(slotIndexOf(null)).toBeNull();
  });

  it('recognises the frame key and its variant skus only', () => {
    expect(isMultiPhotoFrameKey('multiPhotoFrame')).toBe(true);
    expect(isMultiPhotoFrameKey('multiPhotoFrame-1212-gold')).toBe(true);
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
    expect(fillFrameSlots(many, 24).map((x) => x.assetId)).toEqual(many.slice(0, 24).map((x) => x.assetId));
    expect(fillFrameSlots([{ assetId: '' } as never, pick('y')], 9).every((x) => x.assetId === 'y')).toBe(true);
    expect(() => fillFrameSlots([], 9)).toThrow(/at least one drawing/);
    expect(() => fillFrameSlots([pick('a')], 61)).toThrow(/not a frame size/);
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

  it('a rectangle carries its own count of squares', () => {
    const big = frameGridLine({ id: 'mpf-2', variant: { id: 'v2', sku: 'multiPhotoFrame-2436-gold-landscape', pricePence: 12500, attributes: { size: '24×36″', colour: 'gold', orientation: 'landscape' } }, slots: [pick('a'), pick('b')] });
    expect(big.slots).toHaveLength(60);
    expect(big.sub).toBe('24×36″ · landscape · gold frame · 2 drawings');
    const six = frameGridLine({ id: 'mpf-3', variant: { id: 'v3', sku: 'multiPhotoFrame', pricePence: 8700, attributes: { size: '16×24″', colour: 'gold', orientation: 'landscape' } }, slots: [pick('a')] });
    expect(six.slots).toHaveLength(24);
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
  const PRICE: Record<string, number> = { '12×12″': 6200, '16×24″': 8700, '24×36″': 12500 };

  it('the three frames × the eight frame colours: Prodigi’s SKU + `color`, exact px, on show, the 6 × 4 in gold its picture', () => {
    expect(rows).toHaveLength(FRAME_GRIDS.length * 8); // 3 × 8 = 24
    for (const g of FRAME_GRIDS) {
      const mine = rows.filter((r) => r.attributes.size === g.size && (r.attributes.orientation ?? 'square') === g.orientation);
      expect(mine.map((r) => r.attributes.colour), `${g.size} ${g.orientation}`).toEqual([...MULTI_FRAME_COLOURS]);
      for (const r of mine) {
        expect(r.prodigiSku).toBe(g.sku);
        expect(r.prodigiAttrs).toEqual({ color: r.attributes.colour });
        expect(r.px).toEqual({ w: g.pxW, h: g.pxH }); // designed as it hangs…
        expect(r.bleedMm).toBe(0); // the grid's margins + bleed are drawn into Prodigi's file
        // …and the file Prodigi gets is its own printAreaSizes (a landscape frame turned back to portrait)
        expect(printFileSize('multiPhotoFrame', r.attributes, templateGeom({ printWidthPx: r.px!.w, printHeightPx: r.px!.h, bleedMm: 0, requiredDpi: 300 }))).toEqual(prodigiPx(g));
      }
    }
    expect(rows.every((r) => r.visibleInShop && !r.paused)).toBe(true); // the founder's photos are in (5 Nov)
    const def = rows.find((r) => r.isDefault)!;
    expect([def.sku, def.attributes]).toEqual(['multiPhotoFrame', { size: '16×24″', colour: 'gold', orientation: 'landscape' }]);
  });

  it('priced ≈ 20% net after every cost: P ≈ (1.03 × landed + £0.75) / 0.61, to the pound → £62 · £87 · £125', () => {
    const rule = (landedPence: number) => (1.03 * landedPence + 75) / 0.61;
    // Prodigi sandbox quotes to GB, standard prices, gb3 (5 Nov): product + first post
    const LANDED: Record<string, number> = { '12×12″': 2800 + 785, '16×24″': 4000 + 1075, '24×36″': 5900 + 1405 };
    for (const [size, landed] of Object.entries(LANDED)) {
      expect(Math.abs(PRICE[size]! - rule(landed)), size).toBeLessThanOrEqual(50); // the nearest pound
    }
    for (const r of rows) expect(r.pricePence, `${r.sku}`).toBe(PRICE[r.attributes.size!]); // every colour + way up the same
  });

  it('the engine prices a frame from the SERVER catalogue — copies multiply, the client sends no price', () => {
    const cat: PricedCatalogue = Object.fromEntries(definedPriceList().map((r) => [r.sku, { pricePence: r.pricePence, label: r.productKey }]));
    const s9 = rows.find((r) => r.attributes.size === '12×12″' && r.attributes.colour === 'silver')!.sku;
    const s60 = rows.find((r) => r.attributes.size === '24×36″' && r.attributes.colour === 'black')!.sku;
    expect(quote([{ productKey: 'multiPhotoFrame', qty: 1 }], { catalogue: cat }).subtotalPence).toBe(8700);
    expect(quote([{ productKey: s9, qty: 2 }], { catalogue: cat }).subtotalPence).toBe(12400);
    expect(quote([{ productKey: s60, qty: 1 }], { catalogue: cat }).subtotalPence).toBe(12500);
  });

  it('multi-buy tiers come from its costs (gb3 post + Prodigi’s plus-one) and keep every order ≥ 15% net', () => {
    // [price, cost, first post, plus-one post] — scripts/discount-headroom.mjs SANDBOX (5 Nov quotes)
    const econ = (price: number, cost: number, first: number, extra: number): UnitEconomics => ({ pricePence: price, productCostPence: cost, postFirstPence: first, postExtraPence: extra, parcelSavingPerExtraPence: 0 });
    for (const e of [econ(6200, 2800, 785, 300), econ(8700, 4000, 1075, 450), econ(12500, 5900, 1405, 450)]) {
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
  const geom = { printWidthPx: 3543, printHeightPx: 3543, bleedMm: 0, requiredDpi: 300 };

  it('a modest phone photo is plenty for a 6 cm square (it would be soft on the whole 30 cm sheet)', () => {
    const src = { width: 1200, height: 900 };
    expect(assessPrintResolution(geom, src, T, 'multiPhotoFrame').decision).toBe('OK');
    expect(assessPrintResolution(geom, src, T, 'framedPrint').decision).not.toBe('OK');
  });

  it('a thumbnail is still refused', () => {
    expect(assessPrintResolution(geom, { width: 40, height: 30 }, T, 'multiPhotoFrame-1212-gold').decision).toBe('BLOCK');
  });

  it('on the big frames too: each square is judged on its own 6 cm, whichever way it hangs', () => {
    for (const [w, h] of [[7086, 4724], [10629, 7086]] as const) {
      const big = { printWidthPx: w, printHeightPx: h, bleedMm: 0, requiredDpi: 300 };
      expect(assessPrintResolution(big, { width: 1200, height: 900 }, T, 'multiPhotoFrame').decision).toBe('OK');
    }
  });
});

describe('frameSlotTiles — every square, once, before anything reaches the printer', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ printArea: `slot-${i + 1}`, printObjectId: `tile-${i}` }));

  it('orders the tiles by square, whatever order the rows come in', () => {
    const shuffled = rows(9).reverse();
    expect(frameSlotTiles({ size: '12×12″' }, shuffled)).toEqual({ grid: g12, tiles: rows(9).map((r) => r.printObjectId) });
    expect(frameSlotTiles({ size: '24×36″', orientation: 'landscape' }, rows(60))!.grid).toBe(g2436);
  });

  it('is not a frame line when no row is a square', () => {
    expect(frameSlotTiles(undefined, [{ printArea: null, printObjectId: 'x' }])).toBeNull();
  });

  it('refuses a missing, doubled or out-of-range square, a mixed line, or an unknown size', () => {
    expect(() => frameSlotTiles({ size: '12×12″' }, rows(8))).toThrow(/missing square 9/);
    expect(() => frameSlotTiles({ size: '12×12″' }, [...rows(8), { printArea: 'slot-1', printObjectId: 'again' }])).toThrow(/doubled/);
    expect(() => frameSlotTiles({ size: '12×12″' }, [...rows(9), { printArea: 'slot-10', printObjectId: 'extra' }])).toThrow(/unexpected/);
    expect(() => frameSlotTiles({ size: '16×24″', orientation: 'landscape' }, rows(9))).toThrow(/missing squares 10, 11/);
    expect(() => frameSlotTiles({ size: '12×12″' }, [...rows(9), { printArea: null, printObjectId: 'x' }])).toThrow(/mixes/);
    expect(() => frameSlotTiles({ size: 'A4' }, rows(9))).toThrow(/unknown size/);
    expect(() => frameSlotTiles({ size: '16×16″' }, rows(16))).toThrow(/unknown size/); // retired
  });
});
