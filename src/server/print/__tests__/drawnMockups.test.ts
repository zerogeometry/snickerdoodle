import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { definedPriceList } from '@/server/catalogue';
import { DRAWN_PRODUCT_KEYS, drawProductMockup } from '../drawnMockups';


describe('drawn mockups — the print area IS the print file’s shape (preview == print)', () => {
  // a drawn key is a product key, except the plastic ball — the christmas bauble (D24)
  type DrawnKey = (typeof DRAWN_PRODUCT_KEYS)[number];
  const drawnOf = (v: { productKey: string; attributes: Record<string, string> }): DrawnKey | null =>
    v.productKey === 'christmasBauble' ? 'plasticBauble' : (DRAWN_PRODUCT_KEYS as readonly string[]).includes(v.productKey) ? (v.productKey as DrawnKey) : null;
  const variants = definedPriceList()
    .map((v) => ({ ...v, drawn: drawnOf(v) }))
    .filter((v): v is typeof v & { drawn: DrawnKey } => v.drawn !== null);

  it('covers every variant of every drawn product', () => {
    expect(new Set(variants.map((v) => v.drawn))).toEqual(new Set(DRAWN_PRODUCT_KEYS));
  });

  for (const v of variants) {
    it(`${v.sku}: quad aspect within 0.5% of ${v.px!.w}×${v.px!.h}, inside the photo`, () => {
      const d = drawProductMockup(v.drawn, v.attributes, v.px!);
      const qa = ((d.quad[1]![0] - d.quad[0]![0]) * d.W) / ((d.quad[3]![1] - d.quad[0]![1]) * d.H);
      expect(Math.abs(qa / (v.px!.w / v.px!.h) - 1)).toBeLessThan(0.005);
      for (const [x, y] of d.quad) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(1);
      }
    });
  }

  it('blank, mask and overlay share one canvas (they register by construction)', async () => {
    for (const key of DRAWN_PRODUCT_KEYS) {
      const v = variants.find((x) => x.drawn === key)!;
      const d = drawProductMockup(key, { colour: 'black' }, v.px!);
      for (const buf of [d.blank, d.mask, d.overlay].filter(Boolean) as Buffer[]) {
        const m = await sharp(buf).metadata();
        expect([m.width, m.height], key).toEqual([d.W, d.H]);
      }
    }
  });
});

describe('shop art', () => {
  it('every product in the catalogue has its own motif (no blank tiles), incl. the new range', async () => {
    // (the .tsx compiles with the classic JSX runtime under vitest — give it React)
    (globalThis as { React?: unknown }).React = await import('react');
    const { hasProductArt } = await import('@/ui/components/ProductArt');
    const keys = [...new Set(definedPriceList().map((v) => v.productKey))];
    expect(keys.filter((k) => !hasProductArt(k))).toEqual([]);
  });
});
