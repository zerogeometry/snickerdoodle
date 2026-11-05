import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '@/pricing';
import { MULTI_BUY, multiBuyTiers, netAt, tierFor, type UnitEconomics } from '@/pricing/multibuy';
import { parcelGroupOf } from '@/pricing/parcels';
import { definedPriceList, definedPrintSpecs, definedProducts } from '@/server/catalogue';
import { EXPECTED_POPULARITY } from '@/server/popularity';
import { resolveShippingMethod } from '@/fulfillment/submit';
import { CHRISTMAS_LAST_ORDER, deliveryPromise, routeOf, routeOfLineKey } from '@/lib/season';
import { DELIVERY_DAYS, deliveryLine, shipsTracked } from '@/lib/delivery';
import { FAQ_PRODUCT_NAMES } from '@/lib/faq';
import { SHOP_PRODUCTS, WAITING_FOR_PHOTOS } from '@/lib/shop-products';
import { COMPLEMENTS } from '@/lib/complements';
import { babyBodysuitMade, isGarmentKey } from '@/lib/garments';
import { defaultTransformFor } from '@/lib/catalogue-view';
import { strapSizeOf, strapShadeSvg, WATCH_STRAP_SIZES } from '@/lib/watch-strap';
import { assessResolution, canvasSizePx, computeLayerRect, type Transform } from '@/server/print/geometry';
import { plan } from '@/server/print/seedMockups';
import { drawWatchStrapMockup } from '@/server/print/strapMockup';
import sharp from 'sharp';

/**
 * Made in the UK since Prodigi's "global" change (5 Nov 2026 — project-office/briefs/PRODUCT-RANGE-global-uk-nov.md):
 * the baby tee, the toddler tee, both baby bodysuits and the Apple Watch strap. Every number pinned here is from
 * Prodigi's SANDBOX on 5 Nov 2026: GET /v4.0/products/{sku} (print px) and POST /quotes to GB on Standard for
 * every size × colour we sell (lab, cost, post, two-in-a-parcel post).
 */
const NEW = ['babyTee', 'toddlerTee', 'babyBodysuitShort', 'watchStrap'] as const;
const list = definedPriceList();
const rows = (k: string) => list.filter((r) => r.productKey === k);
const specs = definedPrintSpecs();

/** The sandbox quotes (5 Nov): the DEARER colour's product cost, first post, the "plus one" post. Pence, ex-VAT. */
const QUOTED: Record<string, { sku: string[]; lab: string; cost: number; post: number; extra: number }> = {
  babyTee: { sku: ['GLOBAL-TEE-RS-3322'], lab: 'uk2', cost: 900, post: 235, extra: 100 }, // white £8
  toddlerTee: { sku: ['GLOBAL-TEE-RS-3321'], lab: 'uk2', cost: 900, post: 235, extra: 100 }, // white £8
  babyBodysuit: { sku: ['GLOBAL-BB-RS-4411'], lab: 'uk2', cost: 1000, post: 235, extra: 100 }, // white £9
  babyBodysuitShort: { sku: ['GLOBAL-BB-RS-4424'], lab: 'uk2', cost: 900, post: 235, extra: 100 },
  watchStrap: { sku: ['GLOBAL-TECH-AP-WS-FL-38MM', 'GLOBAL-TECH-AP-WS-FL-42MM'], lab: 'uk6', cost: 2200, post: 400, extra: 50 },
};

describe('the new UK-made products are in the catalogue — hidden until their photos are in', () => {
  it('each is defined, priced, orderable and NOT on show (nor is the long-sleeve bodysuit)', () => {
    for (const k of [...NEW, 'babyBodysuit']) {
      expect(rows(k).length, k).toBeGreaterThan(0);
      expect(rows(k).every((r) => !r.visibleInShop && !r.paused), k).toBe(true);
    }
  });

  it('fulfilled by the Prodigi SKUs quoted', () => {
    for (const [k, q] of Object.entries(QUOTED)) expect([...new Set(rows(k).map((r) => r.prodigiSku))].sort(), k).toEqual([...q.sku].sort());
  });

  it('the prices: £20 tees + short-sleeve bodysuit, £22 long-sleeve, £45 strap — the static fallback agrees', () => {
    const prices = (k: string) => [...new Set(rows(k).map((r) => r.pricePence))];
    expect(prices('babyTee')).toEqual([2000]);
    expect(prices('toddlerTee')).toEqual([2000]);
    expect(prices('babyBodysuitShort')).toEqual([2000]);
    expect(prices('babyBodysuit')).toEqual([2200]);
    expect(prices('watchStrap')).toEqual([4500]);
    for (const k of NEW) expect(CATALOGUE[k as keyof typeof CATALOGUE].pricePence, k).toBe(rows(k).find((r) => r.isDefault)!.pricePence);
  });

  it('every price is the founder’s rule, P ≈ (1.03 × landed + £0.75) / 0.61, to the nearest pound', () => {
    for (const [k, q] of Object.entries(QUOTED)) {
      const rule = (1.03 * (q.cost + q.post) + 75) / 0.61;
      for (const p of new Set(rows(k).map((r) => r.pricePence))) expect(Math.abs(p - rule), k).toBeLessThanOrEqual(100);
    }
  });
});

