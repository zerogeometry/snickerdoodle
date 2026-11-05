import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { CATALOGUE } from '@/pricing';
import { MULTI_BUY, multiBuyTiers, netAt, tierFor, type UnitEconomics } from '@/pricing/multibuy';
import { parcelGroupOf } from '@/pricing/parcels';
import { definedPriceList, definedPrintSpecs, definedProducts } from '@/server/catalogue';
import { EXPECTED_POPULARITY } from '@/server/popularity';
import { resolveShippingMethod } from '@/fulfillment/submit';
import { CHRISTMAS_LAST_ORDER, deliveryPromise, routeOf, routeOfLineKey, seasonalExpected } from '@/lib/season';
import { DELIVERY_DAYS, deliveryLine, shipsTracked } from '@/lib/delivery';
import { FAQ_PRODUCT_NAMES } from '@/lib/faq';
import { SHOP_PRODUCTS } from '@/lib/shop-products';
import { COMPLEMENTS } from '@/lib/complements';
import { defaultTransformFor } from '@/lib/catalogue-view';
import { strapBands, strapPhotoBox, strapShadeSvg, WATCH_STRAP_SIZES } from '@/lib/watch-strap';
import { isGroundProduct } from '@/lib/patterns';
import { assessResolution, canvasSizePx, computeLayerRect, type Transform } from '@/server/print/geometry';
import { plan } from '@/server/print/seedMockups';
import { drawWatchStrapMockup } from '@/server/print/strapMockup';

/**
 * The APPLE WATCH STRAP — made in the UK since Prodigi's "global" change (5 Nov 2026 — project-office/briefs/
 * PRODUCT-RANGE-global-uk-nov.md). Every number pinned here is from Prodigi's SANDBOX on 5 Nov 2026: GET
 * /v4.0/products/{sku} (print px) and POST /quotes to GB on Standard (lab, cost, post, two-in-a-parcel post).
 * (The baby + toddler clothes were dropped — founder, 5 Nov: tracked only on Express, which would have put
 * £1–£8 more post on everything else in the order.)
 */
const list = definedPriceList();
const rows = (k: string) => list.filter((r) => r.productKey === k);
const specs = definedPrintSpecs();
/** The sandbox quote (5 Nov), pence ex-VAT: product cost, first post, the "plus one" post. */
const STRAP = { sku: ['GLOBAL-TECH-AP-WS-FL-38MM', 'GLOBAL-TECH-AP-WS-FL-42MM'], cost: 2200, post: 400, extra: 50 };

describe('the watch strap is in the catalogue — ON SHOW (founder, 5 Nov: its photos are in)', () => {
  it('defined, priced, orderable and on show', () => {
    expect(rows('watchStrap').length).toBe(2);
    expect(rows('watchStrap').every((r) => r.visibleInShop && !r.paused)).toBe(true);
  });

  it('the baby + toddler clothes are NOT in the catalogue; the long-sleeve bodysuit is as it was (white, £22, hidden)', () => {
    for (const k of ['babyTee', 'toddlerTee', 'babyBodysuitShort']) expect(rows(k), k).toHaveLength(0);
    expect(list.some((r) => ['GLOBAL-TEE-RS-3322', 'GLOBAL-TEE-RS-3321', 'GLOBAL-BB-RS-4424'].includes(r.prodigiSku ?? ''))).toBe(false);
    expect(new Set(rows('babyBodysuit').map((r) => `${r.attributes.colour} ${r.pricePence} ${r.visibleInShop}`))).toEqual(new Set(['white 2200 false']));
  });

  it('fulfilled by the Prodigi SKUs quoted, at £45 — the static fallback agrees', () => {
    expect([...new Set(rows('watchStrap').map((r) => r.prodigiSku))].sort()).toEqual([...STRAP.sku].sort());
    expect([...new Set(rows('watchStrap').map((r) => r.pricePence))]).toEqual([4500]);
    expect(CATALOGUE.watchStrap.pricePence).toBe(4500);
  });

  it('the price is the founder’s rule, P ≈ (1.03 × landed + £0.75) / 0.61, to the nearest pound', () => {
    expect(Math.abs(4500 - (1.03 * (STRAP.cost + STRAP.post) + 75) / 0.61)).toBeLessThanOrEqual(100);
  });
});

