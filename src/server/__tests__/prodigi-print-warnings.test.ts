import { describe, expect, it } from 'vitest';
import { definedPriceList, definedProducts } from '@/server/catalogue';
import notes from './fixtures/prodigi-product-notes.json';

// THE MUG LESSON (28 Nov 2026). We sold Prodigi's two-tone mug H-MUG-11OZ-W* as a rim-to-base wrap. Its
// print-area SIZE (2480×1122 px) looked like a full wrap, so print-spec.test.ts passed — but Prodigi's own
// description of the SKU said "11oz Two Toned Ceramic Mug, White Blue [NOT top-to-bottom printing]", and the
// sample came back with white bands top and bottom and a bare gap at the handle. The words are where Prodigi
// admits a product prints less than it looks, so this guard reads them for every SKU we sell.
//
// The fixture is Prodigi's own data (GET /v4.0/products/{sku}: description + product size only); refresh it
// with scripts/fetch-prodigi-product-notes.ts whenever a product is added. CI never calls Prodigi.
type Notes = { products: Record<string, { description: string } | null> };
const prodigi = (notes as Notes).products;

/** Words Prodigi uses when a product prints LESS than the product (or the picture) suggests. */
const WARNINGS: RegExp[] = [
  /not\s+top[\s-]*to[\s-]*bottom/i,
  /\[\s*not\b/i, // any "[NOT …]" caveat in a product name
  /\bpartial(ly)?\b/i,
  /\bnot\s+(a\s+)?full[\s-]*(wrap|bleed|print|colour|color)/i,
  /\bnot\s+edge[\s-]*to[\s-]*edge/i,
  /\bno\s+bleed\b/i,
  /\bsmaller\s+(than|print)\b/i,
  /\bprint\s+area\s+(is\s+)?(smaller|reduced|limited)/i,
  /\b(front|one\s+side)\s+only\b/i,
  /\bwrap\s*around\s+not\b/i,
];
const warningIn = (description: string): string | null => WARNINGS.find((w) => w.test(description))?.source ?? null;

/**
 * SKUs on sale WITH a warning, each with why it's still there. It must stay short — and comes off the list
 * once the SKU is no longer sold (the last test fails until it does).
 */
const KNOWN: Record<string, string> = {
  // (empty: the two-tone mugs H-MUG-11OZ-W* came off sale with PR #111, 28 Nov 2026)
};

const variants = definedPriceList().filter((v) => v.prodigiSku);
const onSale = variants.filter((v) => v.visibleInShop && !v.paused);
const skusOf = (vs: typeof variants) => [...new Set(vs.map((v) => v.prodigiSku!))].sort();

describe('Prodigi’s own words for every SKU we sell (the mug lesson)', () => {
  it('the fixture covers every Prodigi SKU in the catalogue (re-run scripts/fetch-prodigi-product-notes.ts if not)', () => {
    expect(skusOf(variants).filter((sku) => !prodigi[sku])).toEqual([]);
  });

  it('the guard recognises the warning that caught us out — and leaves ordinary descriptions alone', () => {
    expect(warningIn('11oz Two Toned Ceramic Mug, White Blue [NOT top-to-bottom printing]')).not.toBeNull();
    expect(warningIn('11oz White Ceramic Mug with blue handle, blue inner mug')).toBeNull();
    expect(warningIn('Faux Linen Cushion, Double Sided, White, Fibre Fill, 22x22" / 55x55cm')).toBeNull();
    expect(warningIn('Classic Frame, EMA 200gsm Fine Art Print, No Mount / No Mat, Perspex Glaze, 28x35cm/11x14"')).toBeNull();
  });

  it('no product on sale is one Prodigi describes as printing less than it looks', () => {
    const warned = skusOf(onSale).flatMap((sku) => {
      const d = prodigi[sku]?.description ?? '';
      return warningIn(d) && !KNOWN[sku] ? [`${sku}: “${d}”`] : [];
    });
    expect(warned, 'a SKU on sale carries a Prodigi warning — check what really prints (template, sample) before selling it').toEqual([]);
  });

  it('a double-sided variant is a SKU Prodigi calls double-sided, and a single-sided SKU is never sold as double', () => {
    const wrong = variants.flatMap((v) => {
      const d = prodigi[v.prodigiSku!]?.description ?? '';
      if (v.attributes.sides === 'double' && !/double[\s-]*sided/i.test(d)) return [`${v.sku} is sold double-sided but ${v.prodigiSku} is “${d}”`];
      if (v.attributes.sides !== 'double' && /double[\s-]*sided/i.test(d)) return [`${v.sku} is sold single-sided but ${v.prodigiSku} is “${d}”`];
      return [];
    });
    expect(wrong).toEqual([]);
  });

  it('our own words never promise “both sides” or “all the way round” for a SKU Prodigi calls single-sided', () => {
    const single = new Set(skusOf(variants).filter((sku) => /single[\s-]*sided/i.test(prodigi[sku]?.description ?? '')));
    const wrong = definedProducts().flatMap((p) => {
      const ours = variants.filter((v) => v.productKey === p.key);
      const sellsDouble = ours.some((v) => v.attributes.sides === 'double');
      const onlySingle = ours.length > 0 && ours.every((v) => single.has(v.prodigiSku!));
      return (onlySingle || !sellsDouble) && ours.some((v) => single.has(v.prodigiSku!)) && /both sides|all the way round|double[\s-]*sided/i.test(`${p.blurb} ${p.description}`)
        ? [`${p.key}: “${p.description}”`]
        : [];
    });
    expect(wrong).toEqual([]);
  });

  it('a known warning stays on the list only while that SKU is still sold', () => {
    const sold = new Set(skusOf(onSale));
    for (const sku of Object.keys(KNOWN)) {
      expect(sold.has(sku), `${sku} is no longer on sale — take it off KNOWN`).toBe(true);
      expect(warningIn(prodigi[sku]?.description ?? ''), `${sku} no longer carries a warning — take it off KNOWN`).not.toBeNull();
    }
  });
});