describe('pricing — ~20% net at full price, ≥ 15% on every multi-buy', () => {
  const econ = (k: string): UnitEconomics => ({ pricePence: rows(k)[0]!.pricePence, productCostPence: QUOTED[k]!.cost, postFirstPence: QUOTED[k]!.post, postExtraPence: QUOTED[k]!.extra, parcelSavingPerExtraPence: 0 });

  it('one on its own clears ~20% net after every cost (card fee, reprints, a 5% codes allowance, running)', () => {
    for (const k of Object.keys(QUOTED)) {
      const { netPence, revenueExVatPence } = netAt(econ(k), 1, 0);
      expect(netPence / revenueExVatPence, k).toBeGreaterThanOrEqual(0.18);
    }
  });

  it('the multi-buy tiers derived from these costs keep every basket at ≥ 15% net, 2…12 of them', () => {
    for (const k of Object.keys(QUOTED)) {
      const tiers = multiBuyTiers(econ(k));
      for (let q = 2; q <= MULTI_BUY.checkUpTo; q++) {
        const { netPence, revenueExVatPence } = netAt(econ(k), q, tierFor(tiers, q));
        expect(netPence / revenueExVatPence, `${k} × ${q}`).toBeGreaterThanOrEqual(0.15 - 1e-9);
      }
    }
  });

  it('…and the tiers they get: 10% for two, 15% for three or more (a second in one parcel posts for only +£1 / +50p)', () => {
    const pct = (t: number[]) => t.map((b) => b / 100).join('/');
    for (const k of Object.keys(QUOTED)) expect(pct(multiBuyTiers(econ(k))), k).toBe('10/15/15/15');
  });

  it('none joins a same-parcel group (uk2’s second item saves only ~£1.35 of post — less than the £3 we’d give)', () => {
    for (const k of [...NEW, 'babyBodysuit']) expect(parcelGroupOf(k), k).toBeNull();
  });
});

describe('print files — Prodigi’s exact px; garments made at 300 dpi, judged at 150', () => {
  const pxOf = (k: string) => [...new Set(specs.filter((s) => s.productKey === k).map((s) => `${s.template.printWidthPx}x${s.template.printHeightPx}`))];

  it('the exact files (sandbox GET /v4.0/products, 5 Nov)', () => {
    expect(pxOf('babyTee')).toEqual(['1770x1770']);
    expect(pxOf('toddlerTee')).toEqual(['3060x3780']);
    expect(pxOf('babyBodysuit')).toEqual(['2130x2130']);
    expect(pxOf('babyBodysuitShort')).toEqual(['2490x3510']);
    // the brief guessed 305×2738 for both; Prodigi's 42 mm strap is wider AND longer
    expect(Object.fromEntries(specs.filter((s) => s.productKey === 'watchStrap').map((s) => [s.prodigiSku, `${s.template.printWidthPx}x${s.template.printHeightPx}`]))).toEqual({
      'GLOBAL-TECH-AP-WS-FL-38MM': '305x2738', 'GLOBAL-TECH-AP-WS-FL-42MM': '363x2932',
    });
  });

  it('garments print to the FRONT only, at 300 dpi, judged at 150; the strap to `default`, judged at 300', () => {
    for (const k of ['babyTee', 'toddlerTee', 'babyBodysuit', 'babyBodysuitShort']) {
      expect(isGarmentKey(k), k).toBe(true);
      for (const s of specs.filter((x) => x.productKey === k)) {
        expect(s.printTo, s.sku).toEqual(['front']);
        expect(s.template.requiredDpi).toBe(300);
        expect(s.template.gateDpi, s.sku).toBe(150);
        expect(s.template.bleedMm).toBe(0);
      }
    }
    for (const s of specs.filter((x) => x.productKey === 'watchStrap')) {
      expect(s.printTo).toEqual(['default']);
      expect(s.template.requiredDpi).toBe(300);
      expect(s.template.bleedMm).toBe(0);
      expect(s.prodigiAttrs).toBeNull(); // one variant per SKU (black fittings) — like the phone cases
    }
  });
});

