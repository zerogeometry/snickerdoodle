import type { BasketItem } from '@/lib/store';
import { BUNDLE_KEY, BUNDLE_SIZES, bundleSkuFor, bundleSummary, normalizeBundle, type BundleSize, type BundleSpec } from '@/lib/christmas-bundle';

/**
 * The basket line for the CHRISTMAS FAMILY BUNDLE: ONE line, qty 1, its size in its variant sku and
 * its drawings alongside. The price is the one the SERVER confirmed at add-to-basket (checkBundleAction)
 * — the order re-checks + re-prices it all again anyway. `previewVariantId` (the ceramic ornament's)
 * is display only, for the basket thumbnail. Client-safe: no I/O.
 */

/** A fresh, unique line id — two different bundles in one basket stay two lines. */
export const newBundleLineId = () => `bundle-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function christmasBundleLine(opts: { id: string; size: BundleSize; bundle: BundleSpec; pricePence?: number; previewVariantId?: string }): Omit<BasketItem, 'qty'> {
  const b = normalizeBundle(opts.bundle, opts.size);
  if (!b) throw new Error('a bundle needs a drawing for the placemats');
  return {
    id: opts.id,
    name: `christmas family bundle · a set for ${opts.size}`,
    product: BUNDLE_KEY,
    sku: bundleSkuFor(opts.size),
    pricePence: opts.pricePence ?? BUNDLE_SIZES.find((s) => s.n === opts.size)!.pricePence,
    sub: bundleSummary(opts.size),
    bundle: b,
    ...(opts.previewVariantId ? { previewVariantId: opts.previewVariantId } : {}),
  };
}
