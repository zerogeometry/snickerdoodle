// Composes the founder's cut-out product photos into LAYERED mockup sets the seeder reads
// (.prodigi-assets/blanks/layered/<product>/) — the same construction as the frames, cushions and
// blanket: our cream backdrop, a soft contact shadow, the product photo, the print area, and the
// on-top detail (a sock heel, a folded corner, a paper curl). Everything lands on one 2000×2000
// canvas, the product filling ~80% of it like the rest of the range.
//
// Inputs (cut-outs, no background or shadow) live in .prodigi-assets/blanks/founder-raw/ — the whole
// tree is gitignored, like every product photo. Re-run whenever a photo changes:
//   node scripts/compose-founder-layers.mjs
// A set whose photos aren't in founder-raw yet is skipped (and says so) — drop them in and re-run.
// `node scripts/compose-founder-layers.mjs watchStrap` composes only the sets whose folder starts with that.
// (FOUNDER_LAYERS_ROOT=<dir> composes from <dir>/founder-raw into <dir>/layered instead — for tests.)
//
// Per product folder it writes:
//   background.png  the shared brand backdrop (copied from the blanket set, so every tile matches)
//   shadow.png      soft + contact shadow drawn from the product's own outline
//   product.png     the photo — the compositor multiplies fabric art over it, so knit/cotton
//                   texture and folds read through the print
//   printmap.png    white where the print goes (its alpha = print area + silhouette mask)
//   overlay.png     optional detail laid OVER the art (heel / folded corner / roll curl)
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.env.FOUNDER_LAYERS_ROOT ? path.resolve(process.env.FOUNDER_LAYERS_ROOT) : path.join(process.cwd(), '.prodigi-assets', 'blanks');
const RAW = path.join(ROOT, 'founder-raw');
const OUT = path.join(ROOT, 'layered');
const BACKGROUND = process.env.FOUNDER_LAYERS_ROOT ? path.join(ROOT, 'background.png') : path.join(OUT, 'blanket', 'white', 'background.png');
const CANVAS = 2000;

/**
 * fill   — the product's longest side as a share of the canvas.
 * rotate — turn the whole set first (none need it today).
 * printmap — a separate print-area file; omitted ⇒ the product's own outline is the print area.
 */
const SETS = [
  // BUILT ON PRODIGI'S TEMPLATE (founder, 16 Nov 2026): the template's own sock outlines + heels, the photo's
  // knit fitted into them (its right sock turned over so the pair lies heels out) — composeFromTemplate
  { out: 'socks/ankle', product: 'ankle-socks.png', overlay: 'ankle-socks-heel.png', template: '../../templates/prodigi-ankle-socks-templates/prodigi-socks-ankle.png', fill: 0.8 },
  { out: 'socks/tube', product: 'tube-socks.png', fill: 0.82 },
  // LANDSCAPE, as photographed (founder) — its print is designed landscape (DESIGNED_TURNED)
  { out: 'teaTowel', product: 'tea-towel.png', overlay: 'tea-towel-fold.png', fill: 0.82 },
  { out: 'wrappingPaper', product: 'wrapping-paper-flat.png', overlay: 'wrapping-paper-roll.png', fill: 0.82 },
  { out: 'playingCards', product: 'playing-cards-base.png', printmap: 'playing-cards-print.png', fill: 0.8 },
  // ── Christmas (founder, 26 Oct) ──
  // the calendar: the hanging calendar, its top page is the print area
  { out: 'calendar', product: 'calendar.png', printmap: 'calendar-print.png', fill: 0.82 },
  // the sack laid flat: Prodigi's print panel is 320×500 mm on a 483 mm-wide sack, just above the bottom
  // seam — measured off the sack in the photo (no separate print map)
  { out: 'sack', product: 'sack.png', sackPanel: { sackWidthMm: 483, panelMm: { w: 320, h: 500 }, bottomInsetFrac: 0.06 }, fill: 0.84 },
  // ceramic disc: the print area IS the disc (glossy white under the art); the edge blur, then the gold
  // string, go on top
  { out: 'bauble/ceramic', productFromPrintmap: true, printmap: 'ceramic-print.png', overlays: ['ceramic-edgeblur.png', 'ceramic-string.png'], fill: 0.72 },
  // plastic ball: the print area is the ball; the glass highlights + chrome cap + string go on top
  { out: 'bauble/ball', productFromPrintmap: true, printmap: 'bauble-print.png', overlays: ['bauble-overlay.png'], fill: 0.8 },
  // ── the Apple Watch strap (founder's applewatch2.psd, 5 Nov 2026 — simpler): TWO layers. print = 'Printmap', the
  // two leather halves (what Prodigi prints) — the strap itself is that shape in white leather under the drawing;
  // overlay = 'Overlay', the buckle, the watch and the holes on top. Both sizes share it; the compositor lays each
  // size's print file onto the two halves HALF BY HALF from Prodigi's template (src/lib/watch-strap.ts strapBands).
  // keepOverlayDetail: the holes are tiny separate pieces the speck clean-up (despeckle) would delete.
  // stitch: the strap's EMBROIDERED edge (founder, 5 Nov — as on Prodigi's straps): small, close, quietly shaded
  // stitches a little in from the edge, round the buckle end and the tip, the sides running right up to the watch;
  // over the drawing, under the buckle and the watch. Canvas px (the strap is ~145 px ≈ 23 mm wide: ~6 px a mm).
  { out: 'watchStrap', productFromPrintmap: true, printmap: 'watch-strap-print.png', overlay: 'watch-strap-overlay.png', fill: 0.85, keepOverlayDetail: true, stitch: { inset: 10, dash: 8, gap: 5 } },
];