describe('only what Prodigi makes in the UK, with one GB print area', () => {
  const colours = (k: string) => new Set(rows(k).map((r) => r.prodigiAttrs?.color));
  const sizes = (k: string) => new Set(rows(k).map((r) => r.prodigiAttrs?.size));

  it('the toddler tee: 1–2 and 3–4 years only (the other sizes don’t quote to GB); no Canadian or Australian colours', () => {
    expect(sizes('toddlerTee')).toEqual(new Set(['1-2 years', '3-4 years']));
    for (const away of ['pink', 'light blue', 'yellow', 'grass', 'slate']) expect(colours('toddlerTee').has(away), away).toBe(false);
  });

  it('the baby tee: four sizes; no navy (6–12 and 12–18 months list a different, portrait print area)', () => {
    expect(sizes('babyTee')).toEqual(new Set(['newborn', '6-12 months', '12-18 months', '18-24 months']));
    expect(colours('babyTee').has('navy blue')).toBe(false);
    expect(rows('babyTee')).toHaveLength(4 * 8);
  });

  it('the short-sleeve bodysuit: no white (Prodigi makes it in Canada) and none of its Australian colours', () => {
    for (const away of ['white', 'ballerina', 'grass', 'yellow']) expect(colours('babyBodysuitShort').has(away), away).toBe(false);
  });

  it('the long-sleeve bodysuit: no heather newborn; 18–24 months only where Prodigi lists ONE print area', () => {
    expect(rows('babyBodysuit').some((r) => r.attributes.size === 'newborn' && r.attributes.colour === 'heather grey')).toBe(false);
    expect(rows('babyBodysuit').filter((r) => r.attributes.size === '18-24 months').map((r) => r.attributes.colour).sort()).toEqual(['light pink', 'navy']);
    expect(babyBodysuitMade('18-24 months', 'white')).toBe(false);
    // the existing default (white newborn) keeps its sku — baskets and orders still resolve
    expect(rows('babyBodysuit').find((r) => r.isDefault)).toMatchObject({ sku: 'babyBodysuit', attributes: { size: 'newborn', colour: 'white' } });
  });

  it('our colour names are friendly, Prodigi gets ITS value (heather grey → heather, butter yellow → butter)', () => {
    const r = rows('babyTee').find((x) => x.attributes.colour === 'butter yellow')!;
    expect(r.prodigiAttrs).toMatchObject({ color: 'butter' });
    expect(rows('toddlerTee').find((x) => x.attributes.colour === 'heather grey')!.prodigiAttrs).toMatchObject({ color: 'heather' });
  });
});

describe('labs, post and Christmas', () => {
  it('the garments are uk2 (Royal Mail 1st Class — untracked, so never called tracked)', () => {
    for (const k of ['babyTee', 'toddlerTee', 'babyBodysuit', 'babyBodysuitShort']) {
      expect(routeOf(k), k).toBe('uk2');
      expect(shipsTracked(k), k).toBe(false);
      expect(shipsTracked(`${k}-612months-pink`), k).toBe(false);
    }
    expect(deliveryLine(['babyTee', 'mug'])).toBe('free delivery');
  });

  it('the strap is uk6 on Standard — Royal Mail Standard TRACKED, so it needs no Express (unlike a phone case)', () => {
    expect(routeOf('watchStrap')).toBe('uk6std');
    expect(routeOfLineKey('watchStrap-large')).toBe('uk6std');
    expect(shipsTracked('watchStrap')).toBe(true);
    expect(resolveShippingMethod(['watchStrap'])).toBe('Standard');
    expect(resolveShippingMethod(['watchStrap', 'phoneCase'])).toBe('Express'); // with a case, the case's rule
    expect(DELIVERY_DAYS.uk6std).toBeDefined();
  });

  it('their last order dates for Christmas 2026: 12 December (Tracked 48 / 1st Class)', () => {
    const t = CHRISTMAS_LAST_ORDER[2026]!.byRoute;
    expect(t.uk2).toBe('2026-12-12');
    expect(t.uk6std).toBe('2026-12-12');
    expect(deliveryPromise('watchStrap', new Date('2026-12-13T09:00:00Z'))).toMatchObject({ state: 'missed' });
    expect(deliveryPromise('toddlerTee', new Date('2026-12-12T09:00:00Z'))).toMatchObject({ state: 'in-time', daysLeft: 0 });
  });
});

