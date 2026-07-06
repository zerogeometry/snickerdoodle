// Generates soft, photographic flat-lay garment BLANKS for the mockup compositor.
//
// The launch range's three garments (kids tee, adult tee, baby bodysuit) have no
// Prodigi product photo we can stage — so their catalogue tiles fell back to the flat
// SVG line-art while every other product renders a photoreal composite. That jarring
// inconsistency is what reads as "not rendering".
//
// Rather than eyeball a mockup, we SYNTHESISE a clean cotton flat-lay: a real garment
// silhouette filled with softly-shaded white jersey, gentle folds, a ribbed crew collar,
// hems and a contact shadow — the "generic flat-lay mockup" the founder signed off on.
// The child's drawing is then registered onto the CHEST panel by the same aspect-locked
// pipeline as everything else, and the Tier-B fabric fx makes it follow the baked folds.
//
// Output → .prodigi-assets/blanks/derived/{tee,bodysuit}-blank.png (gitignored assets,
// committed like the card/storybook derived blanks). Run: node scripts/make-garment-blanks.mjs
//
// Deliberately NO child data, no network — pure procedural geometry + sharp pixel ops.

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const OUT = path.join(process.cwd(), '.prodigi-assets', 'blanks', 'derived');
mkdirSync(OUT, { recursive: true });

const W = 1300;
const H = 1500;

// Warm neutral flat-lay surface (styled-on-a-table feel), with a faint corner vignette.
const SURFACE = { r: 236, g: 230, b: 219 };