/** Load as RGBA raw, turned if asked. */
async function load(file, rotate) {
  const img = sharp(path.join(RAW, file)).ensureAlpha();
  const { data, info } = await (rotate ? img.rotate(rotate) : img).raw().toBuffer({ resolveWithObject: true });
  return { data, W: info.width, H: info.height };
}

/** Drop specks: alpha islands smaller than `minArea` px (stray pixels left by the cut-out). */
function despeckle({ data, W, H }, minArea = 400) {
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let start = 0; start < W * H; start++) {
    if (seen[start] || data[start * 4 + 3] <= 8) continue;
    const island = [];
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      island.push(i);
      const x = i % W, y = (i / W) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
        if (j >= 0 && !seen[j] && data[j * 4 + 3] > 8) { seen[j] = 1; stack.push(j); }
      }
    }
    if (island.length < minArea) for (const i of island) data[i * 4 + 3] = 0;
  }
  return { data, W, H };
}

function alphaBox({ data, W, H }) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (data[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/** Cut `box` out of a layer, scale it, and place it on the transparent canvas at (left, top). */
async function place(layer, box, scale, left, top) {
  const cut = await sharp(layer.data, { raw: { width: layer.W, height: layer.H, channels: 4 } })
    .extract({ left: box.x0, top: box.y0, width: box.x1 - box.x0, height: box.y1 - box.y0 })
    .resize(Math.round((box.x1 - box.x0) * scale), Math.round((box.y1 - box.y0) * scale), { kernel: 'lanczos3' })
    .png()
    .toBuffer();
  return sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: cut, left, top }])
    .png()
    .toBuffer();
}

async function alphaOf(png) {
  return sharp(png).ensureAlpha().extractChannel(3).raw().toBuffer();
}

/** A soft drop shadow + a tight contact shadow from the outline (black, real transparency). */
async function shadowFrom(alpha) {
  // extractChannel(0): sharp may hand a blurred 1-channel raw back with more channels.
  const blurred = async (sigma) => {
    const b = await sharp(alpha, { raw: { width: CANVAS, height: CANVAS, channels: 1 } }).blur(sigma).extractChannel(0).raw().toBuffer();
    if (b.length !== CANVAS * CANVAS) throw new Error(`shadow blur returned ${b.length} bytes, expected ${CANVAS * CANVAS}`);
    return b;
  };
  const [soft, contact] = await Promise.all([blurred(26), blurred(6)]);
  const passes = [
    { a: soft, dx: 10, dy: 22, k: 0.26 },
    { a: contact, dx: 2, dy: 5, k: 0.2 },
  ];
  const out = Buffer.alloc(CANVAS * CANVAS * 4); // rgb stays 0 (black)
  for (let y = 0; y < CANVAS; y++)
    for (let x = 0; x < CANVAS; x++) {
      let clear = 1;
      for (const p of passes) {
        const sx = x - p.dx, sy = y - p.dy;
        if (sx < 0 || sy < 0 || sx >= CANVAS || sy >= CANVAS) continue;
        clear *= 1 - (p.a[sy * CANVAS + sx] / 255) * p.k;
      }
      out[(y * CANVAS + x) * 4 + 3] = Math.round((1 - clear) * 255);
    }
  return sharp(out, { raw: { width: CANVAS, height: CANVAS, channels: 4 } }).png().toBuffer();
}

/** White where the source is opaque, with the source's alpha. */
async function whiteFrom(png) {
  const a = await alphaOf(png);
  return sharp({ create: { width: CANVAS, height: CANVAS, channels: 3, background: '#ffffff' } })
    .joinChannel(a, { raw: { width: CANVAS, height: CANVAS, channels: 1 } })
    .png()
    .toBuffer();
}

