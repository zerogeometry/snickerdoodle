import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/**
 * The Snickerdoodle back-of-card MARK for the print's outer-rear panel (single cards AND card packs) —
 * the founder's EVERYDAY logo (face + "snicker doodle" wordmark, brand-assets/logo/everyday) on its own,
 * no circle behind it, built by scripts/brand/build-card-back-badge.mjs (900px wide) and committed as a
 * self-contained print asset. Loaded once and cached; it's on a transparent ground, so the assembly
 * just scales + places it (centred along the bottom of the back panel, where the founder wants it).
 * The on-screen "opened out" card shows this same file. No text is drawn — their artwork, verbatim.
 */
const req = createRequire(import.meta.url);
let cache: Buffer | null = null;

export function renderCardBackBadge(): Buffer {
  cache ??= readFileSync(req.resolve('./assets/card-back-badge.png'));
  return cache;
}
