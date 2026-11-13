// The Christmas snow's crayon flakes (src/ui/components/Snowfall.tsx), from the founder's crayon snowflake
// (snowflake-crayon-source.png, 13 Nov 2026). Run: node scripts/textures/build-snow.mjs
//
// The crayon strokes become WHITE snow; the paper becomes transparent. Under each flake sits a very faint
// cocoa shadow, so white snow still reads on the oat page. Two sprites:
//   public/textures/snowflake.webp  the whole flake (the near, big flakes and the little far ones)
//   public/textures/snow-dot.webp   a crayon blob from the flake's middle (the tiny specks)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'scripts', 'textures', 'snowflake-crayon-source.png');
const OUT = path.join(ROOT, 'public', 'textures');

const COCOA = [43, 33, 24];
const SHADOW_ALPHA = 0.15; // at full stroke: a crisp, faint edge under the white, not a smudge
const PAPER = 238; // greys lighter than this are paper
const INK = 175; // greys darker than this are solid crayon (snow needs to be a bit chunkier than pencil)
const THICKEN = 1.1; // px of blur spread back over the strokes, so a small flake still reads as white
const GAIN = 2.1;

/** Crayon strokes → an alpha mask (dark = opaque), keeping the crayon's grain. */
async function strokeAlpha(input, { size, region } = {}) {
  let img = sharp(input).grayscale();
  if (region) img = img.extract(region);
  if (size) img = img.resize({ width: size, height: size, kernel: 'lanczos3' });
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const a = Buffer.alloc(info.width * info.height);
  for (let i = 0; i < a.length; i++) {
    const g = data[i * info.channels];
    a[i] = Math.round(255 * Math.min(1, Math.max(0, (PAPER - g) / (PAPER - INK))));
  }
  // chunkier: spread the strokes a little (a soft blur pushed back up), keeping the crayon grain on top
  const spread = await sharp(a, { raw: { width: info.width, height: info.height, channels: 1 } }).blur(THICKEN).extractChannel(0).raw().toBuffer();
  // …then the wax grain back over it: crayon never lays down solid colour (seeded, so rebuilds match)
  let seed = 7;
  const grain = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < a.length; i++) a[i] = Math.round(Math.max(a[i], Math.min(255, spread[i] * GAIN)) * (0.7 + 0.3 * grain()));
  return { a, w: info.width, h: info.height };
}

/** White snow over a faint, soft, slightly-dropped cocoa shadow, padded so the shadow isn't cut off. */
async function snowSprite({ a, w, h }, { pad, blur, drop, out, radial = false }) {
  const W = w + pad * 2;
  const H = h + pad * 2;
  const alpha = Buffer.from(a);
  if (radial) {
    // a round blob: fade the corners out so no arm stubs show
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const d = Math.hypot(x - (w - 1) / 2, y - (h - 1) / 2) / (w / 2);
        alpha[y * w + x] = Math.round(alpha[y * w + x] * Math.min(1, Math.max(0, (1 - d) / 0.25)));
      }
  }
  const rgba = (rgb, k) => {
    const b = Buffer.alloc(W * H * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const o = ((y + pad) * W + (x + pad)) * 4;
        b[o] = rgb[0];
        b[o + 1] = rgb[1];
        b[o + 2] = rgb[2];
        b[o + 3] = Math.round(alpha[y * w + x] * k);
      }
    return b;
  };
  const raw = { width: W, height: H, channels: 4 };
  const shadow = await sharp(rgba(COCOA, SHADOW_ALPHA), { raw }).blur(blur).png().toBuffer();
  const flake = await sharp(rgba([255, 255, 255], 1), { raw }).png().toBuffer();
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: shadow, left: 0, top: drop },
      { input: flake, left: 0, top: 0 },
    ])
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(out);
  console.log('wrote', path.relative(ROOT, out), `${W}×${H}`);
}

// the whole flake: 144px of drawing (+8px padding) — sharp at 2× for the biggest flakes (~76px)
await snowSprite(await strokeAlpha(SRC, { size: 144 }), { pad: 8, blur: 1.2, drop: 2, out: path.join(OUT, 'snowflake.webp') });
// the crayon blob from the flake's hub (the source's middle), for the tiny specks
await snowSprite(await strokeAlpha(SRC, { region: { left: 72, top: 68, width: 34, height: 34 }, size: 34 }), {
  pad: 4,
  blur: 1,
  drop: 1,
  radial: true,
  out: path.join(OUT, 'snow-dot.webp'),
});
