import sharp from 'sharp';

/**
 * Test pictures for "keep the drawn frame" (founder, 26 Nov): a child's crayon drawing on white paper
 * with a HAND-DRAWN purple frame round the whole picture — suns tucked into its corners, brown hills
 * coloured right down to its bottom line — photographed on a wooden desk, on a carpet, or filling the
 * photo. Everything is drawn here (no real child's art in the repo).
 */

export const FRAME_PURPLE = '#7b4fb5';

/** A wobbly hand-drawn rectangle (deterministic, so tests are stable). */
function wobblyRect(x0: number, y0: number, x1: number, y1: number, seed = 1): string {
  const pts: string[] = [];
  const j = (i: number) => Math.sin(i * 0.37 + seed) * 2.5 + Math.sin(i * 0.11 + seed * 2) * 3;
  let i = 0;
  for (let x = x0; x <= x1; x += 14) pts.push(`${x},${y0 + j(i++)}`);
  for (let y = y0; y <= y1; y += 14) pts.push(`${x1 + j(i++)},${y}`);
  for (let x = x1; x >= x0; x -= 14) pts.push(`${x},${y1 + j(i++)}`);
  for (let y = y1; y >= y0; y -= 14) pts.push(`${x0 + j(i++)},${y}`);
  return `<polygon points="${pts.join(' ')}" fill="none" stroke="${FRAME_PURPLE}" stroke-width="6" stroke-linejoin="round"/>`;
}

const sun = (cx: number, cy: number, r: number) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#f2c230" stroke-width="5"/><circle cx="${cx}" cy="${cy}" r="${r * 0.45}" fill="none" stroke="#f2c230" stroke-width="4"/>` +
  Array.from({ length: 8 }, (_, k) => {
    const a = (k * Math.PI) / 4, c = Math.cos(a), s = Math.sin(a);
    return `<line x1="${cx + c * r * 1.3}" y1="${cy + s * r * 1.3}" x2="${cx + c * r * 1.9}" y2="${cy + s * r * 1.9}" stroke="#f2c230" stroke-width="4"/>`;
  }).join('');

/** The drawing on its sheet, as SVG body at (0,0)–(w,h): white paper, the frame ~4 % in, the picture. */
export function framedSheet(w: number, h: number): string {
  const fx = w * 0.04, fy = h * 0.04, fx1 = w - fx, fy1 = h - fy;
  const r = Math.min(w, h) * 0.05;
  const hills = `<polygon points="${fx},${fy1} ${fx},${fy1 - h * 0.08} ${w * 0.3},${fy1 - h * 0.1} ${w * 0.45},${fy1 - h * 0.17} ${w * 0.6},${fy1 - h * 0.08} ${w * 0.75},${fy1 - h * 0.16} ${fx1},${fy1 - h * 0.07} ${fx1},${fy1}" fill="#8b5a2b"/>`;
  const trees = [0.12, 0.2, 0.84, 0.9].map((t) => `<polygon points="${w * t},${fy1 - h * 0.2} ${w * t - 10},${fy1 - h * 0.1} ${w * t + 10},${fy1 - h * 0.1}" fill="#3e9b3a"/>`).join('');
  const plane = `<g transform="translate(${w / 2} ${h / 2}) rotate(-20)">
    <rect x="${-w * 0.2}" y="${-h * 0.05}" width="${w * 0.4}" height="${h * 0.1}" rx="${h * 0.04}" fill="#2f6fd0"/>
    <rect x="${-w * 0.04}" y="${-h * 0.22}" width="${w * 0.08}" height="${h * 0.44}" rx="8" fill="#2f6fd0"/>
    <circle cx="${w * 0.07}" cy="${-h * 0.1}" r="${r * 0.6}" fill="#d43a2a"/><circle cx="${w * 0.07}" cy="${h * 0.1}" r="${r * 0.6}" fill="#d43a2a"/></g>`;
  return `<rect width="${w}" height="${h}" fill="#f7f6f1"/>` +
    sun(fx + r * 2.1, fy + r * 2.1, r) + sun(fx1 - r * 2.1, fy + r * 2.1, r) + sun(w / 2, fy + r * 2.4, r * 0.8) +
    hills + trees + plane + wobblyRect(fx, fy, fx1, fy1);
}

