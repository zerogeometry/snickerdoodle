/**
 * PACK labels (founder, 29 Oct: "from £60" read as one placemat). A product sold in packs says how many
 * a price buys — on the catalogue tile ("from £60 for 4") and on its customize page ("a set of 4
 * placemats, one drawing on all 4"). Products not sold in packs are unchanged. Client-safe: no I/O.
 */

/** How many a variant is ("pack of 4" → 4), or null when it isn't a pack. */
export function packCountOf(attrs: Record<string, string> | null | undefined): number | null {
  const m = /^pack of (\d+)$/i.exec(attrs?.size ?? '');
  return m ? Number(m[1]) : null;
}

/** "from £60 for 4" — the cheapest variant's price, and its pack size when it's a pack. */
export function fromLabel(p: { fromPence: number; variants: ReadonlyArray<{ pricePence: number; attributes: Record<string, string> }> }, gbp: (pence: number) => string): string {
  const cheapest = [...p.variants].sort((a, b) => a.pricePence - b.pricePence)[0];
  const n = cheapest && cheapest.pricePence === p.fromPence ? packCountOf(cheapest.attributes) : null;
  return n ? `from ${gbp(p.fromPence)} for ${n}` : `from ${gbp(p.fromPence)}`;
}

/** "a set of 4 placemats, one drawing on all 4" (both, for two) — null when the variant isn't a pack. */
export function packLine(label: string, attrs: Record<string, string> | null | undefined): string | null {
  const n = packCountOf(attrs);
  if (!n) return null;
  return `a set of ${n} ${label}, one drawing on ${n === 2 ? 'both' : `all ${n}`}`;
}
