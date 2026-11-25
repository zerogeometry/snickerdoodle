import { describe, expect, it } from 'vitest';
import { definedPrintSpecs } from '@/server/catalogue';
import { plan } from '@/server/print/seedMockups';

// founder, 25 Nov: the heart cushion said no size. Every cushion now names its size in inches, the
// way the squares always have ("12″ square") — the heart's from Prodigi's own spec for its SKU
// (GET /v4.0/products/GLOBAL-CUSH-SH-SCSSS: "11\" Small Heart …", productDimensions 11×11 in).
const cushions = definedPrintSpecs().filter((s) => s.productKey === 'cushion');

describe('cushion sizes', () => {
  it('every cushion names its size in inches, worded like the squares', () => {
    expect(cushions.length).toBeGreaterThan(0);
    for (const c of cushions) expect(c.attributes.size, c.sku).toMatch(/^\d+″ (heart|round|square)$/);
  });

  it('the heart is 11″ (Prodigi’s spec) and keeps its sku, so baskets and orders still point at it', () => {
    const heart = cushions.find((c) => c.prodigiSku === 'GLOBAL-CUSH-SH-SCSSS')!;
    expect(heart.attributes.size).toBe('11″ heart');
    expect(heart.sku).toBe('cushion');
  });

  it('each cushion still gets its own shape of mockup with the size in its name', () => {
    const shapeOf = (size: string) => {
      const p = JSON.stringify(plan('cushion', { size }));
      return /heart/i.test(p) ? 'heart' : /round/i.test(p) ? 'round' : 'square';
    };
    expect(shapeOf('11″ heart')).toBe('heart');
    expect(shapeOf('18″ round')).toBe('round');
    expect(shapeOf('12″ square')).toBe('square');
    expect(shapeOf('22″ square')).toBe('square');
  });
});
