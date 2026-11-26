'use client';

import type { ReceiptLine } from '@/lib/order-lines';
import type { PlacementTransform } from '@/lib/store';
import { MockupPreview } from './MockupPreview';
import { ProductArt, type ProductKey } from './ProductArt';

/**
 * One order line's picture on the orders page (founder, 26 Nov 2026): the ACTUAL creation — its drawing, on its
 * variant, as placed — like the basket's. A card pack is drawn as one of its cards, with the pack size on it.
 * The picture comes through MockupPreview's usual authz-gated route; with no drawing (an add-on, a deleted
 * drawing, the bundle) it falls back to the product's motif.
 */
export function OrderLineThumb({ line, cardPreviewVariantId, px }: { line: ReceiptLine; cardPreviewVariantId: string | null; px: number }) {
  const pack = !!line.packSize;
  const productKey = (pack ? 'card' : line.productKey) as ProductKey;
  const variantId = pack ? cardPreviewVariantId : line.variantId;
  return (
    <div className="relative h-full w-full" aria-hidden>
      {line.art && variantId ? (
        <MockupPreview
          productKey={productKey}
          assetId={line.art.assetId}
          variantId={variantId}
          transform={line.art.transform ? ({ scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, ...line.art.transform } as PlacementTransform) : null}
          sourceObjectId={line.art.sourceObjectId ?? null}
          ground={line.art.ground ?? null}
          size="thumb"
          px={px}
          lazy
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <ProductArt product={line.productKey} size={Math.round(px * 0.75)} />
        </div>
      )}
      {pack ? (
        <span className="absolute bottom-0.5 right-0.5 rounded-full border-2 border-cocoa bg-honey px-1.5 text-[10px] font-extrabold leading-4 text-cocoa">×{line.packSize}</span>
      ) : null}
    </div>
  );
}
