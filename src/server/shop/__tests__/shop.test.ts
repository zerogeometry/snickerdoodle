import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { definedPriceList } from '@/server/catalogue';
import { EXAMPLES } from '@/lib/examples';
import { CHRISTMAS_FEATURED } from '@/lib/season';
import { CHRISTMAS_PHOTOS, SHOP_PRODUCTS, productKeyForSlug } from '@/lib/shop-products';
import { shopListings, shopListingBySlug } from '../listing';
import { productJsonLd } from '../structuredData';
import { buildMerchantFeed, merchantFeedItems } from '../merchantFeed';

const ORIGIN = 'https://snickerdoodle.co.uk';
const onShow = definedPriceList().filter((r) => r.visibleInShop && !r.paused);
const priceOfSku = new Map(onShow.map((r) => [r.sku, r.pricePence]));
const shopKeys = new Set(onShow.map((r) => r.productKey));

/** The ONLY images a public page or the feed may use: brand-safe marketing photos, never a family's. */
const BRAND_SAFE = new Set<string>([...EXAMPLES.map((e) => e.src), ...CHRISTMAS_PHOTOS]);
/** Round-trip through JSON: the markup exactly as a crawler reads it. */
const asLd = (x: unknown) => JSON.parse(JSON.stringify(x));
const isBrandSafe = (src: string) => BRAND_SAFE.has(src) && (src.startsWith('/examples/') || src.startsWith('/christmas/'));

describe('the public shop listing', () => {
  it('covers exactly the products on show — every one has public copy, nothing hidden is listed', () => {
    expect(new Set(shopListings().map((l) => l.key))).toEqual(shopKeys);
    expect(Object.keys(SHOP_PRODUCTS).sort()).toEqual([...shopKeys].sort());
  });

  it('slugs are unique, lowercase, evergreen and round-trip', () => {
    const slugs = Object.values(SHOP_PRODUCTS).map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const [key, c] of Object.entries(SHOP_PRODUCTS)) {
      expect(c.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(productKeyForSlug(c.slug)).toBe(key);
      expect(shopListingBySlug(c.slug)?.key).toBe(key);
    }
  });

  it('every photo is a brand-safe marketing image that exists — never anything else', () => {
    for (const [key, c] of Object.entries(SHOP_PRODUCTS)) {
      if (!c.image) continue;
      expect(isBrandSafe(c.image.src), `${key}: ${c.image.src}`).toBe(true);
      expect(existsSync(path.join(process.cwd(), 'public', c.image.src)), c.image.src).toBe(true);
      expect(c.image.alt.length, key).toBeGreaterThan(20);
    }
  });

  it('prices come from the catalogue: one offer per price, its sku really costs that', () => {
    for (const l of shopListings()) {
      const prices = new Set(onShow.filter((r) => r.productKey === l.key).map((r) => r.pricePence));
      expect(l.offers.map((o) => o.pricePence).sort((a, b) => a - b)).toEqual([...prices].sort((a, b) => a - b));
      for (const o of l.offers) expect(priceOfSku.get(o.sku), o.sku).toBe(o.pricePence);
      expect(l.fromPence).toBe(Math.min(...prices));
    }
  });

  it('groups variants sensibly — not one per phone model or frame colour', () => {
    const by = new Map(shopListings().map((l) => [l.key, l]));
    expect(by.get('phoneCase')!.offers.map((o) => o.label)).toEqual(['snap', 'tough']);
    expect(by.get('framedPrint')!.offers.map((o) => o.label)).toEqual(['11×14″', '12×16″', '18×24″', '24×32″']);
    expect(by.get('wrappingPaper')!.offers.map((o) => o.label)).toEqual(['2 m roll', '3 m roll', '5 m roll']);
    expect(by.get('cushion')!.offers.find((o) => o.pricePence === 3500)!.label).toBe('12″ square, printed both sides');
    expect(by.get('mug')!.offers).toHaveLength(1);
    expect(by.get('mug')!.offers[0]!.label).toBe('');
  });

  it('the christmas flag follows the season’s lead range', () => {
    for (const l of shopListings()) expect(l.christmas, l.key).toBe((CHRISTMAS_FEATURED as readonly string[]).includes(l.key));
  });
});