const svg = (body, w = W, h = H) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`,
  );

// Rasterise an SVG string to a raw RGBA buffer of exactly W×H.
const raster = (body) => sharp(svg(body)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

/**
 * Build one garment flat-lay from a silhouette path + fold/seam/collar detail.
 * All coordinates are in the W×H canvas so callers can hand-place cloth features.
 */
async function buildGarment({ silhouette, neckHole, folds, seams, collar, name }) {
  // 1) SURFACE — warm neutral with a soft radial vignette so it reads photographed.
  const surface = sharp({
    create: { width: W, height: H, channels: 4, background: { ...SURFACE, alpha: 1 } },
  }).composite([
    {
      input: svg(
        `<defs><radialGradient id="v" cx="50%" cy="46%" r="72%">
           <stop offset="60%" stop-color="#000000" stop-opacity="0"/>
           <stop offset="100%" stop-color="#000000" stop-opacity="0.10"/>
         </radialGradient></defs>
         <rect width="${W}" height="${H}" fill="url(#v)"/>`,
      ),
      blend: 'over',
    },
  ]);

  // 2) SILHOUETTE MASK (white shape on black) — the garment's extent.
  const maskPng = await sharp(svg(`<path d="${silhouette}" fill="#ffffff"/>`)).png().toBuffer();
  const mask = await sharp(maskPng).extractChannel(0).raw().toBuffer(); // 1-channel coverage

  // 3) CONTACT SHADOW — the silhouette, blurred + offset down, dropped onto the surface.
  const shadow = await sharp(svg(`<path d="${silhouette}" fill="#2b241d"/>`))
    .blur(26)
    .png()
    .toBuffer();

  // 4) FABRIC SHADING MAP — a grayscale of soft folds + edge falloff, 128 = neutral cotton.
  //    This is BOTH what tints the visible jersey AND (crucially) the luminance the Tier-B
  //    fabric fx samples at compose time, so the drawing follows exactly these folds.
  const foldSvg = `
    <defs>
      <filter id="b1" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="26"/></filter>
      <filter id="b2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="12"/></filter>
    </defs>
    <rect width="${W}" height="${H}" fill="rgb(128,128,128)"/>
    <g filter="url(#b1)">
      ${folds.shadows.map((d) => `<path d="${d}" fill="none" stroke="rgb(96,96,96)" stroke-width="26" stroke-linecap="round"/>`).join('')}
    </g>
    <g filter="url(#b2)">
      ${folds.highlights.map((d) => `<path d="${d}" fill="none" stroke="rgb(168,168,168)" stroke-width="14" stroke-linecap="round"/>`).join('')}
    </g>`;
  // Edge falloff: darken a rim just inside the silhouette (blur the mask, invert near edge).
  const rim = await sharp(maskPng).extractChannel(0).blur(18).raw().toBuffer(); // soft edge (raw grayscale)
  const foldMapPng = await sharp(svg(foldSvg)).png().toBuffer();

  // 5) VISIBLE JERSEY — white cotton tinted by the fold map, clipped to the silhouette.
  const base = { r: 250, g: 250, b: 247 };
  const foldGray = await sharp(foldMapPng).extractChannel(0).raw().toBuffer();
  const jersey = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const m = mask[i] / 255; // inside-garment coverage
    const shade = foldGray[i] / 128; // 1 = neutral, <1 darker fold, >1 highlight
    const edge = rim[i] / 255; // 1 centre, →0 at edge
    const seam = 0.90 + 0.10 * edge; // gentle darkening toward the very edge
    const k = shade * seam;
    jersey[i * 4] = Math.min(255, base.r * k);
    jersey[i * 4 + 1] = Math.min(255, base.g * k);
    jersey[i * 4 + 2] = Math.min(255, base.b * k);
    jersey[i * 4 + 3] = Math.round(mask[i]); // alpha = silhouette
  }
  const jerseyPng = await sharp(jersey, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();

  // 6) NECK HOLE — the collar opening shows the inside of the garment (a touch darker).
  const neckPng = neckHole
    ? await sharp(svg(`<path d="${neckHole}" fill="#e7e0d4"/>`)).png().toBuffer()
    : null;

  // 7) DETAIL — collar rib + seams/hems as fine strokes.
  const detailPng = await sharp(
    svg(`
      ${collar ?? ''}
      <g fill="none" stroke="#d9d2c4" stroke-opacity="0.9">
        ${seams.map((s) => `<path d="${s.d}" stroke-width="${s.w}" stroke-dasharray="${s.dash ?? 'none'}"/>`).join('')}
      </g>`),
  )
    .png()
    .toBuffer();

  // 8) COMPOSE: surface → contact shadow → neck hole → jersey → detail.
  const layers = [{ input: shadow, blend: 'over' }];
  if (neckPng) layers.push({ input: neckPng, blend: 'over' });
  layers.push({ input: jerseyPng, blend: 'over' }, { input: detailPng, blend: 'over' });

  const out = path.join(OUT, `${name}-blank.png`);
  await surface.composite(layers).png().toFile(out);
  return out;
}

// ── TEE (crew-neck, short sleeve) — kids + adult share the silhouette ──────────
// Symmetric flat-lay. Shoulders ~y360, body hem ~y1230, sleeves flare out to x150/1150.
const TEE = {
  name: 'tee',
  silhouette:
    'M500 360 ' +
    'C560 348 740 348 800 360 ' + // shoulder line under collar
    'L1010 402 ' + // to sleeve top (right)
    'C1120 430 1160 520 1150 610 ' + // right sleeve cap
    'L1010 690 ' + // sleeve hem outer
    'C980 700 940 690 905 660 ' + // sleeve hem to underarm
    'L880 600 ' +
    'C872 760 872 1050 878 1210 ' + // right body side, slight taper
    'C880 1240 855 1258 820 1258 ' + // hem corner right
    'L480 1258 ' +
    'C445 1258 420 1240 422 1210 ' + // hem corner left
    'C428 1050 428 760 420 600 ' + // left body side
    'L395 660 ' +
    'C360 690 320 700 290 690 ' + // sleeve hem (left)
    'L150 610 ' +
    'C140 520 180 430 290 402 ' + // left sleeve cap
    'L500 360 Z',
  // crew neck opening
  neckHole: 'M500 360 C560 348 740 348 800 360 C812 396 760 430 650 430 C540 430 488 396 500 360 Z',
  folds: {
    shadows: [
      'M560 520 C600 720 590 980 620 1200', // long body fold (left-of-centre)
      'M760 540 C740 760 770 1000 740 1200', // long body fold (right-of-centre)
      'M470 470 C520 520 540 560 520 640', // left underarm gather
      'M830 470 C780 520 760 560 780 640', // right underarm gather
      'M320 470 C360 520 380 560 360 610', // left sleeve fold
      'M980 470 C940 520 920 560 940 610', // right sleeve fold
    ],
    highlights: [
      'M660 470 C665 700 660 980 660 1180', // centre-chest gentle highlight
      'M430 540 C420 760 430 1000 440 1180', // left body highlight
      'M870 540 C880 760 870 1000 860 1180', // right body highlight
    ],
  },
  seams: [
    { d: 'M1010 690 C980 700 940 690 905 660', w: 5 }, // right sleeve hem
    { d: 'M290 690 C320 700 360 690 395 660', w: 5 }, // left sleeve hem
    { d: 'M480 1252 L820 1252', w: 6 }, // bottom hem
    { d: 'M472 1240 L828 1240', w: 3, dash: '10 12' }, // bottom hem stitch
  ],
  // crew collar rib: a band around the neck opening with fine rib ticks
  collar:
    '<path d="M500 360 C560 348 740 348 800 360 C812 396 760 430 650 430 C540 430 488 396 500 360 Z" ' +
    'fill="none" stroke="#efe9dd" stroke-width="26"/>' +
    '<path d="M506 366 C562 356 738 356 794 366 C804 396 758 424 650 424 C542 424 496 396 506 366 Z" ' +
    'fill="none" stroke="#cfc7b6" stroke-width="4"/>',
  chest: { x0: 0.40, y0: 0.36, x1: 0.60, y1: 0.60 },
};

// ── BABY BODYSUIT (long sleeve — Rabbit Skins 4411 — poppers at the crotch) ────
// Slim torso, LONG sleeves angled down-and-out with visible cuffs and a clear
// underarm notch, soft leg lobes with a deep crotch dip.
const BODY = {
  name: 'bodysuit',
  silhouette:
    'M530 400 ' +
    'C575 388 725 388 770 400 ' + // neck shoulder line
    'L880 448 ' + // right shoulder point
    'C955 495 1010 600 1040 730 ' + // right sleeve outer, down-and-out
    'L1062 845 ' +
    'C1068 888 1046 912 1008 902 ' + // right cuff end cap
    'L940 878 ' + // cuff inner
    'C918 795 895 715 866 655 ' + // sleeve inner, back up
    'L848 618 ' + // underarm notch
    'C853 795 851 990 855 1125 ' + // right torso side
    'C893 1160 899 1232 861 1263 ' + // right hip → leg lobe
    'C821 1293 742 1293 713 1256 ' + // right leg hem
    'C691 1224 609 1224 587 1256 ' + // crotch dip
    'C558 1293 479 1293 439 1263 ' + // left leg hem
    'C401 1232 407 1160 445 1125 ' + // left leg lobe → hip
    'C449 990 447 795 452 618 ' + // left torso side
    'L434 655 ' + // underarm notch (left)
    'C405 715 382 795 360 878 ' + // left sleeve inner, down
    'L292 902 ' +
    'C254 912 232 888 238 845 ' + // left cuff end cap
    'L260 730 ' +
    'C290 600 345 495 420 448 ' + // left sleeve outer, up to shoulder
    'L530 400 Z',
  neckHole: 'M530 400 C575 388 725 388 770 400 C780 432 735 462 650 462 C565 462 520 432 530 400 Z',
  folds: {
    shadows: [
      'M580 540 C605 720 598 920 615 1105', // torso fold left-of-centre
      'M735 560 C718 740 740 940 722 1105', // torso fold right-of-centre
      'M420 520 C370 610 330 720 300 830', // left sleeve, along its axis
      'M880 520 C930 610 970 720 1000 830', // right sleeve
      'M560 1180 C600 1215 700 1215 740 1180', // crotch gather
    ],
    highlights: [
      'M652 500 C655 700 652 940 653 1110', // centre chest
      'M480 560 C472 760 478 970 484 1110',
      'M822 560 C830 760 824 970 818 1110',
      'M350 600 C325 690 302 780 285 855', // left sleeve highlight
      'M950 600 C975 690 998 780 1015 855', // right sleeve highlight
    ],
  },
  seams: [
    { d: 'M940 878 C918 872 900 868 884 866', w: 4 }, // right cuff seam
    { d: 'M360 878 C382 872 400 868 416 866', w: 4 }, // left cuff seam
    { d: 'M451 1258 C500 1284 560 1280 590 1250', w: 4 }, // left leg hem stitch
    { d: 'M710 1250 C740 1280 800 1284 849 1258', w: 4 }, // right leg hem stitch
  ],
  // collar rib + popper snaps along the crotch band
  collar:
    '<path d="M530 400 C575 388 725 388 770 400 C780 432 735 462 650 462 C565 462 520 432 530 400 Z" ' +
    'fill="none" stroke="#efe9dd" stroke-width="22"/>' +
    '<path d="M536 406 C578 396 722 396 764 406 C772 430 730 456 650 456 C570 456 528 430 536 406 Z" ' +
    'fill="none" stroke="#cfc7b6" stroke-width="3.5"/>' +
    '<g fill="#e4ddce" stroke="#cfc7b6" stroke-width="2">' +
    '<circle cx="565" cy="1247" r="9"/><circle cx="650" cy="1256" r="9"/><circle cx="735" cy="1247" r="9"/>' +
    '</g>',
  chest: { x0: 0.40, y0: 0.36, x1: 0.60, y1: 0.58 },
};

for (const g of [TEE, BODY]) {
  const out = await buildGarment(g);
  console.log(`wrote ${out}  chest=${JSON.stringify(g.chest)}`);
}
