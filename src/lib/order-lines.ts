import { CATALOGUE, isCatalogueKey, productOfKey } from '@/pricing';
import { bundleSizeOf } from '@/lib/christmas-bundle';

/**
 * How an order reads to the family who paid for it — the confirmation email and the orders page
 * share this, so they always agree. Client-safe: no I/O.
 *
 *  - A CHRISTMAS BUNDLE is stored as one order line per Prodigi item (its packs + an ornament per
 *    drawing) so it can be made; it reads as the ONE bundle that was bought, at its price.
 *  - A line is named by its product, plus what sets the variant apart (its size / colour) — never
 *    a raw sku.
 *  - The savings the order got are listed, so the lines and the total add up.
 */

export interface StoredOrderLine {
  productKey: string;
  qty: number;
  linePence: number;
  /** Set on a bundle's pieces: the bundle line's key (its size's sku). */
  bundleKey?: string | null;
  /** The frozen variant spec — only its attributes are read (size / colour). */
  spec?: { attributes?: Record<string, string> | null } | null;
}

export interface ReceiptLine {
  /** The product key the line shows art for (a bundle: its own key). */
  productKey: string;
  label: string;
  qty: number;
  linePence: number;
}

const productLabel = (key: string): string => {
  const product = productOfKey(key);
  return isCatalogueKey(product) ? CATALOGUE[product].label : 'keepsake';
};

/** What sets this variant apart, from its frozen attributes ("pack of 4", "11oz, blue"). */
const variantDetail = (attributes: Record<string, string> | null | undefined): string =>
  ['size', 'colour'].map((a) => attributes?.[a]).filter((v): v is string => !!v && v.length <= 40).join(', ');

export function receiptLines(lines: readonly StoredOrderLine[]): ReceiptLine[] {
  const out: ReceiptLine[] = [];
  const bundles = new Map<string, ReceiptLine>();
  for (const l of lines) {
    if (l.bundleKey) {
      const seen = bundles.get(l.bundleKey);
      if (seen) {
        seen.linePence += l.linePence;
        continue;
      }
      const n = bundleSizeOf(l.bundleKey);
      const line = { productKey: productOfKey(l.bundleKey), label: `${productLabel(l.bundleKey)}${n ? ` · a set for ${n}` : ''}`, qty: 1, linePence: l.linePence };
      bundles.set(l.bundleKey, line);
      out.push(line);
      continue;
    }
    const detail = variantDetail(l.spec?.attributes);
    out.push({ productKey: productOfKey(l.productKey), label: detail ? `${productLabel(l.productKey)} · ${detail}` : productLabel(l.productKey), qty: l.qty, linePence: l.linePence });
  }
  return out;
}

export interface OrderSavings {
  joinSavingPence: number;
  familySetSavingPence: number;
  parcelSavingPence: number;
  multiBuySavingPence: number;
  promoSavingPence: number;
  creditAppliedPence: number;
}

/** The savings on an order, in the order checkout shows them — each as a positive amount taken off. */
export function receiptSavings(o: OrderSavings): { label: string; pence: number }[] {
  return [
    { label: 'family saving (5%)', pence: o.joinSavingPence },
    { label: 'family set saving', pence: o.familySetSavingPence },
    { label: 'same-parcel saving', pence: o.parcelSavingPence },
    { label: 'buy more & save', pence: o.multiBuySavingPence },
    { label: 'your code', pence: o.promoSavingPence },
    { label: 'your credit', pence: o.creditAppliedPence },
  ].filter((s) => s.pence > 0);
}
