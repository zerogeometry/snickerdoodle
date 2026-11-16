/**
 * The SAFE AREA ("the cosy edge") — client-safe, no I/O. Prodigi prints right to the edge on every one
 * of these, so nothing is ever left blank; but the outer band either tucks round a seam, curls round a
 * puffy edge, sits at the very rim, or is where the cutter goes. The positioner shades that band softly
 * and says why in a friendly line, so faces and words stay where they'll be seen. (Founder, 16 Nov 2026 —
 * the print-accuracy report: Prodigi's own templates mark these "safe areas".) Only the positioner shows
 * it; the product photos show the finished look.
 *
 * `mm` is measured in from the FINISHED edge (the print area the positioner outlines — the trim/seam is
 * already off it). `edge`: all round, or only the top + bottom (the mug's plain rim and base). `shape`:
 * follow the product's own outline (a heart, a disc) where the positioner has it, else a plain box.
 */
export interface SafeArea {
  mm: number;
  edge: 'all' | 'topBottom';
  shape: boolean;
  /** the friendly line under the positioner (plain text; the shaded part is called out in it) */
  note: string;
}

const SAFE: Record<string, SafeArea> = {
  // Prodigi's cushion templates: safe area 31 mm in from the file = ~25 mm in from the sewn edge
  cushion: { mm: 25, edge: 'all', shape: true, note: 'the shaded edge still prints, but it tucks round into the seam and the puffy sides — keep faces & words inside it' },
  // the fleece blanket: a stitched, slightly rolled edge ("keep important elements inside the clear area")
  blanket: { mm: 15, edge: 'all', shape: true, note: 'the shaded edge still prints, but it runs into the stitched hem — keep faces & words inside it' },
  // the ceramic ornament: a 72 mm disc, safe circle 66 mm (Prodigi's template) — the disc is ~72 of the 75 mm print area
  ceramicOrnament: { mm: 3, edge: 'all', shape: true, note: 'the shaded rim still prints, right at the edge of the ornament — keep faces inside it' },
  // playing cards: 63.5×89 mm, Prodigi's safe area ~3 mm inside the cut
  playingCards: { mm: 3, edge: 'all', shape: false, note: 'the shaded edge is right where the cards are cut — keep faces & words inside it' },
  // greetings cards (and packs): the cut + fold can wander a touch
  card: { mm: 3, edge: 'all', shape: false, note: 'the shaded edge is right where the card is cut — keep faces & words inside it' },
  cardPack: { mm: 3, edge: 'all', shape: false, note: 'the shaded edge is right where the cards are cut — keep faces & words inside it' },
  // the two-tone mug is "NOT top-to-bottom printing" (Prodigi): a plain band at the rim and the base
  mug: { mm: 4, edge: 'topBottom', shape: false, note: 'the shaded strips at the top and bottom stay mug-coloured — keep faces & words in between' },
};

export function safeAreaOf(productKey: string | null | undefined): SafeArea | null {
  return (productKey && SAFE[productKey]) || null;
}
