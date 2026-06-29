'use client';

import { useEffect, useState } from 'react';
import { ProductMockup, type ProductKey } from './ProductArt';
import { composeMockupAction } from '@/app/actions/mockup';
import type { PlacementTransform } from '@/lib/store';

/**
 * A product preview that upgrades to the real, in-VPC photoreal mockup when one is
 * available, and otherwise shows the stylised SVG ProductMockup. The SVG renders
 * IMMEDIATELY (the skeleton + the permanent fallback for any variant without a template
 * yet), then swaps to the signed WebP once the compositor returns one — so the catalogue
 * is complete from day one and upgrades SKU-by-SKU as blanks are authored, with no broken
 * or blank states. Uses a plain <img> with the signed URL (never next/image, which would
 * try to re-fetch an expired signed URL).
 */
export function MockupPreview({
  productKey,
  assetId,
  variantId,
  transform,
  size,
  sourceObjectId,
  image,
  placement,
  px = 96,
  uid,
}: {
  productKey: ProductKey;
  assetId?: string | null;
  variantId?: string | null;
  transform?: PlacementTransform | null;
  size?: 'thumb' | 'zoom';
  sourceObjectId?: string | null;
  /** Fallback SVG inputs (shown until/unless the real mockup lands). */
  image?: string | null;
  placement?: PlacementTransform | null;
  px?: number;
  uid?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const tfKey = JSON.stringify(transform ?? null);

  useEffect(() => {
    let live = true;
    setUrl(null);
    if (!assetId || !variantId) return;
    composeMockupAction({
      assetId,
      variantId,
      transform: transform ?? { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 },
      size,
      sourceObjectId: sourceObjectId ?? undefined,
    })
      .then((r) => {
        if (live && r.ok) setUrl(r.url);
      })
      .catch(() => {
        /* keep the SVG fallback — never a broken image */
      });
    return () => {
      live = false;
    };
  }, [assetId, variantId, tfKey, size, sourceObjectId]);

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={`your drawing on a ${productKey}`}
        width={px}
        height={px}
        className="h-auto w-full rounded-lg object-contain"
        onError={() => setUrl(null)} // a failed/expired signed URL reverts to the SVG — never a broken image
      />
    );
  }
  return <ProductMockup product={productKey} image={image} placement={placement ?? undefined} size={px} uid={uid} />;
}
