/**
 * Products whose print file is a seamless REPEAT of the drawing — the 'pattern' magic edit
 * (src/server/print/pattern.ts). Client-safe, so the customize page, the positioner, the order gate
 * and the renderer all agree on which products repeat.
 */
export const PATTERN_PRODUCT_KEYS = ['socks', 'wrappingPaper', 'teaTowel'] as const;
/** Is this a repeat-pattern product? Takes a product key OR a variant sku (`socks-tube`). */
export const isPatternProduct = (key: string | null | undefined): boolean => !!key && PATTERN_PRODUCT_KEYS.some((k) => key === k || key.startsWith(`${k}-`));
