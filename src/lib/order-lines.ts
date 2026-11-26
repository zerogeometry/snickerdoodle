import { CATALOGUE, isCatalogueKey, productOfKey } from '@/pricing';
import { bundleSizeOf } from '@/lib/christmas-bundle';
import { isCardPackKey, packSizeOf } from '@/lib/card-packs';
import { itemName } from '@/lib/product-names';

/**
 * How an order reads to the family who paid for it — the confirmation email and the orders page
 * share this, so they always agree. Client-safe: no I/O.
 *
 *  - A CHRISTMAS BUNDLE is stored as one order line per Prodigi item (its packs + an ornament per
 *    drawing) so it can be made; it reads as the ONE bundle that was bought, at its price.
 *  - A CARD PACK is stored as one order line per card design (so Prodigi prints N cards); it reads as the
 *    pack(s) that were bought — "pack of 10 × 2" — never ten one-card lines (founder, 26 Nov 2026).
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
  /** The line's variant (for its picture). */
  variantId?: string | null;
  /** The drawing on it, as placed (the orders page's thumbnail) — absent in the email. */
  art?: LineArt | null;
}

/** A line's drawing as it was placed on the product — what its thumbnail draws. */
export interface LineArt {
  assetId: string;
  transform?: { scale?: number; offsetX?: number; offsetY?: number; rotationDeg?: number } | null;
  sourceObjectId?: string | null;
  ground?: string | null;
}

export interface ReceiptLine {
  /** The product key the line shows art for (a bundle: its own key). */
  productKey: string;
  label: string;
  qty: number;
  linePence: number;
  /** Its variant, for the picture (a card pack: the pack's variant). */
  variantId?: string | null;
  /** The drawing for its thumbnail (a pack: its first card's). */
  art?: LineArt | null;
  /** A card pack: how many cards in one pack (the thumbnail's "×10"). */
  packSize?: number;
}

const productLabel = (key: string): string => {
  const product = productOfKey(key);
  return isCatalogueKey(product) ? itemName(product, CATALOGUE[product].label) : 'keepsake';
};

/** What sets this variant apart, from its frozen attributes ("pack of 4", "11oz, blue"). */
const variantDetail = (attributes: Record<string, string> | null | undefined): string =>
  ['size', 'colour'].map((a) => attributes?.[a]).filter((v): v is string => !!v && v.length <= 40).join(', ');

export function receiptLines(lines: readonly StoredOrderLine[]): ReceiptLine[] {
  const out: ReceiptLine[] = [];
  const bundles = new Map<string, ReceiptLine>();
  // a card pack's card lines sit together (as placed); gather the run into its pack(s)
  let pack: { line: ReceiptLine; key: string; cards: number; size: number | null } | null = null;
  const closePack = () => {
    if (!pack) return;
    const { line, cards, size } = pack;
    line.qty = size && cards % size === 0 ? cards / size : 1; // how many packs (whole packs only; else "1" of a pack)
    pack = null;
  };
  for (const l of lines) {
    if (!l.bundleKey && isCardPackKey(l.productKey)) {
      if (pack && pack.key === l.productKey) {
        pack.cards += l.qty;
        pack.line.linePence += l.linePence;
        continue;
      }
      closePack();
      const size = packSizeOf(l.spec?.attributes?.size);
      const line: ReceiptLine = {
        productKey: productOfKey(l.productKey),
        label: size ? `${productLabel(l.productKey)} · pack of ${size}` : productLabel(l.productKey),
        qty: 1,
        linePence: l.linePence,
        ...(l.variantId ? { variantId: l.variantId } : {}),
        ...(l.art ? { art: l.art } : {}),
        ...(size ? { packSize: size } : {}),
      };
      pack = { line, key: l.productKey, cards: l.qty, size };
      out.push(line);
      continue;
    }
    closePack();
    if (l.bundleKey) {
      const seen = bundles.get(l.bundleKey);
      if (seen) {
        seen.linePence += l.linePence;
        continue;
      }
      const n = bundleSizeOf(l.bundleKey);
      const line: ReceiptLine = { productKey: productOfKey(l.bundleKey), label: `${productLabel(l.bundleKey)}${n ? ` · a set for ${n}` : ''}`, qty: 1, linePence: l.linePence };
      bundles.set(l.bundleKey, line);
      out.push(line);
      continue;
    }
    const detail = variantDetail(l.spec?.attributes);
    out.push({
      productKey: productOfKey(l.productKey),
      label: detail ? `${productLabel(l.productKey)} · ${detail}` : productLabel(l.productKey),
      qty: l.qty,
      linePence: l.linePence,
      ...(l.variantId ? { variantId: l.variantId } : {}),
      ...(l.art ? { art: l.art } : {}),
    });
  }
  closePack();
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