/** Layers stacked in order onto one (an edge blur, then a string on top of it). */
async function stack(files, rotate) {
  const layers = await Promise.all(files.map((f) => load(f, rotate)));
  const { W, H } = layers[0];
  const out = Buffer.from(layers[0].data);
  for (const l of layers.slice(1)) {
    if (l.W !== W || l.H !== H) throw new Error('overlays must share one canvas');
    for (let i = 0; i < W * H; i++) {
      const a = l.data[i * 4 + 3] / 255, b = out[i * 4 + 3] / 255;
      const o = a + b * (1 - a);
      for (let c = 0; c < 3; c++) out[i * 4 + c] = o ? Math.round((l.data[i * 4 + c] * a + out[i * 4 + c] * b * (1 - a)) / o) : 0;
      out[i * 4 + 3] = Math.round(o * 255);
    }
  }
  return { data: out, W, H };
}

/** The print map's shape, as a glossy-white product (a ceramic disc / plastic ball under the art). */
function whiteShape({ data, W, H }) {
  const out = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) { out[i * 4] = 248; out[i * 4 + 1] = 247; out[i * 4 + 2] = 244; out[i * 4 + 3] = data[i * 4 + 3]; }
  return { data: out, W, H };
}

/** The sack's print panel at true scale: measure the bag's body width (across 70 % of its height, below
 * the drawstrings), turn mm into px, centre the panel and sit it bottomInsetFrac above the bottom. */
async function sackPanel(productPng, spec) {
  const a = await alphaOf(productPng);
  let y0 = CANVAS, y1 = -1;
  for (let y = 0; y < CANVAS; y++) for (let x = 0; x < CANVAS; x++) if (a[y * CANVAS + x] > 128) { if (y < y0) y0 = y; if (y > y1) y1 = y; break; }
  const row = Math.round(y0 + (y1 - y0) * 0.7);
  let bx0 = CANVAS, bx1 = -1;
  for (let x = 0; x < CANVAS; x++) if (a[row * CANVAS + x] > 128) { if (x < bx0) bx0 = x; bx1 = x; }
  const pxPerMm = (bx1 - bx0 + 1) / spec.sackWidthMm;
  const w = Math.round(spec.panelMm.w * pxPerMm), h = Math.round(spec.panelMm.h * pxPerMm);
  const cx = (bx0 + bx1) / 2;
  const bottom = Math.round(y1 - (y1 - y0) * spec.bottomInsetFrac);
  const left = Math.round(cx - w / 2), top = bottom - h;
  const rect = await sharp({ create: { width: w, height: h, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
  return sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: rect, left, top }]).png().toBuffer();
}

/**
 * Turn the RIGHT-HAND piece of a pair (a sock) over, left to right, in place — with its on-top detail (the
 * heel) — and slide it right just far enough that the pair keeps the gap it had. The canvas grows to fit.
 * Pieces = the product's two largest opaque islands.
 */
function mirrorRightPiece(product, overlay) {
  const { W, H } = product;
  const { label, ids: [L, R] } = twoPieces(product);
  // each row's extent of the two pieces
  const lMax = new Int32Array(H).fill(-1), rMin = new Int32Array(H).fill(W);
  let rx0 = W, rx1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const l = label[y * W + x];
      if (l === L && x > lMax[y]) lMax[y] = x;
      if (l === R) { if (x < rMin[y]) rMin[y] = x; if (x < rx0) rx0 = x; if (x > rx1) rx1 = x; }
    }
  // the gap the pair had (closest rows), kept after the turn
  let gap = Infinity;
  for (let y = 0; y < H; y++) if (lMax[y] >= 0 && rMin[y] < W) gap = Math.min(gap, rMin[y] - lMax[y]);
  if (!Number.isFinite(gap)) gap = Math.round(W * 0.03);
  const flip = (x) => rx0 + rx1 - x;
  // the right piece's own mask, grown a little so its heel detail (overlay) goes with it
  const GROW = 12;
  const own = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (label[i] === R) own[i] = 1;
  const grown = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!own[y * W + x]) continue;
      for (let dy = -GROW; dy <= GROW; dy += 3) for (let dx = -GROW; dx <= GROW; dx += 3) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) grown[yy * W + xx] = 1;
      }
    }
  // how far right the turned piece must go to clear the left one by the same gap
  let shift = 0;
  for (let y = 0; y < H; y++) {
    if (lMax[y] < 0) continue;
    let m = W;
    for (let x = rx0; x <= rx1; x++) if (own[y * W + x]) m = Math.min(m, flip(x));
    if (m < W) shift = Math.max(shift, lMax[y] + gap - m);
  }
  const W2 = Math.max(W, rx1 + shift + GROW + 2);
  const turn = (layer, mine) => {
    const out = Buffer.alloc(W2 * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (mine[i]) continue;
        layer.data.copy(out, (y * W2 + x) * 4, i * 4, i * 4 + 4);
      }
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!mine[i]) continue;
        const nx = flip(x) + shift;
        if (nx >= 0 && nx < W2) layer.data.copy(out, (y * W2 + nx) * 4, i * 4, i * 4 + 4);
      }
    return { data: out, W: W2, H };
  };
  // the product: just the piece's own pixels; the overlay: the heel, which sits on (or just past) its edge
  const prodMine = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (grown[i] && label[i] !== L) prodMine[i] = 1;
  return { product: turn(product, prodMine), overlay: overlay ? turn(overlay, grown) : null };
}

