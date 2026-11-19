/**
 * Builds the printed card-back badge (src/server/print/assets/card-back-badge.png) — the Snickerdoodle
 * logo on a cream disc, printed bottom-left of the outer rear of every greetings card (single cards AND
 * card packs) and shown on the card's "opened out" picture on the site:
 *   node scripts/brand/build-card-back-badge.mjs [path/to/brand-assets]   (default: ../brand-assets)
 *
 * Always the EVERYDAY logo (logo/everyday/snickerdoodle-logo.png — the face + "snicker doodle" wordmark),
 * never the Christmas one: a card outlives the season. Not SD-logo-original.png either — that's the old one.
 *
 * Size: cardPrint.ts prints the badge 18% of a 1530px panel wide (≈275px ≈ 23mm at 300dpi). The badge is
 * built at 600px, so the print only ever scales it DOWN (sharp at 300dpi+, ≈650dpi at its printed size).
 * Colours are the logo's own (lossless RGBA PNG, no palette squeeze); the disc is the brand paper colour.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SRC = path.resolve(process.argv[2] ?? path.join(ROOT, '..', 'brand-assets'));
const LOGO = path.join(SRC, 'logo', 'everyday', 'snickerdoodle-logo.png');
if (!existsSync(LOGO)) throw new Error(`no everyday logo at ${LOGO}`);
const OUT = path.join(ROOT, 'src', 'server', 'print', 'assets', 'card-back-badge.png');

const SIZE = 600; // px — the disc's diameter
const PAPER = '#FFFBF2'; // brand paper (globals.css)
const LOGO_W = 0.78; // the lockup's width inside the disc, as before

const lockup = await sharp(LOGO).trim({ threshold: 1 }).png().toBuffer(); // trimmed to its ink
const mark = await sharp(lockup).resize({ width: Math.round(SIZE * LOGO_W), kernel: 'lanczos3' }).png().toBuffer();
const disc = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2 - 0.5}" fill="${PAPER}"/></svg>`,
);
await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: disc }, { input: mark, gravity: 'centre' }])
  .png({ compressionLevel: 9 })
  .toFile(OUT);

const m = await sharp(OUT).metadata();
const lm = await sharp(mark).metadata();
console.log(`${path.relative(ROOT, OUT)}  ${m.width}×${m.height} (logo ${lm.width}×${lm.height}) from ${path.relative(SRC, LOGO)}`);