describe('Product structured data (C7)', () => {
  const single = shopListings().find((l) => l.key === 'ceramicOrnament')!;
  const group = shopListings().find((l) => l.key === 'framedPrint')!;

  it('one price → a Product with one Offer, priced from the catalogue in GBP', () => {
    const ld = asLd(productJsonLd(single, ORIGIN));
    expect(ld['@type']).toBe('Product');
    expect(ld.brand).toEqual({ '@type': 'Brand', name: 'Snickerdoodle' });
    expect(ld.url).toBe(`${ORIGIN}/products/ceramic-christmas-ornament`);
    expect(ld.offers.price).toBe((priceOfSku.get('ceramicOrnament')! / 100).toFixed(2));
    expect(ld.offers.priceCurrency).toBe('GBP');
    expect(ld.offers.availability).toBe('https://schema.org/InStock');
    expect(ld.offers.itemCondition).toBe('https://schema.org/NewCondition');
  });

  it('free UK delivery with handling + transit days, and the personalised returns policy', () => {
    const o = asLd(productJsonLd(single, ORIGIN)).offers;
    expect(o.shippingDetails.shippingRate).toEqual({ '@type': 'MonetaryAmount', value: 0, currency: 'GBP' });
    expect(o.shippingDetails.shippingDestination.addressCountry).toBe('GB');
    const t = o.shippingDetails.deliveryTime;
    expect(t.handlingTime).toMatchObject({ minValue: single.delivery.handling[0], maxValue: single.delivery.handling[1], unitCode: 'DAY' });
    expect(t.transitTime).toMatchObject({ minValue: single.delivery.transit[0], maxValue: single.delivery.transit[1], unitCode: 'DAY' });
    expect(o.hasMerchantReturnPolicy.returnPolicyCategory).toBe('https://schema.org/MerchantReturnNotPermitted');
    expect(o.hasMerchantReturnPolicy.itemDefectReturnFees).toBe('https://schema.org/FreeReturn');
    expect(o.hasMerchantReturnPolicy.applicableCountry).toBe('GB');
  });

  it('several prices → a ProductGroup with one variant per price, each linking to its own price', () => {
    const ld = asLd(productJsonLd(group, ORIGIN));
    expect(ld['@type']).toBe('ProductGroup');
    expect(ld.productGroupID).toBe('framedPrint');
    expect(ld.hasVariant).toHaveLength(4);
    for (const v of ld.hasVariant) {
      expect(v.offers.price).toBe((priceOfSku.get(v.sku)! / 100).toFixed(2));
      expect(v.offers.url).toBe(`${ORIGIN}/products/framed-print?v=${encodeURIComponent(v.sku)}`);
    }
  });

  it('every page’s markup: brand-safe images only, never a family page, never a client price', () => {
    for (const l of shopListings()) {
      const text = JSON.stringify(productJsonLd(l, ORIGIN));
      for (const m of text.matchAll(/https:\/\/snickerdoodle\.co\.uk(\/[^"?#]*)/g)) {
        const p = m[1]!;
        expect(/^\/(customize|studio|start-creating|g\/|checkout|home|family|api)/.test(p), p).toBe(false);
        if (/\.(webp|png|jpe?g)$/.test(p)) expect(isBrandSafe(p), p).toBe(true);
      }
    }
  });
});

/** A small XML well-formedness check (no parser dependency): balanced tags, legal entities, one root. */
function checkXml(xml: string): string[] {
  const errors: string[] = [];
  const body = xml.replace(/^<\?xml[^?]*\?>\s*/, '');
  const stack: string[] = [];
  let roots = 0;
  for (const m of body.matchAll(/<(\/?)([A-Za-z_][\w:.-]*)([^>]*?)(\/?)>|&([^;\s]*);?|[<>]/g)) {
    if (m[5] !== undefined) {
      if (!/^(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+)$/.test(m[5]) || !m[0].endsWith(';')) errors.push(`bad entity ${m[0]}`);
      continue;
    }
    if (!m[2]) {
      errors.push(`stray ${m[0]}`);
      continue;
    }
    if (m[1]) {
      if (stack.pop() !== m[2]) errors.push(`unbalanced </${m[2]}>`);
    } else if (!m[4]) {
      if (stack.length === 0) roots++;
      stack.push(m[2]);
    }
  }
  if (stack.length) errors.push(`unclosed ${stack.join(',')}`);
  if (roots !== 1) errors.push(`${roots} roots`);
  return errors;
}

describe('the Google Merchant Center feed (C8)', () => {
  const xml = buildMerchantFeed(ORIGIN);
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]!);
  const field = (item: string, name: string) => new RegExp(`<g:${name}>([^<]*)</g:${name}>`).exec(item)?.[1];

  it('is well-formed RSS 2.0 with Google’s namespace', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">');
    expect(checkXml(xml)).toEqual([]);
    expect(checkXml('<a><b>x & y</b></a>')).not.toEqual([]); // the checker does catch a raw &
  });

  it('one item per price group of every product on show that has a photo — ids unique', () => {
    const expected = shopListings().filter((l) => l.image && !l.feed?.exclude).reduce((n, l) => n + l.offers.length, 0);
    expect(items).toHaveLength(expected);
    const ids = items.map((i) => field(i, 'id'));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(priceOfSku.has(id!), `${id} is a sku on show`).toBe(true);
    expect(items.filter((i) => field(i, 'item_group_id') === 'phoneCase')).toHaveLength(2);
  });

  it('every price matches the catalogue, in GBP', () => {
    for (const i of items) expect(field(i, 'price'), field(i, 'id')).toBe(`${(priceOfSku.get(field(i, 'id')!)! / 100).toFixed(2)} GBP`);
  });

  it('every image is a brand-safe catalogue image — no other image can get in', () => {
    for (const i of items) {
      const img = field(i, 'image_link')!;
      expect(img.startsWith(`${ORIGIN}/`)).toBe(true);
      expect(isBrandSafe(img.slice(ORIGIN.length)), img).toBe(true);
    }
    expect(xml).not.toMatch(/additional_image_link/);
  });

  it('carries every required field, free GB shipping, and the christmas label on the festive range', () => {
    for (const i of items) {
      const id = field(i, 'id')!;
      for (const f of ['title', 'description', 'link', 'image_link', 'availability', 'price', 'condition', 'brand', 'identifier_exists', 'google_product_category', 'product_type']) {
        expect(field(i, f), `${id}: ${f}`).toBeTruthy();
      }
      expect(field(i, 'condition')).toBe('new');
      expect(field(i, 'brand')).toBe('Snickerdoodle');
      expect(field(i, 'identifier_exists')).toBe('no');
      expect(field(i, 'availability')).toBe('in_stock');
      expect(field(i, 'link')!.startsWith(`${ORIGIN}/products/`)).toBe(true);
      expect(field(i, 'title')!.length).toBeLessThanOrEqual(150);
      expect(i).toMatch(/<g:shipping><g:country>GB<\/g:country>.*<g:price>0\.00 GBP<\/g:price>/);
    }
    const item = merchantFeedItems(ORIGIN);
    for (const it of item) {
      const raw = items.find((i) => field(i, 'id') === it.id)!;
      expect(field(raw, 'custom_label_0') === 'christmas', it.id).toBe(it.listing.christmas);
    }
    expect(item.some((it) => it.listing.key === 'ceramicOrnament' && it.listing.christmas)).toBe(true);
  });

  it('grouped items say what sets them apart; clothing carries colour, size, age group + gender', () => {
    for (const i of items) {
      if (field(i, 'item_group_id')) expect(field(i, 'size') ?? field(i, 'material'), field(i, 'id')).toBeTruthy();
      if (field(i, 'google_product_category') === '209' || field(i, 'google_product_category') === '212') {
        for (const f of ['color', 'size', 'age_group', 'gender']) expect(field(i, f), `${field(i, 'id')}: ${f}`).toBeTruthy();
      }
    }
    expect(items.filter((i) => field(i, 'item_group_id') === 'phoneCase').map((i) => field(i, 'material'))).toEqual(['snap', 'tough']);
  });

  it('escapes text, so a stray & or < in our copy can’t break the feed', () => {
    expect(xml).not.toMatch(/&(?!(amp|lt|gt|quot|apos);)/);
  });
});