/**
 * A sock set BUILT ON PRODIGI'S TEMPLATE (founder, 16 Nov 2026: "build our ankle socks off the Prodigi
 * template"). Prodigi's template is the print file itself, one sock's two sides side by side and mirrored.
 * So: its artboard is laid square on our canvas; its two sock outlines ARE the print map; its heel patches
 * are the heels (in the photo's black knit); and the founder's photo — the right sock turned over so the pair
 * lies heels out — is fitted into each outline for its knit and shading. artboard.json says where the
 * artboard sits: the seeder lays the WHOLE print file on exactly that rectangle, so the preview is the
 * template, one to one — nothing is estimated.
 */
async function composeFromTemplate(set, out) {
  // ── the template (Prodigi draws it in black at set alphas: the sock clear, the heel / toe patch ≈ 40 %,
  //    the board round it ≈ 30 %, the outline solid)
  const { data: td, info: ti } = await sharp(path.join(RAW, set.template)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const TW = ti.width, TH = ti.height, TC = ti.channels;
  const ta = (i) => td[i * TC + 3];
  const isSock = (a) => a < 10 || (a >= 95 && a <= 125);
  const isPatch = (a) => a >= 95 && a <= 125;
  const side = new Uint8Array(TW * TH); // 1 = the left side's sock, 2 = the right side's
  for (const [k, fx] of [[1, 0.25], [2, 0.75]]) {
    const sx = Math.round(TW * fx);
    let seed = -1;
    for (let y = Math.round(TH * 0.5); y < TH && seed < 0; y++) if (isSock(ta(y * TW + sx))) seed = y * TW + sx;
    if (seed < 0) throw new Error(`${out}: no sock found in the template's ${k === 1 ? 'left' : 'right'} half`);
    const stack = [seed];
    side[seed] = k;
    while (stack.length) {
      const i = stack.pop();
      const x = i % TW, y = (i / TW) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < TW - 1 ? i + 1 : -1, y > 0 ? i - TW : -1, y < TH - 1 ? i + TW : -1]) {
        if (j >= 0 && !side[j] && isSock(ta(j))) { side[j] = k; stack.push(j); }
      }
    }
  }
  // the artboard on the canvas, and each mask at that size (soft-edged by the resize)
  const scale = (set.fill * CANVAS) / Math.max(TW, TH);
  const aw = Math.round(TW * scale), ah = Math.round(TH * scale);
  const left = Math.round((CANVAS - aw) / 2), top = Math.round((CANVAS - ah) / 2 - CANVAS * 0.01);
  const maskAt = async (pick) => {
    const m = Buffer.alloc(TW * TH);
    for (let i = 0; i < TW * TH; i++) if (pick(i)) m[i] = 255;
    const small = await sharp(m, { raw: { width: TW, height: TH, channels: 1 } }).resize(aw, ah, { kernel: 'lanczos3' }).extractChannel(0).raw().toBuffer();
    const full = Buffer.alloc(CANVAS * CANVAS);
    for (let y = 0; y < ah; y++) small.copy(full, (y + top) * CANVAS + left, y * aw, (y + 1) * aw);
    return full;
  };
  const sockMask = [await maskAt((i) => side[i] === 1), await maskAt((i) => side[i] === 2)];
  // the heel = the patch in the upper half (the toe patch below still prints — on the photo the toe is white)
  const half = TW * Math.floor(TH / 2);
  const heelMask = [await maskAt((i) => side[i] === 1 && i < half && isPatch(ta(i))), await maskAt((i) => side[i] === 2 && i < half && isPatch(ta(i)))];

  // ── the photo, heels out
  let product = despeckle(await load(set.product));
  let overlay = set.overlay ? despeckle(await load(set.overlay)) : null;
  ({ product, overlay } = mirrorRightPiece(product, overlay));
  const { label, ids } = twoPieces(product);
  const PW = product.W, PH = product.H;

  const productOut = Buffer.alloc(CANVAS * CANVAS * 4);
  const overlayOut = Buffer.alloc(CANVAS * CANVAS * 4);
  for (let k = 0; k < 2; k++) {
    const id = ids[k];
    // this sock's pixels only, carried a little past the edge so the outline is always filled
    const own = Buffer.alloc(PW * PH * 4);
    let x0 = PW, x1 = -1;
    for (let i = 0; i < PW * PH; i++) {
      if (label[i] !== id) continue;
      // the photo's own heel (its dark knit) is left out — the template's heel patch is drawn instead
      const lum = 0.3 * product.data[i * 4] + 0.59 * product.data[i * 4 + 1] + 0.11 * product.data[i * 4 + 2];
      if (lum >= 150) product.data.copy(own, i * 4, i * 4, i * 4 + 4);
      const x = i % PW;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
    }
    // the heel's knit colour: the photo's heel (its solid middle), else a near-black
    const heelRgb = [0, 0, 0];
    let heelN = 0;
    if (overlay) {
      for (let i = 0; i < PW * PH; i++) {
        const x = i % PW;
        if (x < x0 - 20 || x > x1 + 20 || overlay.data[i * 4 + 3] < 240) continue;
        for (let c = 0; c < 3; c++) heelRgb[c] += overlay.data[i * 4 + c];
        heelN++;
      }
    }
    const heelBase = heelN ? heelRgb.map((v) => v / heelN) : [24, 22, 21];
    const ownFill = spread(own, PW, PH);
    // fit the template's sock onto the photo's: same centre + spread, then the turn (±60°, cuff up) that lands most of it on the sock
    const tpl = [], photo = [];
    for (let y = 0; y < CANVAS; y += 3) for (let x = 0; x < CANVAS; x += 3) if (sockMask[k][y * CANVAS + x] >= 128) tpl.push([x + 0.5, y + 0.5]);
    for (let y = 0; y < PH; y += 3) for (let x = 0; x < PW; x += 3) if (label[y * PW + x] === id) photo.push([x + 0.5, y + 0.5]);
    const M = fitAffine(tpl, photo, (x, y) => {
      const px = Math.round(x), py = Math.round(y);
      return px >= 0 && py >= 0 && px < PW && py < PH && label[py * PW + px] === id;
    });
    for (let y = 0; y < CANVAS; y++)
      for (let x = 0; x < CANVAS; x++) {
        const i = y * CANVAS + x;
        const sa = sockMask[k][i], ha = heelMask[k][i];
        if (!sa && !ha) continue;
        const [px, py] = M.at(x + 0.5, y + 0.5);
        const c = bilinear(ownFill, PW, PH, px - 0.5, py - 0.5);
        if (sa) {
          productOut[i * 4] = c[0]; productOut[i * 4 + 1] = c[1]; productOut[i * 4 + 2] = c[2];
          productOut[i * 4 + 3] = Math.max(productOut[i * 4 + 3], sa);
        }
        if (ha) {
          // the template's heel patch, exactly, in the heel's colour — shaded by the sock's own knit + folds
          const lum = Math.max(0.55, Math.min(1.25, (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 236));
          for (let ch = 0; ch < 3; ch++) overlayOut[i * 4 + ch] = Math.min(255, Math.round(heelBase[ch] * lum));
          overlayOut[i * 4 + 3] = Math.max(overlayOut[i * 4 + 3], ha);
        }
      }
    console.log(`${out.padEnd(14)} ${k ? 'right' : 'left'} side: the photo's knit fitted to the template's sock (${Math.round(M.fit * 1000) / 10}% overlap)`);
  }
  const raw4 = (b) => sharp(b, { raw: { width: CANVAS, height: CANVAS, channels: 4 } }).png().toBuffer();
  const productPng = await raw4(productOut);
  const overlayPng = await raw4(overlayOut);
  const printmapPng = await whiteFrom(productPng);
  const shadowPng = await shadowFrom(await alphaOf(productPng));
  const dir = path.join(OUT, out);
  mkdirSync(dir, { recursive: true });
  copyFileSync(BACKGROUND, path.join(dir, 'background.png'));
  await sharp(productPng).toFile(path.join(dir, 'product.png'));
  await sharp(printmapPng).toFile(path.join(dir, 'printmap.png'));
  await sharp(shadowPng).toFile(path.join(dir, 'shadow.png'));
  await sharp(overlayPng).toFile(path.join(dir, 'overlay.png'));
  // the rectangle the whole print file covers — the template's artboard (normalised)
  writeFileSync(path.join(dir, 'artboard.json'), JSON.stringify({ x0: left / CANVAS, y0: top / CANVAS, x1: (left + aw) / CANVAS, y1: (top + ah) / CANVAS }) + '\n');
  console.log(`${out.padEnd(14)} built on ${path.basename(set.template)}: artboard ${aw}×${ah} at (${left}, ${top})`);
}

