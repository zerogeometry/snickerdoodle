import { describe, expect, it } from 'vitest';
import { definedPrintSpecs } from '@/server/catalogue';
import type { ProdigiProduct } from '@/server/prodigi/client';
import { printSpecWarning } from '@/server/prodigi/sync';
import fixture from '@/server/__tests__/fixtures/prodigi-print-areas.json';

type Fixture = { products: Record<string, { printAreas: string[]; variants: Array<{ attributes: Record<string, string>; printAreaSizes: Record<string, { w: number; h: number }> }> } | null> };

/** A fixture SKU as the live API returns it (what the sync sees). */
function apiProduct(sku: string): ProdigiProduct {
  const p = (fixture as Fixture).products[sku]!;
  return {
    sku, description: sku, attributes: {}, printAreas: Object.fromEntries(p.printAreas.map((a) => [a, {}])),
    variants: p.variants.map((v) => ({
      attributes: v.attributes,
      shipsTo: ['GB'],
      printAreaSizes: Object.fromEntries(Object.entries(v.printAreaSizes).map(([k, s]) => [k, { horizontalResolution: s.w, verticalResolution: s.h }])),
    })),
  };
}
const rowOf = (key: string, match: (a: Record<string, string>) => boolean) => {
  const s = definedPrintSpecs().find((x) => x.productKey === key && match(x.attributes))!;
  return { row: { productKey: s.productKey, attributes: s.attributes, prodigiAttrs: s.prodigiAttrs ?? undefined, printTo: s.printTo, template: s.template }, sku: s.prodigiSku };
};

describe('catalogue sync — the print file vs Prodigi’s print area', () => {
  it('is quiet when the file is exactly Prodigi’s (heart cushion, landscape-native blanket, big frame)', () => {
    for (const { row, sku } of [
      rowOf('cushion', (a) => a.size === 'heart'),
      rowOf('blanket', (a) => a.size === 'large' && a.orientation === 'portrait'),
      rowOf('framedPrint', (a) => a.size === '24×32″' && a.colour === 'black' && a.orientation === 'landscape'),
    ]) {
      expect(printSpecWarning(row, apiProduct(sku)), sku).toBeNull();
    }
  });

  it('warns when the shape differs — the old 280mm-square heart would be cropped', () => {
    const { row, sku } = rowOf('cushion', (a) => a.size === 'heart');
    const old = { ...row, template: { printWidthPx: 1654, printHeightPx: 1654, bleedMm: 3, requiredDpi: 150 } };
    expect(printSpecWarning(old, apiProduct(sku))).toMatch(/different shape.*crop/);
  });

  it('warns when the size differs at the same shape — the old 150dpi big frame would be rescaled', () => {
    const { row, sku } = rowOf('framedPrint', (a) => a.size === '18×24″' && a.orientation === 'portrait');
    const old = { ...row, template: { printWidthPx: 2700, printHeightPx: 3600, bleedMm: 0, requiredDpi: 150 } };
    expect(printSpecWarning(old, apiProduct(sku))).toMatch(/isn't Prodigi's "default" 5400×7200/);
  });

  it('flags the hidden adult hoodie, whose GB print area changes with colour and size', () => {
    const warned = definedPrintSpecs()
      .filter((s) => s.productKey === 'adultHoodie')
      .filter((s) => printSpecWarning({ productKey: s.productKey, attributes: s.attributes, prodigiAttrs: s.prodigiAttrs ?? undefined, printTo: s.printTo, template: s.template }, apiProduct(s.prodigiSku)));
    expect(warned.length).toBeGreaterThan(0);
  });

  it('says nothing when Prodigi gives no print-area sizes (it can’t tell)', () => {
    const { row, sku } = rowOf('cushion', (a) => a.size === 'heart');
    const bare = { ...apiProduct(sku), variants: [{ attributes: {}, shipsTo: ['GB'] }] };
    expect(printSpecWarning(row, bare)).toBeNull();
  });
});
