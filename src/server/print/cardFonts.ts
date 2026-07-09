import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { CardFontToken } from '@/lib/card-fonts';

/**
 * The greetings-card fonts as the PRINT renderer needs them: self-hosted STATIC latin .woff faces,
 * the same @fontsource families the live preview shows (see {@link CardFontToken} / card-fonts.ts).
 *
 * Two deliberate choices:
 *  - WOFF, not WOFF2 — satori accepts WOFF/TTF/OTF but not WOFF2.
 *  - the STATIC @fontsource package, not @fontsource-variable — satori's font parser crashes on a
 *    variable font's `fvar` table. The static face is visually the same at weight 400.
 * The card picker, the on-screen preview and the printed card therefore all resolve one token to
 * one face — they can never disagree (and a font is NEVER silently substituted, unlike Pango/sharp).
 */
const FONT_FILES: Record<CardFontToken, string> = {
  caveat: '@fontsource/caveat/files/caveat-latin-400-normal.woff',
  patrick: '@fontsource/patrick-hand/files/patrick-hand-latin-400-normal.woff',
  gochi: '@fontsource/gochi-hand/files/gochi-hand-latin-400-normal.woff',
  shadows: '@fontsource/shadows-into-light/files/shadows-into-light-latin-400-normal.woff',
  baloo: '@fontsource/baloo-2/files/baloo-2-latin-400-normal.woff',
};

// Resolve relative to THIS module (works in dev, vitest and the traced server bundle), then cache
// the bytes — a card render must never hit the filesystem more than once per font per process.
const req = createRequire(import.meta.url);
const cache = new Map<CardFontToken, Buffer>();

/** The raw WOFF bytes for a card font token, read once and cached. Throws if the face is missing
 * (a build/packaging error we want LOUD, never a silent fallback to the wrong font on a keepsake). */
export function loadCardFontWoff(token: CardFontToken): Buffer {
  const hit = cache.get(token);
  if (hit) return hit;
  const buf = readFileSync(req.resolve(FONT_FILES[token]));
  cache.set(token, buf);
  return buf;
}