/** The two largest opaque islands of a layer, left to right: their label map + ids. */
function twoPieces({ data, W, H }) {
  const label = new Int32Array(W * H).fill(-1);
  const comps = [];
  for (let start = 0; start < W * H; start++) {
    if (label[start] !== -1 || data[start * 4 + 3] <= 8) continue;
    const id = comps.length;
    let n = 0, sx = 0;
    const stack = [start];
    label[start] = id;
    while (stack.length) {
      const i = stack.pop();
      n++; sx += i % W;
      const x = i % W, y = (i / W) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
        if (j >= 0 && label[j] === -1 && data[j * 4 + 3] > 8) { label[j] = id; stack.push(j); }
      }
    }
    comps.push({ id, n, cx: sx / n });
  }
  const two = comps.sort((a, b) => b.n - a.n).slice(0, 2).sort((a, b) => a.cx - b.cx);
  if (two.length < 2) throw new Error('the product needs two separate pieces');
  return { label, ids: two.map((c) => c.id) };
}

/** Carry a cut-out's colours out past its edge: every pixel within `inset` px of the edge (the photo's own
 * darkened rim) or beyond takes the colour of the nearest solid pixel further in (a breadth-first fill), so a
 * shape laid a little wider than the photo is never blank and never streaked. */
function spread(rgba, W, H, inset = 8) {
  const solid = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (rgba[i * 4 + 3] >= 200) solid[i] = 1;
  // shrink the solid area by `inset` (row then column passes of a box)
  const rowOk = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    let run = 0;
    const r = new Int32Array(W);
    for (let x = 0; x < W; x++) { run = solid[y * W + x] ? run + 1 : 0; r[x] = run; }
    for (let x = 0; x < W; x++) {
      const xe = Math.min(W - 1, x + inset);
      rowOk[y * W + x] = r[xe] >= xe - Math.max(0, x - inset) + 1 ? 1 : 0;
    }
  }
  const core = new Uint8Array(W * H);
  for (let x = 0; x < W; x++) {
    let run = 0;
    const c = new Int32Array(H);
    for (let y = 0; y < H; y++) { run = rowOk[y * W + x] ? run + 1 : 0; c[y] = run; }
    for (let y = 0; y < H; y++) {
      const ye = Math.min(H - 1, y + inset);
      core[y * W + x] = c[ye] >= ye - Math.max(0, y - inset) + 1 ? 1 : 0;
    }
  }
  const out = Buffer.alloc(W * H * 4);
  const done = new Uint8Array(W * H);
  let queue = [];
  for (let i = 0; i < W * H; i++) {
    if (!core[i]) continue;
    rgba.copy(out, i * 4, i * 4, i * 4 + 3);
    out[i * 4 + 3] = 255;
    done[i] = 1;
    queue.push(i);
  }
  while (queue.length) {
    const next = [];
    for (const i of queue) {
      const x = i % W, y = (i / W) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
        if (j < 0 || done[j]) continue;
        out.copy(out, j * 4, i * 4, i * 4 + 4);
        done[j] = 1;
        next.push(j);
      }
    }
    queue = next;
  }
  return out;
}

