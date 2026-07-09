import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/**
 * The Snickerdoodle back-of-card MARK for the print's outer-rear panel — the founder's own logo
 * (the baby-face wordmark on a cream disc), lifted from the "Outside Open" snicker-overlay and
 * committed as a self-contained print asset. Loaded once and cached; it already carries its own
 * transparent surround, so the assembly just scales + places it (bottom-left of the back panel,
 * where the founder positioned it). No text is drawn — this is their artwork, verbatim.
 */
const req = createRequire(import.meta.url);
let cache: Buffer | null = null;

export function renderCardBackBadge(): Buffer {
  cache ??= readFileSync(req.resolve('./assets/card-back-badge.png'));
  return cache;
}
