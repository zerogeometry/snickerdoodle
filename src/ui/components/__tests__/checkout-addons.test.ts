import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { BasketItem } from '@/lib/store';
import type { AddOn } from '@/server/addOns';

// Capture what each add-on's picture is made from (the real MockupPreview composes through the
// authz-gated /api/mockup route — here we only check WHICH drawing it's asked to use).
const shown: Array<Record<string, unknown>> = [];
vi.mock('@/ui/components/MockupPreview', () => ({
  MockupPreview: (p: Record<string, unknown>) => {
    shown.push(p);
    return null;
  },
}));

const { CheckoutAddOns, addOnLine } = await import('@/ui/components/CheckoutAddOns');
const { qtyOptions } = await import('@/ui/components/MultiBuy');

const SACK: AddOn = { productKey: 'sack', label: 'christmas sack', sku: 'sack', variantId: 'v-sack', attributes: { size: 'one size' }, pricePence: 3500, savingPence: 300 };
const CARD: AddOn = { productKey: 'card', label: 'greetings card', sku: 'card', variantId: 'v-card', attributes: {}, pricePence: 550, savingPence: 0 };
const BUNDLE_LINE = { id: 'b', name: 'christmas family bundle', product: 'christmasBundle', sku: 'christmasBundle-for4', pricePence: 14500, qty: 1, bundle: { placemat: { assetId: 'table-drawing', sourceObjectId: 'cutout' }, coaster: null, ornaments: [{ assetId: 'orn-1' }] } } as unknown as BasketItem;

describe('checkout add-ons', () => {
  it('each picture is THAT product made with the shopper’s own drawing — never a stock image', () => {
    shown.length = 0;
    renderToStaticMarkup(createElement(CheckoutAddOns, { addOns: [SACK, CARD], items: [BUNDLE_LINE], gift: false }));
    expect(shown.map((p) => [p.productKey, p.variantId, p.assetId, p.sourceObjectId])).toEqual([
      ['sack', 'v-sack', 'table-drawing', 'cutout'],
      ['card', 'v-card', 'table-drawing', 'cutout'],
    ]);
  });

  it('“+” adds exactly that product with that drawing, at the placement its picture shows', () => {
    const line = addOnLine(SACK, { assetId: 'table-drawing', sourceObjectId: 'cutout' });
    expect(line).toMatchObject({ product: 'sack', sku: 'sack', variantId: 'v-sack', pricePence: 3500, artwork: { assetId: 'table-drawing', sourceObjectId: 'cutout' } });
    shown.length = 0;
    renderToStaticMarkup(createElement(CheckoutAddOns, { addOns: [SACK], items: [BUNDLE_LINE], gift: false }));
    expect(shown[0]!.transform).toEqual(line.artwork!.transform);
  });

  it('the “+” is a real labelled 44px button, ALWAYS visible (no hover reveal at all)', () => {
    const html = renderToStaticMarkup(createElement(CheckoutAddOns, { addOns: [SACK], items: [BUNDLE_LINE], gift: false }));
    expect(html).toContain('aria-label="add a christmas sack with your drawing"');
    expect(html).toMatch(/<button type="button"/);
    expect(html).toContain('h-11 w-11'); // 44px
    const plus = html.match(/<button[^>]*data-addon-plus[^>]*>/)?.[0] ?? html.match(/<button[^>]*aria-label="add a christmas sack[^>]*>/)![0];
    expect(plus).not.toMatch(/opacity-0|group-hover|hover:none/);
  });

  it('only a REAL saving is claimed — a card from another lab says nothing about savings', () => {
    const html = renderToStaticMarkup(createElement(CheckoutAddOns, { addOns: [SACK, CARD], items: [BUNDLE_LINE], gift: false }));
    expect(html.match(/off — it comes in the same parcel/g)).toHaveLength(1);
    expect(html).toContain('£3 off — it comes in the same parcel');
  });

  it('nothing without a drawing in the basket', () => {
    expect(renderToStaticMarkup(createElement(CheckoutAddOns, { addOns: [SACK], items: [], gift: false }))).toBe('');
  });
});

describe('the multi-buy quantity dropdown', () => {
  it('its options come from the server’s tiers: the quantity, and the discount it earns', () => {
    const o = qtyOptions([1500, 1500, 1500, 1500]);
    expect(o.slice(0, 5).map((x) => [x.label, x.note ?? null])).toEqual([['1', null], ['2', '15% off'], ['3', '15% off'], ['4', '15% off'], ['5', '15% off']]);
    expect(qtyOptions([1000, 1500, 1500, 1500]).map((x) => x.note ?? null).slice(0, 3)).toEqual([null, '10% off', '15% off']);
    // no "full price" anywhere (founder, 29 Oct)
    expect(JSON.stringify(qtyOptions([1500, 1500, 1500, 1500]))).not.toContain('full price');
  });
  it('counts the same product already on other lines', () => {
    expect(qtyOptions([1000, 1500, 1500, 1500], 1)[0]!.note).toBe('10% off'); // 1 here + 1 elsewhere = 2
  });
  it('no offer → plain numbers, no notes', () => {
    expect(qtyOptions([0, 0, 0, 0]).every((x) => !x.note)).toBe(true);
    expect(qtyOptions(null)[0]).toEqual({ value: 1, label: '1' });
  });
});