function bilinear(buf, W, H, x, y) {
  const cx = Math.max(0, Math.min(W - 1.001, x)), cy = Math.max(0, Math.min(H - 1.001, y));
  const x0 = Math.floor(cx), y0 = Math.floor(cy), fx = cx - x0, fy = cy - y0;
  const at = (xx, yy, c) => buf[(yy * W + xx) * 4 + c];
  return [0, 1, 2].map((c) => Math.round(at(x0, y0, c) * (1 - fx) * (1 - fy) + at(x0 + 1, y0, c) * fx * (1 - fy) + at(x0, y0 + 1, c) * (1 - fx) * fy + at(x0 + 1, y0 + 1, c) * fx * fy));
}

/** The affine map from one shape's points onto another's: the same centre and spread (second moments),
 * turned (within ±60°) to where the most of the first lands inside the second (`inside`). Never mirrored. */
function fitAffine(from, to, inside) {
  const moments = (pts) => {
    let mx = 0, my = 0;
    for (const [x, y] of pts) { mx += x; my += y; }
    mx /= pts.length; my /= pts.length;
    let a = 0, b = 0, c = 0;
    for (const [x, y] of pts) { a += (x - mx) ** 2; b += (x - mx) * (y - my); c += (y - my) ** 2; }
    return { mx, my, a: a / pts.length, b: b / pts.length, c: c / pts.length };
  };
  const sqrtm = ({ a, b, c }) => { const s = Math.sqrt(Math.max(0, a * c - b * b)), t = Math.sqrt(a + c + 2 * s); return [[(a + s) / t, b / t], [b / t, (c + s) / t]]; };
  const inv = (m) => { const d = m[0][0] * m[1][1] - m[0][1] * m[1][0]; return [[m[1][1] / d, -m[0][1] / d], [-m[1][0] / d, m[0][0] / d]]; };
  const mul = (p, q) => [[p[0][0] * q[0][0] + p[0][1] * q[1][0], p[0][0] * q[0][1] + p[0][1] * q[1][1]], [p[1][0] * q[0][0] + p[1][1] * q[1][0], p[1][0] * q[0][1] + p[1][1] * q[1][1]]];
  const mf = moments(from), mt = moments(to);
  const St = sqrtm(mt), Sf = inv(sqrtm(mf));
  let best = null;
  for (let deg = -60; deg <= 60; deg += 0.5) {
    const r = (deg * Math.PI) / 180;
    const M = mul(mul(St, [[Math.cos(r), -Math.sin(r)], [Math.sin(r), Math.cos(r)]]), Sf);
    if (M[0][0] * M[1][1] - M[0][1] * M[1][0] <= 0) continue;
    let hit = 0;
    for (let k = 0; k < from.length; k += 2) {
      const dx = from[k][0] - mf.mx, dy = from[k][1] - mf.my;
      if (inside(M[0][0] * dx + M[0][1] * dy + mt.mx, M[1][0] * dx + M[1][1] * dy + mt.my)) hit++;
    }
    const fit = hit / Math.ceil(from.length / 2);
    if (!best || fit > best.fit) best = { M, fit };
  }
  const { M, fit } = best;
  return {
    fit,
    at: (x, y) => {
      const dx = x - mf.mx, dy = y - mf.my;
      return [M[0][0] * dx + M[0][1] * dy + mt.mx, M[1][0] * dx + M[1][1] * dy + mt.my];
    },
  };
}

