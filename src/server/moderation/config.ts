/**
 * Content-safety tuning (D8): what makes the upload classifier FLAG an image for human review.
 * This is the ONE place it is set. It is code, not an env knob, on purpose: loosening it
 * weakens a child-safety gate, so every change goes through a reviewed PR.
 *
 * How a Rekognition result is read (src/server/moderation/rekognition.ts):
 *  - Rekognition returns labels from its moderation taxonomy (3 levels, e.g.
 *    "Violence" → "Graphic Violence" → "Blood & Gore"), each with a confidence 0–100.
 *  - Labels under `minConfidence` are ignored (they are not even requested).
 *  - For each MOST SPECIFIC label returned, we walk up its parents. The first name found in
 *    `flagLabels` or `ignoreLabels` decides that label. So a level-2 entry in `ignoreLabels` can
 *    carve an exception out of a level-1 `flagLabels` category.
 *  - A label in NEITHER list FLAGS (fail-safe: an unknown or renamed category is never waved
 *    through). Getting a name wrong here can only cause extra flags, never fewer.
 *
 * Flagging never rejects anything — it holds the item back from print until a person looks
 * (src/server/admin/review.ts). But a person looking at a child's picture is itself a privacy
 * event, so we only flag what docs/05 asks for: nudity, violence, disturbing imagery, hate symbols.
 *
 * FOUNDER TO CONFIRM before go-live (defaults below are a proposal):
 *  - minConfidence 60 — Rekognition's own default is 50. Lower = more flags (more human looks
 *    at children's pictures); higher = more misses.
 *  - "Swimwear or Underwear" is ignored so beach/bath-time photos of children are not routed to a
 *    human. "Non-Explicit Nudity of Intimate parts and Kissing" still flags (it covers partial
 *    nudity; it will also catch a drawing of two people kissing).
 *  - "Violence" includes weapons, so a pirate's sword or a knight's lance may flag. Add the
 *    relevant level-2/3 names to `ignoreLabels` if review volume shows it's noise.
 */
export interface ClassifierConfig {
  /** 0–100. Labels below this are not requested from Rekognition and never flag. */
  minConfidence: number;
  /** Taxonomy names (any level) that FLAG for review. */
  flagLabels: readonly string[];
  /** Taxonomy names (any level) that do NOT flag. Anything in neither list flags. */
  ignoreLabels: readonly string[];
}

export interface TextReaderConfig {
  /** 0–100. Lines of drawn text read with less confidence than this are dropped. Low on
   * purpose: a misread word can only send a design to review, a dropped one can let abuse by. */
  minConfidence: number;
}

/** Rekognition Content Moderation taxonomy v7 top-level categories. */
export const CLASSIFIER_CONFIG: ClassifierConfig = {
  minConfidence: 60,
  flagLabels: ['Explicit', 'Non-Explicit Nudity of Intimate parts and Kissing', 'Violence', 'Visually Disturbing', 'Hate Symbols'],
  ignoreLabels: ['Swimwear or Underwear', 'Alcohol', 'Drugs & Tobacco', 'Rude Gestures', 'Gambling'],
};

export const TEXT_READER_CONFIG: TextReaderConfig = {
  minConfidence: 50,
};
