/**
 * The Studio's one-tap MAGIC EDITS that change the drawing's own pixels — "tidy the lines" and
 * "brighten" (Studio spec §13). Self-hosted and deterministic (sharp, in-process, in-region): no
 * third party ever sees the image. They're switches in the recipe, applied to the drawing each
 * time the design is made, so the original is never changed and each one can be undone.
 */
export interface MagicEdits {
  /** Smooth speckles and fuzzy, scanned edges; clean the paper toward white. */
  tidy?: true;
  /** Lift a dull or dim photo: stretch the tones to the full range, a touch more colour. */
  brighten?: true;
}

export const MAGIC_EDITS: { id: keyof MagicEdits; label: string; note: string }[] = [
  { id: 'tidy', label: 'tidy the lines', note: 'smooths speckles and fuzzy edges, and whitens the paper' },
  { id: 'brighten', label: 'brighten', note: 'lifts a dim or dull photo — full colour, crisp whites' },
];

/** Validate a client-sent set (never trust the client). Null = none on. */
export function cleanMagic(raw: unknown): MagicEdits | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const m: MagicEdits = {};
  if (r.tidy === true) m.tidy = true;
  if (r.brighten === true) m.brighten = true;
  return m.tidy || m.brighten ? m : null;
}

export const magicKey = (m: MagicEdits | null | undefined) => `${m?.tidy ? 't' : ''}${m?.brighten ? 'b' : ''}`;

/**
 * The tidy filter's size, as a share of the picture — so the editing copy and the full-size print
 * get the same RELATIVE smoothing (an odd median window, 3px at ~1600px across).
 */
export function tidyWindow(longEdge: number): number {
  const r = Math.min(7, Math.max(3, Math.round(longEdge / 550)));
  return r % 2 ? r : r + 1;
}
