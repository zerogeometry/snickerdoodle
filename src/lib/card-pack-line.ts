import type { BasketItem, PackCardLine } from '@/lib/store';
import { CARD_PACK_KEY } from '@/lib/card-packs';

/**
 * The basket line for a greetings-card PACK (D22): ONE line, qty 1, carrying its N cards in pack
 * order (a drawing may repeat). The price here is only the catalogue figure to show while the
 * server quote lands — the server re-prices the pack and checks the exact card count at order time.
 * Client-safe: no I/O.
 */

/** A fresh, unique line id — two packs in one basket stay two lines (never one pack × 2). */
export const newPackLineId = () => `pack-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function cardPackLine(opts: {
  id: string;
  variant: { id: string; sku: string; pricePence: number };
  packSize: number;
  cards: PackCardLine[];
  /** The single card's variant — display only, for the basket thumbnail. */
  previewVariantId?: string;
}): Omit<BasketItem, 'qty'> {
  const { id, variant, packSize, cards, previewVariantId } = opts;
  if (cards.length !== packSize) throw new Error(`a pack of ${packSize} needs ${packSize} cards`);
  return {
    id,
    name: 'card pack',
    product: CARD_PACK_KEY,
    sku: variant.sku,
    variantId: variant.id,
    pricePence: variant.pricePence,
    sub: `${packSize} cards · blank inside`,
    ...(previewVariantId ? { previewVariantId } : {}),
    cards: cards.map((c) => ({ assetId: c.assetId, transform: c.transform, ...(c.sourceObjectId ? { sourceObjectId: c.sourceObjectId } : {}) })),
  };
}
