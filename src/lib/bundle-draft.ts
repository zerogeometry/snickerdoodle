import type { BundleArt, BundleSize, BundleSpec } from '@/lib/christmas-bundle';

/**
 * The christmas family bundle builder's SLOT STATE, as pure functions (founder, 29 Oct: "thumbnails
 * vanish", "studio edits don't come back") — one place that every change goes through, so the
 * slots, their thumbnails, the bundle picture and the order can never disagree:
 *  - each slot holds WHICH drawing (an asset) and WHICH look of it (its cutout / Studio design);
 *  - a slot that holds nothing wears the placemats' drawing (coasters, ornaments);
 *  - an edit to a drawing is applied to the slots that hold THAT drawing, and nowhere else — and a
 *    drawing whose look isn't known right now (the keepsake box reloading) is left exactly as it is;
 *  - a slot with a drawing never shows an empty "+".
 * Client-safe: no I/O.
 */

export type Slot = 'placemat' | 'coaster' | { ornament: number };
export interface Draft {
  size: BundleSize;
  placemat: BundleArt | null;
  /** null = the placemats' drawing */
  coaster: BundleArt | null;
  /** per ornament; null = the placemats' drawing */
  ornaments: Array<BundleArt | null>;
}
export const EMPTY_DRAFT: Draft = { size: 2, placemat: null, coaster: null, ornaments: [] };

const same = (a: BundleArt | null | undefined, b: BundleArt | null | undefined) =>
  (a?.assetId ?? null) === (b?.assetId ?? null) && (a?.sourceObjectId ?? null) === (b?.sourceObjectId ?? null);
const clean = (a: BundleArt): BundleArt => (a.sourceObjectId ? { assetId: a.assetId, sourceObjectId: a.sourceObjectId } : { assetId: a.assetId });

/** What a slot holds of its OWN (null = nothing of its own). */
export function ownArt(d: Draft, s: Slot): BundleArt | null {
  if (s === 'placemat') return d.placemat;
  if (s === 'coaster') return d.coaster;
  return d.ornaments[s.ornament] ?? null;
}
/** What a slot shows: its own drawing, else the placemats'. */
export const shownArt = (d: Draft, s: Slot): BundleArt | null => ownArt(d, s) ?? d.placemat;

/** Put a drawing in a slot (add or replace). */
export function setSlot(d: Draft, s: Slot, art: BundleArt): Draft {
  const a = clean(art);
  if (s === 'placemat') return { ...d, placemat: a };
  if (s === 'coaster') return { ...d, coaster: a };
  const list = [...d.ornaments];
  while (list.length <= s.ornament) list.push(null);
  list[s.ornament] = a;
  return { ...d, ornaments: list };
}

/** "undo": a coaster / ornament goes back to the placemats' drawing. (The placemats can't be emptied.) */
export function resetSlot(d: Draft, s: Slot): Draft {
  if (s === 'placemat') return d;
  if (s === 'coaster') return { ...d, coaster: null };
  return { ...d, ornaments: d.ornaments.map((o, i) => (i === s.ornament ? null : o)) };
}

/**
 * A drawing's current look (its cutout / Studio design) — applied to every slot holding THAT drawing.
 * `lookOf(assetId)` → its source object, undefined = the plain drawing, or `false` = not known (left alone).
 * Returns the same object when nothing changed.
 */
export function withLooks(d: Draft, lookOf: (assetId: string) => string | undefined | false): Draft {
  const fix = (a: BundleArt | null): BundleArt | null => {
    if (!a) return a;
    const sid = lookOf(a.assetId);
    if (sid === false || (sid ?? null) === (a.sourceObjectId ?? null)) return a;
    return sid ? { assetId: a.assetId, sourceObjectId: sid } : { assetId: a.assetId };
  };
  const next: Draft = { ...d, placemat: fix(d.placemat), coaster: fix(d.coaster), ornaments: d.ornaments.map(fix) };
  return same(next.placemat, d.placemat) && same(next.coaster, d.coaster) && next.ornaments.every((a, i) => a === d.ornaments[i]) ? d : next;
}

/** The spec the server will make (null until the placemats have a drawing). */
export function specOf(d: Draft): BundleSpec | null {
  if (!d.placemat) return null;
  return { placemat: d.placemat, coaster: d.coaster, ornaments: Array.from({ length: d.size }, (_, i) => d.ornaments[i] ?? d.placemat!) };
}

export type SlotView = { art: BundleArt | null; own: boolean; state: 'empty' | 'loading' | 'ready'; url: string | null };
/**
 * What a slot's thumbnail shows — derived from the SAME draft as the picture, so they can't disagree:
 * nothing → 'empty' (a "+"); a drawing whose picture isn't known yet → 'loading' (a skeleton, never a
 * misleading "+"); else its picture.
 */
export function slotView(d: Draft, s: Slot, pictureOf: (a: BundleArt) => string | null): SlotView {
  const art = shownArt(d, s);
  if (!art) return { art: null, own: false, state: 'empty', url: null };
  const url = pictureOf(art);
  return { art, own: !!ownArt(d, s), state: url ? 'ready' : 'loading', url };
}
