/**
 * Greetings-card MULTIPACKS (founder, 2026-10-21): a pack of 5 (£12) or 10 (£21) of the 7×5″ card,
 * each card with its own drawing on the front (or the same one repeated) and the inside left BLANK
 * for the buyer to write in — no printed message on a pack.
 *
 * In the basket a pack is ONE priced line (qty 1) that carries its N cards. At order time the server
 * splits it into one order line per distinct card design (qty = how many times it repeats), each at
 * an equal, exact share of the pack price — so fulfilment sends N cards in one Prodigi order, and the
 * pack still costs exactly its catalogue price. Client-safe: no I/O.
 */

import { normalizeGround } from '@/lib/patterns';

export const CARD_PACK_KEY = 'cardPack';

/** Is this basket-line key a card pack (the product key or one of its variant skus)? */
export const isCardPackKey = (key: string | null | undefined): boolean => !!key && (key === CARD_PACK_KEY || key.startsWith(`${CARD_PACK_KEY}-`));

/** The number of cards in a pack variant, from its size attribute ("pack of 10" → 10). */
export function packSizeOf(size: string | null | undefined): number | null {
  const m = /^pack of (\d+)$/.exec((size ?? '').trim());
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n > 1 ? n : null;
}

/** One card in a pack: which drawing, and how it sits on the front. */
export interface PackCard {
  assetId: string;
  transform: { scale?: number; offsetX?: number; offsetY?: number; rotationDeg?: number };
  sourceObjectId?: string | null;
}

export interface PackOrderLine<C extends PackCard = PackCard> {
  card: C;
  qty: number;
  unitPricePence: number;
  linePence: number;
  /** The PACK's base colour (#rrggbb, server-normalised) — one per pack, so every card line of the
   * pack carries the same one; null = white. */
  ground: string | null;
}

/** Two cards are the same design when they print identically (same image, same placement). */
const designKey = (c: PackCard) =>
  JSON.stringify([c.assetId, c.sourceObjectId ?? null, c.transform.scale ?? null, c.transform.offsetX ?? 0, c.transform.offsetY ?? 0, c.transform.rotationDeg ?? 0]);

/**
 * Split a pack into order lines. Throws unless there are EXACTLY `packSize` cards and the pack price
 * divides evenly between them (an authoring mistake in the catalogue, never a customer's) — so the
 * lines always add up to the pack price to the penny. The pack's BASE COLOUR (untrusted — normalised
 * here; junk / white = none) goes on EVERY line: a pack is one colour, whichever drawings it holds.
 */
export function expandCardPack<C extends PackCard>(packPricePence: number, packSize: number, cards: C[], ground?: unknown): PackOrderLine<C>[] {
  if (!Number.isInteger(packSize) || packSize < 2) throw new Error('not a card pack');
  if (cards.length !== packSize) throw new Error(`a pack of ${packSize} needs ${packSize} cards (got ${cards.length})`);
  if (!Number.isInteger(packPricePence) || packPricePence % packSize !== 0) throw new Error('pack price must split evenly between its cards');
  const unit = packPricePence / packSize;
  const groups = new Map<string, { card: C; qty: number }>();
  for (const c of cards) {
    const k = designKey(c);
    const g = groups.get(k);
    if (g) g.qty++;
    else groups.set(k, { card: c, qty: 1 });
  }
  const g0 = normalizeGround(ground);
  return [...groups.values()].map((g) => ({ card: g.card, qty: g.qty, unitPricePence: unit, linePence: unit * g.qty, ground: g0 }));
}