const has = (f) => existsSync(path.join(RAW, f));
/** The raw files a set needs (all must be there, or it's skipped). */
const needs = (set) => [set.product, set.printmap, set.overlay, set.template, ...(set.overlays ?? [])].filter((f) => f && !(set.productFromPrintmap && f === set.product));

if (!existsSync(BACKGROUND)) throw new Error(`brand backdrop missing: ${BACKGROUND}`);
const only = process.argv[2];
for (const set of SETS) {
  if (only && !set.out.startsWith(only)) continue;
  const missing = needs(set).filter((f) => !has(f));
  if (missing.length) { console.log(`${set.out.padEnd(14)} skipped — waiting for ${missing.join(', ')} in ${RAW}`); continue; }
  await (set.template ? composeFromTemplate(set, set.out) : compose(set, set.out));
}

/**
 * STITCHING along each separate piece of a print area (a watch strap's two halves), a little in from the edge — a
 * fine dark thread with a soft light highlight, so it reads as embroidery over whatever is printed. It runs round the
 * piece's closed end (the buckle end, the rounded tip) but stays OPEN where two pieces face each other (the watch end
 * of each half): the two side lines run right up to that end, as on Prodigi's straps. The outline is eroded with a
 * round brush, so closed ends stay round; at an open end the piece is treated as carrying on, so the sides run to
 * its very edge. Returns a transparent canvas-sized PNG.
 */
