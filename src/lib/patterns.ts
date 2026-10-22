/**
 * Products whose print file is a seamless REPEAT of the drawing — the 'pattern' magic edit
 * (src/server/print/pattern.ts). Client-safe, so the customize page, the positioner, the order gate
 * and the renderer all agree on which products repeat.
 */
export const PATTERN_PRODUCT_KEYS = ['socks', 'wrappingPaper', 'teaTowel'] as const;
/** Is this a repeat-pattern product? Takes a product key OR a variant sku (`socks-tube`). */
export const isPatternProduct = (key: string | null | undefined): boolean => !!key && PATTERN_PRODUCT_KEYS.some((k) => key === k || key.startsWith(`${k}-`));

/**
 * The BASE COLOUR a repeat sits on (founder, 22 Oct: "a repeated print on top of a coloured sock").
 * The whole print file is filled with it and the drawing — lifted off its paper, so see-through —
 * repeats on top. A curated set (brand crayon colours + the classics people buy socks in) so every
 * choice prints well; the token is what's stored and sent, and the server only ever accepts these.
 * White is the default (and what a line without a choice prints on).
 */
export const PATTERN_GROUND_WHITE = 'white';
export const PATTERN_GROUNDS: readonly { token: string; label: string; hex: string }[] = [
  { token: PATTERN_GROUND_WHITE, label: 'white', hex: '#FFFFFF' },
  { token: 'cream', label: 'cream', hex: '#F4EBDA' },
  { token: 'sunshine', label: 'sunshine yellow', hex: '#F6C445' },
  { token: 'tomato', label: 'tomato red', hex: '#C8402A' },
  { token: 'berry', label: 'berry pink', hex: '#E8786E' },
  { token: 'sky', label: 'sky blue', hex: '#8FB5D6' },
  { token: 'leaf', label: 'leaf green', hex: '#7FA65E' },
  { token: 'grey', label: 'grey', hex: '#9C9A96' },
  { token: 'navy', label: 'navy', hex: '#26334F' },
  { token: 'black', label: 'black', hex: '#1F1C1A' },
];

/** A known ground token, or null (anything else — unknown, a raw hex, junk — means "white"). */
export function normalizePatternGround(token: unknown): string | null {
  return typeof token === 'string' && PATTERN_GROUNDS.some((g) => g.token === token) ? token : null;
}

/** The fill for a print file: the ground's hex, white for none/unknown. Server-side source of truth. */
export function patternGroundHex(token: unknown): string {
  return PATTERN_GROUNDS.find((g) => g.token === normalizePatternGround(token))?.hex ?? '#FFFFFF';
}

/** A coloured (non-white) ground? Only these change a line's identity, cache keys and labels. */
export const isColouredGround = (token: unknown): token is string => {
  const t = normalizePatternGround(token);
  return t !== null && t !== PATTERN_GROUND_WHITE;
};
