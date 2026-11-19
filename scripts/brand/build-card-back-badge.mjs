/**
 * Builds the printed card-back logo (src/server/print/assets/card-back-badge.png) — the Snickerdoodle
 * logo on its own (no circle behind it, founder 19 Nov 2026), printed bottom-left of the outer rear of
 * every greetings card (single cards AND card packs) and shown on the card's "opened out" picture:
 *   node scripts/brand/build-card-back-badge.mjs [path/to/brand-assets]   (default: ../brand-assets)
 *
 * Always the EVERYDAY logo (logo/everyday/snickerdoodle-logo.png — the face + "snicker doodle" wordmark),
 * never the Christmas one: a card outlives the season. Not SD-logo-original.png either — that's the old one.
 *
 * Size: cardPrint.ts prints it 18% of a 1530px panel wide (≈275px ≈ 23mm at 300dpi). It's built 900px
 * wide, so the print only ever scales it DOWN (sharp at 300dpi+, ≈980dpi at its printed size).
 * Colours are the logo's own (lossless RGBA PNG, no palette squeeze), trimmed to its ink on a clear ground.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SRC = path.resolve(process.argv[2] ?? path.join(ROOT, '..', 'brand-assets'));
const LOGO = path.join(SRC, 'logo', 'everyday', 'snickerdoodle-logo.png');
if (!existsSync(LOGO)) throw new Error(`no everyday logo at ${LOGO}`);
const OUT = path.join(ROOT, 'src', 'server', 'print', 'assets', 'card-back-badge.png');

const WIDTH = 900; // px

const lockup = await sharp(LOGO).trim({ threshold: 1 }).png().toBuffer(); // trimmed to its ink
await sharp(lockup).resize({ width: WIDTH, kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(OUT);

const m = await sharp(OUT).metadata();
console.log(`${path.relative(ROOT, OUT)}  ${m.width}×${m.height} from ${path.relative(SRC, LOGO)}`);
