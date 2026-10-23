import type { BasketItem, PackCardLine } from '@/lib/store';
import { CARD_PACK_KEY } from '@/lib/card-packs';
import { colourName, groundTag, normalizeGround } from '@/lib/patterns';

/**
 * The basket line for a greetings-card PACK (D22): ONE line, qty 1, carrying its N cards in pack
 * order (a drawing may repeat). The price here is only the catalogue figure to show while the
 * server quote lands — the server re-prices the pack and checks the exact card count at order time.
 * Client-safe: no I/O.
 */

/** A fresh, unique line id — two packs in one basket stay two lines (never one pack × 2). */
export const newPackLineId = () => `pack-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** A pack line id without its colour part (`pack-abc~c8402a` → `pack-abc`). */
export const packLineBase = (id: string) => id.replace(/~[0-9a-f]{6}$/, '');

/**
 * A pack line's id: its own unique base + the pack's BASE COLOUR (like a red and a navy pair of
 * socks, see lineIdFor) — so the colour is part of the line's identity. White adds nothing.
 */
export const packLineId = (id: string, ground?: string | null) => {
  const tag = groundTag(ground);
  return tag ? `${packLineBase(id)}~${tag.slice(2)}` : packLineBase(id);
};

export function cardPackLine(opts: {
  id: string;
  variant: { id: string; sku: string; pricePence: number };
  packSize: number;
  cards: PackCardLine[];
  /** The single card's variant — display only, for the basket thumbnail. */
  previewVariantId?: string;
  /** The pack's BASE COLOUR (one for every card's outside front). White / junk = none. The server
   * re-normalises it at order time. */
  ground?: string | null;
}): Omit<BasketItem, 'qty'> {
  const { id, variant, packSize, cards, previewVariantId } = opts;
  if (cards.length !== packSize) throw new Error(`a pack of ${packSize} needs ${packSize} cards`);
  const ground = normalizeGround(opts.ground);
  return {
    id: packLineId(id, ground),
    name: 'card pack',
    product: CARD_PACK_KEY,
    sku: variant.sku,
    variantId: variant.id,
    pricePence: variant.pricePence,
    sub: [`${packSize} cards`, ground ? `on ${colourName(ground)}` : null, 'blank inside'].filter(Boolean).join(' · '),
    ground: ground ?? undefined, // always present, so an edit back to white clears it
    ...(previewVariantId ? { previewVariantId } : {}),
    cards: cards.map((c) => ({ assetId: c.assetId, transform: c.transform, ...(c.sourceObjectId ? { sourceObjectId: c.sourceObjectId } : {}) })),
  };
}
