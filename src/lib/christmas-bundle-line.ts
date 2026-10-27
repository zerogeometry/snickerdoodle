import type { BasketItem } from '@/lib/store';
import { BUNDLE_KEY, bundleCounts, bundlePricePence, bundleSummary, normalizeBundle, type BundleSpec } from '@/lib/christmas-bundle';

/**
 * The basket line for the CHRISTMAS FAMILY BUNDLE: ONE line, qty 1, carrying its drawings + extras.
 * The price is the one the SERVER confirmed at add-to-basket (checkBundleAction) — the order re-counts,
 * re-checks and re-prices it all again anyway. `previewVariantId` (the ceramic ornament's) is display
 * only, for the basket thumbnail. Client-safe: no I/O.
 */

/** A fresh, unique line id — two different bundles in one basket stay two lines. */
export const newBundleLineId = () => `bundle-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function christmasBundleLine(opts: { id: string; bundle: BundleSpec; pricePence?: number; previewVariantId?: string }): Omit<BasketItem, 'qty'> {
  const b = normalizeBundle(opts.bundle);
  if (!b) throw new Error('a bundle needs a drawing for the table');
  const c = bundleCounts(b);
  return {
    id: opts.id,
    name: 'christmas family bundle',
    product: BUNDLE_KEY,
    sku: BUNDLE_KEY,
    pricePence: opts.pricePence ?? bundlePricePence(c),
    sub: bundleSummary(c),
    bundle: b,
    ...(opts.previewVariantId ? { previewVariantId: opts.previewVariantId } : {}),
  };
}
