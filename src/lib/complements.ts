/**
 * CHECKOUT ADD-ONS (founder, 29 Oct): a couple of things that go nicely with what's already in the
 * basket, made with the shopper's OWN drawing. ONE small table, product key → its complements in
 * order (same-parcel uk9 homeware first where it fits, so most carry a real saving). Pure — the server
 * filters it against what's on show and works out each one's real saving (src/server/addOns.ts).
 */

export const COMPLEMENTS: Readonly<Record<string, readonly string[]>> = {
  // the christmas table + tree: all uk9 homeware, so each rides in the same parcel
  christmasBundle: ['sack', 'mug', 'teaTowel'],
  placemat: ['coaster', 'mug', 'teaTowel'],
  coaster: ['placemat', 'mug', 'teaTowel'],
  ceramicOrnament: ['sack', 'mug', 'teaTowel'],
  sack: ['ceramicOrnament', 'mug', 'teaTowel'],
  mug: ['coaster', 'teaTowel', 'placemat'],
  teaTowel: ['mug', 'coaster', 'placemat'],
  christmasBauble: ['ceramicOrnament', 'sack', 'card'],
  // natural fits from other labs (no saving claimed)
  card: ['cardPack', 'wrappingPaper', 'framedPrint'],
  cardPack: ['wrappingPaper', 'calendar', 'mug'],
  wrappingPaper: ['card', 'cardPack', 'sack'],
  calendar: ['framedPrint', 'mug', 'card'],
  framedPrint: ['jigsaw', 'card', 'mug'],
  jigsaw: ['framedPrint', 'mug', 'card'],
  cushion: ['blanket', 'framedPrint', 'mug'],
  blanket: ['cushion', 'teaTowel', 'mug'],
  kidsTee: ['adultTee', 'mug', 'socks'],
  adultTee: ['kidsTee', 'mug', 'socks'],
  babyBodysuit: ['kidsTee', 'blanket', 'mug'],
  socks: ['mug', 'teaTowel', 'adultTee'],
  phoneCase: ['mug', 'playingCards', 'socks'],
  playingCards: ['jigsaw', 'mug', 'card'],
  heightChart: ['framedPrint', 'kidsTee', 'blanket'],
  storybook: ['framedPrint', 'jigsaw', 'card'],
};

/** What a christmas family bundle already holds — never suggested beside one. */
const IN_BUNDLE = ['placemat', 'coaster', 'ceramicOrnament'];

/**
 * Up to `max` complements of what's in the basket (by product key, in basket order): never a product
 * already in it (or inside a bundle in it), never one that isn't on show.
 */
export function suggestComplements(basketProducts: readonly string[], onShow: ReadonlySet<string>, max = 3): string[] {
  const have = new Set(basketProducts);
  if (have.has('christmasBundle')) for (const k of IN_BUNDLE) have.add(k);
  const out: string[] = [];
  for (const p of basketProducts) {
    for (const c of COMPLEMENTS[p] ?? []) {
      if (out.length >= max) return out;
      if (!have.has(c) && onShow.has(c) && !out.includes(c)) out.push(c);
    }
  }
  return out;
}

/** The shopper's drawing to make the add-ons with: the first drawn line's — for the family bundle, the
 * placemats' (else its first ornament's); for a card pack its first card; for a calendar its cover. */
export function basketDrawing(
  items: ReadonlyArray<{
    artwork?: { assetId: string; sourceObjectId?: string | null } | null;
    bundle?: { placemat?: { assetId: string; sourceObjectId?: string | null } | null; ornaments?: Array<{ assetId: string; sourceObjectId?: string | null }> } | null;
    cards?: Array<{ assetId: string; sourceObjectId?: string | null }> | null;
    pages?: Array<{ assetId: string; sourceObjectId?: string | null } | null> | null;
  }>,
): { assetId: string; sourceObjectId: string | null } | null {
  for (const i of items) {
    const a = i.artwork ?? i.bundle?.placemat ?? i.bundle?.ornaments?.[0] ?? i.cards?.[0] ?? i.pages?.find(Boolean) ?? null;
    if (a?.assetId) return { assetId: a.assetId, sourceObjectId: a.sourceObjectId ?? null };
  }
  return null;
}