describe('pricing — ~20% net at full price, ≥ 15% on every multi-buy', () => {
  const econ: UnitEconomics = { pricePence: 4500, productCostPence: STRAP.cost, postFirstPence: STRAP.post, postExtraPence: STRAP.extra, parcelSavingPerExtraPence: 0 };

  it('one on its own clears ~20% net after every cost (card fee, reprints, a 5% codes allowance, running)', () => {
    const { netPence, revenueExVatPence } = netAt(econ, 1, 0);
    expect(netPence / revenueExVatPence).toBeGreaterThanOrEqual(0.19);
  });

  it('the multi-buy tiers from its costs (10% for two, 15% for three or more) keep every basket at ≥ 15% net, 2…12', () => {
    const tiers = multiBuyTiers(econ);
    expect(tiers.map((b) => b / 100).join('/')).toBe('10/15/15/15');
    for (let q = 2; q <= MULTI_BUY.checkUpTo; q++) {
      const { netPence, revenueExVatPence } = netAt(econ, q, tierFor(tiers, q));
      expect(netPence / revenueExVatPence, `× ${q}`).toBeGreaterThanOrEqual(0.15 - 1e-9);
    }
    expect(parcelGroupOf('watchStrap')).toBeNull();
  });
});

describe('print files — Prodigi’s exact px', () => {
  it('the exact files (sandbox GET /v4.0/products, 5 Nov) — the 42 mm is wider AND longer than the brief guessed', () => {
    expect(Object.fromEntries(specs.filter((s) => s.productKey === 'watchStrap').map((s) => [s.prodigiSku, `${s.template.printWidthPx}x${s.template.printHeightPx}`]))).toEqual({
      'GLOBAL-TECH-AP-WS-FL-38MM': '305x2738', 'GLOBAL-TECH-AP-WS-FL-42MM': '363x2932',
    });
    for (const s of specs.filter((x) => x.productKey === 'watchStrap')) {
      expect(s.printTo).toEqual(['default']);
      expect(s.template.requiredDpi).toBe(300);
      expect(s.template.bleedMm).toBe(0);
      expect(s.prodigiAttrs).toBeNull(); // one variant per SKU (black fittings) — like the phone cases
    }
  });
});

describe('post and Christmas', () => {
  it('the strap is uk6 on Standard — Royal Mail Standard TRACKED, so it needs no Express (unlike a phone case)', () => {
    expect(routeOf('watchStrap')).toBe('uk6std');
    expect(routeOfLineKey('watchStrap-large')).toBe('uk6std');
    expect(shipsTracked('watchStrap')).toBe(true);
    expect(deliveryLine('watchStrap')).toBe('free tracked delivery');
    expect(resolveShippingMethod(['watchStrap'])).toBe('Standard');
    expect(resolveShippingMethod(['watchStrap', 'phoneCase'])).toBe('Express'); // with a case, the case's rule
    expect(DELIVERY_DAYS.uk6std).toBeDefined();
  });

  it('a phone case with a calendar stays Standard (Prodigi has no Express for the calendar) — and isn’t called tracked', () => {
    expect(resolveShippingMethod(['phoneCase', 'calendar-a4'])).toBe('Standard');
    expect(deliveryLine(['phoneCase', 'calendar'])).toBe('free delivery');
    expect(deliveryLine(['calendar', 'mug'])).toBe('free tracked delivery');
  });

  it('its last order date for Christmas 2026: 12 December (Tracked 48)', () => {
    expect(CHRISTMAS_LAST_ORDER[2026]!.byRoute.uk6std).toBe('2026-12-12');
    expect(deliveryPromise('watchStrap', new Date('2026-12-12T09:00:00Z'))).toMatchObject({ state: 'in-time', daysLeft: 0 });
    expect(deliveryPromise('watchStrap', new Date('2026-12-13T09:00:00Z'))).toMatchObject({ state: 'missed' });
  });
});

