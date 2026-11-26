'use client';

import { IconZoomScan } from '@tabler/icons-react';
import { useState } from 'react';
import type { ReceiptLine } from '@/lib/order-lines';
import type { PlacementTransform } from '@/lib/store';
import { Icon } from '../primitives/Icon';
import { Modal } from '../primitives/Modal';
import { MockupPreview } from './MockupPreview';
import { ProductArt, type ProductKey } from './ProductArt';

/**
 * One order line's picture on the orders page (founder, 26 Nov 2026): the ACTUAL creation — its drawing, on its
 * variant, as placed — like the basket's. A card pack is drawn as one of its cards, with the pack size on it.
 * The picture comes through MockupPreview's usual authz-gated route; with no drawing (an add-on, a deleted
 * drawing, the bundle) it falls back to the product's motif.
 *
 * With `zoom`, tapping it opens a big close-up of the same creation (founder, 26 Nov 2026), the way the
 * catalogue's tiles do.
 */
export function OrderLineThumb({
  line,
  cardPreviewVariantId,
  px,
  zoom,
}: {
  line: ReceiptLine;
  cardPreviewVariantId: string | null;
  px: number;
  zoom?: { title: string; subtitle?: string };
}) {
  const [open, setOpen] = useState(false);
  const pack = !!line.packSize;
  const productKey = (pack ? 'card' : line.productKey) as ProductKey;
  const variantId = pack ? cardPreviewVariantId : line.variantId;
  const art = line.art && variantId ? line.art : null;
  const transform = art?.transform ? ({ scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, ...art.transform } as PlacementTransform) : null;
  const picture = (size: 'thumb' | 'zoom', at: number) =>
    art && variantId ? (
      <MockupPreview
        productKey={productKey}
        assetId={art.assetId}
        variantId={variantId}
        transform={transform}
        sourceObjectId={art.sourceObjectId ?? null}
        ground={art.ground ?? null}
        size={size}
        px={at}
        lazy={size === 'thumb'}
      />
    ) : (
      <div className="flex h-full w-full items-center justify-center">
        <ProductArt product={line.productKey} size={Math.round(at * 0.75)} />
      </div>
    );
  const badge = pack ? (
    <span className="pointer-events-none absolute bottom-0.5 right-0.5 rounded-full border-2 border-cocoa bg-honey px-1.5 text-[10px] font-extrabold leading-4 text-cocoa">×{line.packSize}</span>
  ) : null;

  if (!zoom || !art) {
    return (
      <div className="relative h-full w-full" aria-hidden>
        {picture('thumb', px)}
        {badge}
      </div>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`see a bigger picture of ${zoom.title}`}
        className="group/zoom relative block h-full w-full cursor-zoom-in"
      >
        {picture('thumb', px)}
        {badge}
        <span aria-hidden className="pointer-events-none absolute left-0.5 top-0.5 flex items-center justify-center rounded-full border-2 border-cocoa bg-paper p-0.5 text-cocoa group-hover/zoom:text-cinnamon">
          <Icon icon={IconZoomScan} size={12} />
        </span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} size="xl" fill title={zoom.title} subtitle={zoom.subtitle}>
        <div className="flex h-full items-center justify-center overflow-hidden rounded-2xl bg-paper-2 p-3">{open ? picture('zoom', 720) : null}</div>
      </Modal>
    </>
  );
}
