import { lineIdFor } from '@/lib/catalogue-view';
import type { BasketItem } from '@/lib/store';

/**
 * WHICH basket line a personalised item belongs to. One line = one thing that prints the same way:
 * the variant (+ base colour, see lineIdFor) AND the design on it — the drawing (or its cutout /
 * studio edit), its placement, the cushion back and the card's inside. So two heart cushions with
 * different drawings are two lines, each with its own picture and its own quantity, while adding
 * the very same cushion again just counts it up. Every place that adds to the basket uses this.
 */
export type LineDesign = Pick<BasketItem, 'artwork' | 'back' | 'message' | 'cardImageSpan' | 'ground'>;

/** A short, stable fingerprint of the design ('' for a line with no drawing, e.g. an add-on). */
export function designSig(d: LineDesign): string {
  if (!d.artwork) return '';
  const t = d.artwork.transform;
  const r = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 1e4) / 1e4; // float noise never forks a line
  const m = d.message;
  const canon = JSON.stringify([
    d.artwork.assetId,
    d.artwork.sourceObjectId ?? '',
    t ? [r(t.scale), r(t.offsetX), r(t.offsetY), r(t.rotationDeg)] : null,
    d.back ?? '',
    m ? [m.greeting, m.message, m.signature, m.note, m.font, m.fontScale ?? 1] : null,
    d.cardImageSpan ?? '',
  ]);
  return hash53(canon);
}

/** The line id for a variant sku carrying this design. */
export function basketLineId(sku: string, d: LineDesign): string {
  const base = lineIdFor(sku, d.ground);
  const sig = designSig(d);
  return sig ? `${base}~d${sig}` : base;
}

// cyrb53: a fast 53-bit string hash (plenty for a basket; not a security boundary — the server
// re-checks every drawing and price at order time).
function hash53(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