describe('ready to switch on', () => {
  it('each has a friendly FAQ name, add-on suggestions and a place in the expected popularity', () => {
    for (const k of [...NEW, 'babyBodysuit']) {
      expect(FAQ_PRODUCT_NAMES[k], k).toBeTruthy();
      expect(COMPLEMENTS[k]?.length, k).toBeGreaterThan(0);
      expect(EXPECTED_POPULARITY, k).toContain(k);
    }
  });

  it('their public page copy is written and waiting — and moves into SHOP_PRODUCTS when one goes on show', () => {
    const shown = new Set(definedProducts().filter((p) => p.visibleInShop).map((p) => p.key));
    for (const [k, c] of Object.entries(WAITING_FOR_PHOTOS)) {
      expect(shown.has(k), `${k} is on show — move its copy into SHOP_PRODUCTS`).toBe(false);
      expect(SHOP_PRODUCTS[k], k).toBeUndefined();
      expect(c.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(Object.values(SHOP_PRODUCTS).some((s) => s.slug === c.slug), c.slug).toBe(false);
    }
    expect(Object.keys(WAITING_FOR_PHOTOS).sort()).toEqual([...NEW, 'babyBodysuit'].sort());
  });

  it('the strap’s sizes say which watches they fit, in plain words', () => {
    const strap = definedProducts().find((p) => p.key === 'watchStrap')!;
    expect(rows('watchStrap').map((r) => r.attributes.size)).toEqual(['small', 'large']);
    expect(strap.description).toMatch(/small fits 38, 40 and 41 mm/);
    expect(strap.description).toMatch(/large fits 44, 45, 46 and 49 mm/);
    expect(strap.specs.small).toBe(WATCH_STRAP_SIZES[0]!.fits);
  });
});

describe('the mockup pipeline — lights up when the founder’s layers are dropped in', () => {
  it('garments: one layered set PER COLOUR (layered/<product>/<colour>/); none staged ⇒ the plain tile, never the wrong colour', () => {
    for (const k of ['babyTee', 'toddlerTee', 'babyBodysuitShort']) {
      for (const r of rows(k)) {
        const p = plan(k, r.attributes);
        // either the founder's set for THIS colour, or nothing (the plain tile)
        expect(p === null || (p.register === 'layered-flat' && p.dir.replace(/\\/g, '/').endsWith(`${k}/${r.attributes.colour!.replace(/\s+/g, '-')}`)), r.sku).toBe(true);
      }
    }
    // the long-sleeve keeps its white derived photo for WHITE only — a coloured one never shows white
    for (const r of rows('babyBodysuit').filter((x) => x.attributes.colour !== 'white')) {
      const p = plan('babyBodysuit', r.attributes);
      expect(p === null || p.register === 'layered-flat', r.sku).toBe(true);
    }
  });

  it('the strap: the founder’s set per size, else the drawn strap traced from Prodigi’s template', () => {
    for (const r of rows('watchStrap')) {
      const p = plan('watchStrap', r.attributes)!;
      expect(['layered-flat', 'drawn-strap']).toContain(p.register);
    }
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

  it('the default placement shows the drawing on the strap — never hidden behind the watch', () => {
    for (const size of ['small', 'large']) {
      const t = geomOf(size);
      const s = strapSizeOf(size);
      const gapBottom = s.pieces[1]![0]![0];
      const { width: CW, height: CH } = canvasSizePx(t);
      for (const [w, h] of [[1200, 1600], [1600, 1200], [1000, 1000], [600, 1800], [2400, 900]] as const) {
        const tf = defaultTransformFor('watchStrap', w / h) as Transform;
        const r = computeLayerRect(t, { width: w, height: h }, tf);
        const rotated = tf.rotationDeg % 180 !== 0;
        const top = rotated ? r.y + (r.height - r.width) / 2 : r.y; // the turned drawing's box
        expect(top / CH, `${size} ${w}×${h}`).toBeGreaterThanOrEqual(gapBottom - 0.002);
        expect(r.x + r.width / 2).toBeCloseTo(CW / 2, 0);
        if (w > h) expect(tf.rotationDeg, 'a landscape drawing runs along the strap').toBe(90);
      }
    }
  });

  it('the print-quality check works on the thin strip: a phone photo is print-ready, a tiny thumbnail is blocked', () => {
    for (const size of ['small', 'large']) {
      const t = geomOf(size);
      const tf = defaultTransformFor('watchStrap', 3 / 4) as Transform;
      expect(assessResolution(t, { width: 3000, height: 4000 }, tf).decision, size).toBe('OK');
      expect(assessResolution(t, { width: 60, height: 80 }, tf).decision, size).toBe('BLOCK');
      expect(assessResolution(t, { width: 400, height: 533 }, tf).decision, size).toBe('OK'); // the strap is only ~2.5–3 cm wide
    }
  });
});