describe('on show', () => {
  it('a friendly FAQ name, add-on suggestions — and it sits straight after the phone case in the shop (founder, 5 Nov)', () => {
    expect(FAQ_PRODUCT_NAMES.watchStrap).toBeTruthy();
    expect(COMPLEMENTS.watchStrap?.length).toBeGreaterThan(0);
    expect(EXPECTED_POPULARITY.indexOf('watchStrap')).toBe(EXPECTED_POPULARITY.indexOf('phoneCase') + 1);
    // …and the Christmas ordering (seasonalExpected) leaves the two side by side
    const xmas = seasonalExpected(EXPECTED_POPULARITY, new Date('2026-11-20T12:00:00Z'));
    expect(xmas.indexOf('watchStrap')).toBe(xmas.indexOf('phoneCase') + 1);
  });

  it('it has its public page: /products/apple-watch-strap, in Google’s watch-bands category', () => {
    expect(SHOP_PRODUCTS.watchStrap).toMatchObject({ slug: 'apple-watch-strap', googleCategory: { id: 5123 } });
  });

  it('its sizes say which watches they fit, in plain words', () => {
    const strap = definedProducts().find((p) => p.key === 'watchStrap')!;
    expect(rows('watchStrap').map((r) => r.attributes.size)).toEqual(['small', 'large']);
    expect(strap.description).toMatch(/small fits 38, 40 and 41 mm/);
    expect(strap.description).toMatch(/large fits 44, 45, 46 and 49 mm/);
    expect(strap.specs.small).toBe(WATCH_STRAP_SIZES[0]!.fits);
  });
});

describe('the mockup pipeline — lights up when the founder’s layers are dropped in', () => {
  it('the strap: the founder’s layered set (both sizes), else the drawn strap traced from Prodigi’s template', () => {
    for (const r of rows('watchStrap')) {
      const p = plan('watchStrap', r.attributes)!;
      expect(['layered-strap', 'drawn-strap']).toContain(p.register);
    }
  });

  it('a strap PHOTO is registered half by half: the file’s top, gap and bottom land on the photo’s two halves', () => {
    for (const s of WATCH_STRAP_SIZES) {
      // a photo whose halves sit exactly where the file says (scaled by 1600 px, from y = 200) fits exactly…
      const at = (f: number) => 200 + f * 1600;
      const exact = strapPhotoBox(s, [[at(s.pieces[0]![0]![0]), at(s.pieces[0]!.at(-1)![0])], [at(s.pieces[1]![0]![0]), at(s.pieces[1]!.at(-1)![0])]], 1000);
      expect(exact.residualPx, s.size).toBeLessThan(0.01);
      expect(exact.y).toBeCloseTo(200, 3);
      expect(exact.h).toBeCloseTo(1600, 3);
      expect(exact.w / exact.h).toBeCloseTo(s.px.w / s.px.h, 6); // aspect-locked to the file
      expect(exact.x + exact.w / 2).toBeCloseTo(1000, 6);
      // …and the founder's photo (a longer gap than Prodigi's) still lands each end within ~3% of the strap's length
      const founder = strapPhotoBox(s, [[247, 733], [1116, 1864]], 995);
      expect(founder.residualPx / (1864 - 247), s.size).toBeLessThan(0.035);
    }
  });

  it('…and then laid HALF BY HALF (strapBands), so each half of the file lands EXACTLY on its half of the photo', () => {
    for (const s of WATCH_STRAP_SIZES) {
      const [fu0, fu1] = [s.pieces[0]![0]![0], s.pieces[0]!.at(-1)![0]];
      const [fl0, fl1] = [s.pieces[1]![0]![0], s.pieces[1]!.at(-1)![0]];
      // the founder's halves, as fractions of the print area (a longer gap than the file's)
      const halves: [[number, number], [number, number]] = [[0.02, 0.31], [0.55, 0.99]];
      const [top, bottom] = strapBands(s, halves);
      const map = (b: { from: [number, number]; to: [number, number] }, f: number) => b.to[0] + ((f - b.from[0]) * (b.to[1] - b.to[0])) / (b.from[1] - b.from[0]);
      // Prodigi's top half (file rows fu0…fu1) lands exactly on the photo's top half; the bottom on the bottom
      expect(map(top!, fu0)).toBeCloseTo(0.02, 9);
      expect(map(top!, fu1)).toBeCloseTo(0.31, 9);
      expect(map(bottom!, fl0)).toBeCloseTo(0.55, 9);
      expect(map(bottom!, fl1)).toBeCloseTo(0.99, 9);
      // the file is cut in its unprinted gap — nothing that prints is lost; together the bands cover the whole file
      expect(top!.from[1]).toBeGreaterThan(fu1);
      expect(top!.from[1]).toBeLessThan(fl0);
      expect([top!.from[0], top!.from[1]]).toEqual([0, bottom!.from[0]]);
      expect(bottom!.from[1]).toBe(1);
    }
  });

  it('the strap takes a BASE COLOUR off the wheel, like the other edge-to-edge products (founder, 5 Nov)', () => {
    expect(isGroundProduct('watchStrap')).toBe(true);
    expect(isGroundProduct('watchStrap-large')).toBe(true);
  });

  it('the drawn strap: its print area IS the file’s shape, and blank, mask + overlay share one canvas', async () => {
    for (const s of WATCH_STRAP_SIZES) {
      const d = drawWatchStrapMockup(s.px);
      const qa = ((d.quad[1]![0] - d.quad[0]![0]) * d.W) / ((d.quad[3]![1] - d.quad[0]![1]) * d.H);
      expect(Math.abs(qa / (s.px.w / s.px.h) - 1), s.size).toBeLessThan(0.005);
      for (const [x, y] of d.quad) for (const v of [x, y]) expect(v >= 0 && v <= 1, s.size).toBe(true);
      for (const buf of [d.blank, d.mask, d.overlay].filter(Boolean) as Buffer[]) {
        const m = await sharp(buf).metadata();
        expect([m.width, m.height], s.size).toEqual([d.W, d.H]);
      }
    }
  }, 20_000);
});

