import type { BasketItem, PackCardLine } from '@/lib/store';
import { fillFrameSlots, frameSlotCountOf, MULTI_PHOTO_FRAME_KEY } from '@/lib/multi-photo-frame';

/**
 * The basket line for a MULTI PHOTO FRAME: ONE line carrying a drawing per square (9 or 16), the
 * gaps already filled with the main drawing — so what the basket shows is what prints. `artwork`
 * mirrors the first square so every basket/checkout thumbnail shows the real frame. The price is
 * only the catalogue figure to show while the server quote lands; the server re-prices the frame
 * and re-fills + re-checks every square at order time. Client-safe: no I/O.
 */

/** A fresh, unique line id — two different frames in one basket stay two lines. */
export const newFrameLineId = () => `mpf-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function frameGridLine(opts: {
  id: string;
  variant: { id: string; sku: string; pricePence: number; attributes?: Record<string, string> };
  /** The shopper's picks, one per square (row by row); null = not chosen, filled with the main drawing. */
  slots: ReadonlyArray<PackCardLine | null>;
}): Omit<BasketItem, 'qty'> {
  const count = frameSlotCountOf(opts.variant.attributes?.size);
  if (!count) throw new Error('not a multi photo frame size');
  const slots = fillFrameSlots(opts.slots, count).map(({ printArea: _area, ...p }) => ({
    assetId: p.assetId,
    transform: p.transform,
    ...(p.sourceObjectId ? { sourceObjectId: p.sourceObjectId } : {}),
  }));
  const drawings = new Set(slots.map((p) => p.assetId)).size;
  return {
    id: opts.id,
    name: 'multi photo frame',
    product: MULTI_PHOTO_FRAME_KEY,
    sku: opts.variant.sku,
    variantId: opts.variant.id,
    pricePence: opts.variant.pricePence,
    sub: [opts.variant.attributes?.size, opts.variant.attributes?.colour ? `${opts.variant.attributes.colour} frame` : null, drawings === 1 ? 'one favourite drawing' : `${drawings} drawings`]
      .filter(Boolean)
      .join(' · '),
    artwork: slots[0]!,
    slots,
  };
}
