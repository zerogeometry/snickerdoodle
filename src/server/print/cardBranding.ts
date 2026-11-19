import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The Snickerdoodle back-of-card MARK for the print's outer-rear panel (FRONT-ONLY cards — single cards
 * AND card packs; a card drawn across front and back carries none) — the founder's EVERYDAY logo (face +
 * "snicker doodle" wordmark, brand-assets/logo/everyday) on its own, no circle behind it, built by
 * scripts/brand/build-card-back-badge.mjs (900px wide) and committed as a self-contained print asset.
 * Loaded once and cached; it's on a transparent ground, so the assembly just scales + places it
 * (centred along the bottom of the back panel). The on-screen "opened out" card shows this same file.
 *
 * Read from the app folder on disk (the image ships src/ — infra/aws-london/Dockerfile), NOT through
 * `createRequire(import.meta.url).resolve('./assets/…')`: the Next.js server bundle rewrites that
 * resolve into a static-image module id, so readFileSync got a NUMBER (a bogus file descriptor) and
 * threw — breaking every card print render and the mockup seeder in production. The marker below keeps
 * the bundler from tracing/rewriting the path.
 */
export const CARD_BACK_BADGE_FILE = path.join(/* turbopackIgnore: true */ process.cwd(), 'src', 'server', 'print', 'assets', 'card-back-badge.png');
let cache: Buffer | null = null;

export function renderCardBackBadge(): Buffer {
  cache ??= readFileSync(CARD_BACK_BADGE_FILE);
  return cache;
}