async function stitchFrom(alpha, { inset, dash, gap }) {
  const W = CANVAS, H = CANVAS;
  const ext = []; // per row: [left, right] of the opaque area (null when empty)
  for (let y = 0; y < H; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < W; x++) if (alpha[y * W + x] >= 128) { if (l < 0) l = x; r = x; }
    ext.push(l < 0 ? null : [l, r]);
  }
  // the separate pieces, top to bottom (a few stray rows don't count)
  const pieces = [];
  for (let y = 0; y < H; y++) {
    if (!ext[y]) continue;
    if (pieces.length && pieces[pieces.length - 1].y1 === y - 1) pieces[pieces.length - 1].y1 = y;
    else pieces.push({ y0: y, y1: y });
  }
  const big = pieces.filter((p) => p.y1 - p.y0 > H * 0.05);
  const paths = [];
  big.forEach((p, k) => {
    // a piece is OPEN at the end that faces another piece (the watch end of a strap half)
    const openTop = k > 0, openBottom = k < big.length - 1;
    // (an open end's last few rows are a soft, anti-aliased edge — the strap's full width is taken from just inside it)
    const EDGE = 4;
    const at = (y) =>
      openTop && y < p.y0 + EDGE ? ext[p.y0 + EDGE] : openBottom && y > p.y1 - EDGE ? ext[p.y1 - EDGE] : y < p.y0 || y > p.y1 ? null : ext[y];
    const rows = [];
    for (let y = p.y0; y <= p.y1; y++) {
      let l = -Infinity, r = Infinity, ok = true;
      for (let dy = -inset; dy <= inset && ok; dy++) {
        const e = at(y + dy);
        if (!e) { ok = false; break; }
        const reach = Math.sqrt(inset * inset - dy * dy);
        l = Math.max(l, e[0] + reach); r = Math.min(r, e[1] - reach);
      }
      if (ok && r - l > 2) rows.push([y, l, r]);
    }
    if (rows.length < 5) return;
    const thin = rows.filter((_, i) => i % 3 === 0 || i === rows.length - 1);
    const pt = (x, y) => `${x.toFixed(1)} ${y}`;
    const left = thin.map(([y, l]) => pt(l, y)), right = thin.map(([y, , r]) => pt(r, y));
    if (openBottom && !openTop) paths.push(`M${[...left].reverse().join(' L')} L${right.join(' L')}`); // up the left, across the top, down the right
    else if (openTop && !openBottom) paths.push(`M${left.join(' L')} L${[...right].reverse().join(' L')}`); // down the left, round the tip, up the right
    else if (openTop && openBottom) paths.push(`M${left.join(' L')}`, `M${right.join(' L')}`); // just the two sides
    else paths.push(`M${left.join(' L')} L${[...right].reverse().join(' L')} Z`); // all the way round
  });
  const d = paths.join(' ');
  const line = (stroke, opacity, width, shift) =>
    `<path d="${d}" fill="none" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="${width}" stroke-dasharray="${dash} ${gap}" stroke-linecap="round" stroke-linejoin="round"${shift ? ` transform="translate(${shift} ${shift})"` : ''}/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    line('#fff', 0.38, 1.6, -0.7) + // the light catching the thread's top edge
    line('#1d1712', 0.36, 2.1, 0) + // the thread
    line('#fff', 0.18, 0.8, -0.5) + // a soft sheen along it
    `</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function compose(set, out) {
  const printmap = set.printmap ? despeckle(await load(set.printmap, set.rotate)) : null;
  const product = set.productFromPrintmap ? whiteShape(printmap) : despeckle(await load(set.product, set.rotate));
  const overlay = set.overlays ? await stack(set.overlays, set.rotate) : set.overlay ? (set.keepOverlayDetail ? await load(set.overlay, set.rotate) : despeckle(await load(set.overlay, set.rotate))) : null;
  for (const l of [overlay, printmap]) {
    if (l && (l.W !== product.W || l.H !== product.H)) throw new Error(`${set.out}: layers must share one canvas`);
  }

  // Frame on the union of everything visible (the overlay can poke past the product, e.g. a curl).
  const boxes = [alphaBox(product), overlay && alphaBox(overlay)].filter(Boolean);
  const box = { x0: Math.min(...boxes.map((b) => b.x0)), y0: Math.min(...boxes.map((b) => b.y0)), x1: Math.max(...boxes.map((b) => b.x1)), y1: Math.max(...boxes.map((b) => b.y1)) };
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  const scale = (set.fill * CANVAS) / Math.max(bw, bh);
  const left = Math.round((CANVAS - bw * scale) / 2);
  const top = Math.round((CANVAS - bh * scale) / 2 - CANVAS * 0.01); // a hair above centre, room for the shadow

  const productPng = await place(product, box, scale, left, top);
  let overlayPng = overlay ? await place(overlay, box, scale, left, top) : null;
  const printmapPng = set.sackPanel
    ? await sackPanel(productPng, set.sackPanel)
    : printmap ? await whiteFrom(await place(printmap, box, scale, left, top)) : await whiteFrom(productPng);
  // embroidered edge, under the founder's overlay (the buckle / watch sit on top of the thread)
  if (set.stitch) {
    const stitches = await stitchFrom(await alphaOf(printmapPng), set.stitch);
    overlayPng = overlayPng ? await sharp(stitches).composite([{ input: overlayPng }]).png().toBuffer() : stitches;
  }

  // Shadow from everything that sits on the table: the product, plus the overlay where it overhangs.
  const pa = await alphaOf(productPng);
  if (overlayPng) {
    const oa = await alphaOf(overlayPng);
    for (let i = 0; i < pa.length; i++) pa[i] = Math.max(pa[i], oa[i]);
  }
  const shadowPng = await shadowFrom(pa);

  const dir = path.join(OUT, out);
  mkdirSync(dir, { recursive: true });
  copyFileSync(BACKGROUND, path.join(dir, 'background.png'));
  await sharp(productPng).toFile(path.join(dir, 'product.png'));
  await sharp(printmapPng).toFile(path.join(dir, 'printmap.png'));
  await sharp(shadowPng).toFile(path.join(dir, 'shadow.png'));
  if (overlayPng) await sharp(overlayPng).toFile(path.join(dir, 'overlay.png'));
  console.log(`${out.padEnd(14)} product ${Math.round(bw * scale)}×${Math.round(bh * scale)} at (${left}, ${top})${set.rotate ? ` · turned ${set.rotate}°` : ''}${overlay ? ' · overlay' : ''}${printmap ? ' · own print area' : ''}`);
}