describe('the watch strap’s long, thin print file', () => {
  const geomOf = (size: string) => specs.find((s) => s.productKey === 'watchStrap' && s.attributes.size === size)!.template;

  it('the traced halves sit inside the file, top then bottom, with the gap behind the watch between them', () => {
    for (const s of WATCH_STRAP_SIZES) {
      const [upper, lower] = s.pieces as [Array<[number, number, number]>, Array<[number, number, number]>];
      for (const [y, l, r] of [...upper, ...lower]) {
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(1);
        expect(l).toBeLessThan(r);
        expect(l).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1);
      }
      const gap = lower[0]![0] - upper.at(-1)![0];
      expect(gap, s.size).toBeGreaterThan(0.15); // ~a fifth of the length doesn't print
      expect(gap, s.size).toBeLessThan(0.22);
      expect(s.holes.every((h) => h.y > lower[0]![0] && h.y < lower.at(-1)![0])).toBe(true);
      expect(strapShadeSvg(s, s.px.w, s.px.h)).toContain('evenodd');
    }
  });

  it('the default placement FILLS the strap (founder, 5 Nov: "scale to fit the watch", everywhere): upright, covering the whole file', () => {
    for (const size of ['small', 'large']) {
      const t = geomOf(size);
      const { width: CW, height: CH } = canvasSizePx(t);
      for (const [w, h] of [[1200, 1600], [1600, 1200], [1000, 1000], [600, 1800], [2400, 900]] as const) {
        const tf = defaultTransformFor('watchStrap', w / h) as Transform;
        expect(tf, `${size} ${w}×${h}`).toEqual({ scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 });
        const r = computeLayerRect(t, { width: w, height: h }, tf);
        // the drawing reaches every edge of the print file — so both printed halves, end to end
        expect(r.x, `${size} ${w}×${h}`).toBeLessThanOrEqual(0);
        expect(r.y).toBeLessThanOrEqual(0);
        expect(r.x + r.width).toBeGreaterThanOrEqual(CW);
        expect(r.y + r.height).toBeGreaterThanOrEqual(CH);
      }
    }
  });

  it('the print-quality check works on the thin strip at that fill: a phone photo is print-ready, a thumbnail is blocked', () => {
    for (const size of ['small', 'large']) {
      const t = geomOf(size);
      const tf = defaultTransformFor('watchStrap', 3 / 4) as Transform;
      expect(assessResolution(t, { width: 3000, height: 4000 }, tf).decision, size).toBe('OK');
      expect(assessResolution(t, { width: 120, height: 160 }, tf).decision, size).toBe('BLOCK');
    }
  });
});