const wood = (w: number, h: number) =>
  `<rect width="${w}" height="${h}" fill="#9a6a40"/>` + Array.from({ length: Math.ceil(h / 12) }, (_, i) => `<rect x="0" y="${i * 12}" width="${w}" height="5" fill="#7a4e2d" opacity="0.6"/>`).join('');

const svg = (w: number, h: number, body: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`);

export type Surface = 'wood' | 'carpet';

/** A blue-grey carpet: speckled noise (deterministic). */
async function carpet(w: number, h: number): Promise<Buffer> {
  const out = Buffer.alloc(w * h * 3);
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let k = 0; k < w * h; k++) {
    const n = (rnd() + rnd() + rnd() - 1.5) * 50;
    out[k * 3] = Math.max(0, Math.min(255, 96 + n));
    out[k * 3 + 1] = Math.max(0, Math.min(255, 106 + n));
    out[k * 3 + 2] = Math.max(0, Math.min(255, 128 + n));
  }
  return sharp(out, { raw: { width: w, height: h, channels: 3 } }).blur(0.7).png().toBuffer();
}

/**
 * The framed drawing photographed on a surface. `sheet` = where the paper lies, in photo pixels
 * (it may run off the photo's edge — e.g. only the desk at the top shows).
 */
export async function framedOnSurface(
  surface: Surface,
  opts: { W?: number; H?: number; sheet?: { x: number; y: number; w: number; h: number } } = {},
): Promise<Buffer> {
  const W = opts.W ?? 900, H = opts.H ?? 700;
  const sh = opts.sheet ?? { x: 110, y: 80, w: 680, h: 540 };
  const bg = surface === 'wood' ? await sharp(svg(W, H, wood(W, H))).png().toBuffer() : await carpet(W, H);
  const paper = await sharp(svg(sh.w, sh.h, framedSheet(sh.w, sh.h))).png().toBuffer();
  // the paper may hang off the photo: crop what's outside
  const left = Math.max(0, -sh.x), top = Math.max(0, -sh.y);
  const vw = Math.min(sh.w - left, W - Math.max(0, sh.x)), vh = Math.min(sh.h - top, H - Math.max(0, sh.y));
  const visible = await sharp(paper).extract({ left, top, width: vw, height: vh }).png().toBuffer();
  return sharp(bg).composite([{ input: visible, left: Math.max(0, sh.x), top: Math.max(0, sh.y) }]).png().toBuffer();
}

/** The framed drawing filling the whole photo (the founder's upload: no desk at all). */
export function framedFillingPhoto(W = 800, H = 800): Promise<Buffer> {
  return sharp(svg(W, H, framedSheet(W, H))).png().toBuffer();
}

/** Purple-frame pixels within `band` (fraction) of each edge of an image: share of rows/columns that show it. */
export async function frameOnEachSide(img: Buffer, band = 0.1): Promise<{ top: number; bottom: number; left: number; right: number }> {
  const { data, info } = await sharp(img).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const isPurple = (x: number, y: number) => {
    const k = (y * W + x) * 3, r = data[k]!, g = data[k + 1]!, b = data[k + 2]!;
    return b > g + 40 && r > g + 15 && g < 150;
  };
  const bw = Math.round(W * band), bh = Math.round(H * band);
  // share of columns (rows) along the side where the band holds a purple pixel
  const side = (n: number, depth: number, at: (t: number, i: number) => [number, number]) => {
    let hit = 0, seen = 0;
    for (let t = Math.round(n * 0.15); t < n * 0.85; t += 3) {
      seen++;
      for (let i = 0; i < depth; i++) { const [x, y] = at(t, i); if (isPurple(x, y)) { hit++; break; } }
    }
    return hit / seen;
  };
  return {
    top: side(W, bh, (t, i) => [t, i]),
    bottom: side(W, bh, (t, i) => [t, H - 1 - i]),
    left: side(H, bw, (t, i) => [i, t]),
    right: side(H, bw, (t, i) => [W - 1 - i, t]),
  };
}
