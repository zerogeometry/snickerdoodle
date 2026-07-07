import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { printTemplates, products, productVariants } from '@/db/schema';
import { requireJobsSecret } from '@/server/jobs/auth';
import { setMockupTemplate } from '@/server/print/templates';

/**
 * DEV template seeder — authors FLAT photoreal mockup templates for the launch range from the
 * Prodigi blank product photos staged in `.prodigi-assets/blanks/` (gitignored). Idempotent
 * (re-authoring bumps the template version). Guarded by JOBS_SECRET like the other jobs.
 *
 * REGISTRATION MODEL (founder requirement: preview "the" image on "your" product, not "an"
 * image on "a" product). The print map on the photo is DERIVED from the same four inputs a
 * print shop uses, never eyeballed:
 *   1. the product photo (blank),
 *   2. the product's physical dimensions (Prodigi spec),
 *   3. the product's extent in the photo (detected → px-per-mm scale),
 *   4. the print guide (the variant's print_template — Prodigi's official artwork canvas).
 *
 * Every flat quad is ASPECT-LOCKED to its variant's print canvas. Because the compositor and
 * the print renderer share the same cover-fit + transform maths, aspect lock makes the preview
 * crop EQUAL the print crop — what you see is what Prodigi prints. Modes:
 *   - window-cover: framed prints — the print covers the frame's detected opening (art runs
 *     under the moulding on one axis, exactly like a real framed print). Per-SIZE aspect.
 *   - face-cover: all-over products (cushions, jigsaw, blanket, bauble) — the print covers the
 *     product face; the silhouette mask clips to the true shape.
 *   - panel-physical: the print panel at TRUE mm scale + position via px-per-mm (sack).
 *   - panel-contain: aspect-locked panel inside a stated region (apron — physical offsets
 *     pending Prodigi's apron spec).
 *   - band: the mug — a cylinder can't be honestly flattened in the FLAT tier; the preview
 *     shows the front band at true print HEIGHT scale, width unlocked (the Studio positioner
 *     remains exact on the full 209×98mm wrap). PERSPECTIVE tier will close this.
 *
 * Products without any blank (giftWrap) are skipped and keep the SVG tile. Garments (tees,
 * bodysuit), the card and the storybook use DERIVED/synthetic flat-lays until real photography.
 */

const ROOT = path.join(process.cwd(), '.prodigi-assets', 'blanks');
const DETECT_EDGE = 1200; // detection + mask working resolution

type Quad = [number, number][];
type Material = 'PAPER' | 'LIGHT_FABRIC' | 'DARK_FABRIC' | 'CERAMIC' | 'GLOSS';
type Box = { x0: number; y0: number; x1: number; y1: number };
type Plan = { rotate?: 90 } & (
  | { file: string; material: Material; register: 'window-cover' }
  | { file: string; material: Material; register: 'face-cover'; mask: boolean }
  | { file: string; material: Material; register: 'panel-physical'; mask: boolean; productWidthMm: number; bottomInsetFrac: number }
  | { file: string; material: Material; register: 'panel-contain'; mask: boolean; region: Box; frame?: 'bbox' | 'canvas' }
  | { file: string; material: Material; register: 'band'; mask: boolean; region: Box }
  | { file?: undefined; material: Material; register: 'layered-frame'; dir: string; orientation: 'portrait' | 'landscape' }
  | { file?: undefined; material: Material; register: 'layered-jigsaw'; dir: string; orientation: 'portrait' | 'landscape' }
);

// Founder-authored LAYER drops (background / product / shadow on one canvas, the frame's
// aperture cut transparent in product.png) — preferred over the flat Prodigi blank when
// present. The layer order composited here is the founder's spec: background → shadow →
// paper → [the child's print, clipped to the aperture at render time] → frame.
const LAYERED = path.join(ROOT, 'layered');
function layeredFrameDir(colour: string): string | null {
  const dir = path.join(LAYERED, 'framedPrint', colour.replace(/\s+/g, '-'));
  const has = (f: string) => existsSync(path.join(dir, f));
  return has('background.png') && has('product.png') && has('shadow.png') ? dir : null;
}

// Founder-authored JIGSAW layers, per piece-count (30/110/252): background → shadow →
// printquad (the white board at true dimensions, transparent surround) → puzzlelines (the
// die-cut piece lines that sit OVER the art). The board layer does double duty: its opaque
// region is the print quad AND the silhouette mask; the piece lines become the compositor's
// foreground overlay. Native LANDSCAPE; portrait is the same drop rotated 90°.
function layeredJigsawDir(pieces: string): string | null {
  const dir = path.join(LAYERED, 'jigsaw', pieces);
  const has = (f: string) => existsSync(path.join(dir, f));
  return has('background.png') && has('shadow.png') && has('printquad.png') && has('puzzlelines.png') ? dir : null;
}

const FRAME: Record<string, string> = {
  gold: 'prodigi-classic-frame-blanks/Gold Classic Frame_blank.png',
  black: 'prodigi-classic-frame-blanks/Black classic frame_blank.png',
  white: 'prodigi-classic-frame-blanks/White classic frame_blank.png',
  natural: 'prodigi-classic-frame-blanks/Natural classic frame_blank.png',
  brown: 'prodigi-classic-frame-blanks/Brown classic frame_blank.jpg',
  'dark grey': 'prodigi-classic-frame-blanks/Dark grey classic frame_blank.jpg',
  'light grey': 'prodigi-classic-frame-blanks/Light grey classic frame_blank.jpg',
  silver: 'prodigi-classic-frame-blanks/Silver Classic Frame_blank.png',
};
const JIG = 'prodigi-jigsaw-puzzle-blank-assets/Prodigi Jigsaw blanks';

function plan(key: string, attrs: Record<string, string>): Plan | null {
  const size = attrs.size ?? '';
  const colour = attrs.colour ?? '';
  switch (key) {
    case 'framedPrint': {
      const orientation = attrs.orientation === 'landscape' ? 'landscape' : 'portrait';
      const dir = layeredFrameDir(colour);
      if (dir) return { material: 'PAPER', register: 'layered-frame', dir, orientation };
      // Flat-blank fallback: the generic rotate flag turns the portrait photo 90°.
      return FRAME[colour]
        ? { file: FRAME[colour], material: 'PAPER', register: 'window-cover', ...(orientation === 'landscape' ? { rotate: 90 as const } : {}) }
        : null;
    }
    case 'cushion': {
      const file = size === 'heart' ? 'Heart Cushion Blank 1.jpg' : size === '18″ round' ? 'Round cushion blank.jpg' : 'Cushion blank.jpg';
      return { file: `prodigi-cushions-blank-assets/${file}`, material: 'LIGHT_FABRIC', register: 'face-cover', mask: true };
    }
    case 'jigsaw': {
      const pieces = size.startsWith('252') ? '252' : size.startsWith('110') ? '110' : '30';
      const orientation = attrs.orientation === 'portrait' ? 'portrait' : 'landscape';
      const dir = layeredJigsawDir(pieces);
      // Preferred: the founder's authored layers (board + real die-cut piece lines on top).
      if (dir) return { material: 'PAPER', register: 'layered-jigsaw', dir, orientation };
      // Flat-photo fallback (no piece lines): the landscape Prodigi photo, rotated for portrait.
      const f = pieces === '252' ? 'Prodigi jigsaw 252 pcs.jpg' : pieces === '110' ? 'Prodigi jigsaw 110 pcs.jpg' : 'Prodigi jigsaw 30 pcs.jpg';
      return { file: `${JIG}/${f}`, material: 'PAPER', register: 'face-cover', mask: false, ...(orientation === 'portrait' ? { rotate: 90 as const } : {}) };
    }
    case 'blanket': // photo is landscape but the print canvas is PORTRAIT (600×1000mm) → rotate the blank to match
      return { file: 'prodigi-fleece-blanket-blank-asset/Prodigi Fleece Blanket blank.jpg', material: 'LIGHT_FABRIC', register: 'face-cover', mask: false, rotate: 90 };
    case 'calendar': // page photo is portrait; our calendar canvas is LANDSCAPE (297×210) → rotate to match
      return { file: 'prodigi-calendar-blank-assets/Blank Calendars/calendar blank.png', material: 'PAPER', register: 'face-cover', mask: false, rotate: 90 };
    case 'storybook': // derived from Prodigi's hardcover photo-book back shot (thumbnails in-painted, portrait crop)
      return { file: 'derived/storybook-blank.jpg', material: 'PAPER', register: 'face-cover', mask: false };
    case 'card': // interim studio synth (flat 7×5 card, soft shadow) until real photography
      return { file: 'derived/card-blank.png', material: 'PAPER', register: 'face-cover', mask: true };
    case 'bauble':
      return { file: 'prodigi-ceramic-christmas-tree-ornament-blank-asset/Prodigi-ceramic-christmas-ornament-blank.jpg', material: 'CERAMIC', register: 'face-cover', mask: true };
    case 'sack': // official panel 320×500mm on a 19×30″ (483mm-wide) sack, above the bottom seam
      return { file: 'prodigi-christmas-sack-blank-asset/Prodigi-Christmas-Sack blank.jpg', material: 'LIGHT_FABRIC', register: 'panel-physical', mask: true, productWidthMm: 483, bottomInsetFrac: 0.06 };
    case 'apron': // chest-to-hem centre panel; aspect locked to the print canvas, offsets pending official spec
      return { file: 'prodigi-apron-blank-asset/Prodigi-Apron-blank.jpg', material: 'LIGHT_FABRIC', register: 'panel-contain', mask: false, region: { x0: 0.24, y0: 0.38, x1: 0.76, y1: 0.92 } };
    // Garments: REAL Prodigi packshots (founder call 2026-07-07 — standard flat photo, 2D
    // composite; the drawn silhouettes are gone). Blanks derived by
    // scripts/derive-garment-photo-blanks.mjs (white from the coloured packshot's dominant
    // channel, cropped to the garment) — which MEASURES the torso and emits these region
    // fractions: print at its true physical ratio (kids 260mm on the 330mm 3-4y torso =
    // 78.8%; adult 396mm on 555mm M = 71.4%, same photo; bodysuit capped at 80% pending
    // the Rabbit Skins chart). Re-run the script if the sources change.
    case 'kidsTee':
      return { file: 'derived/tee-photo.png', material: 'LIGHT_FABRIC', register: 'panel-contain', mask: false, frame: 'canvas', region: { x0: 0.314, y0: 0.272, x1: 0.683, y1: 0.703 } };
    case 'adultTee':
      return { file: 'derived/tee-photo.png', material: 'LIGHT_FABRIC', register: 'panel-contain', mask: false, frame: 'canvas', region: { x0: 0.332, y0: 0.272, x1: 0.666, y1: 0.7 } };
    case 'babyBodysuit':
      return { file: 'derived/bodysuit-photo.png', material: 'LIGHT_FABRIC', register: 'panel-contain', mask: false, frame: 'canvas', region: { x0: 0.316, y0: 0.264, x1: 0.683, y1: 0.762 } };
    case 'mug': // cylinder: a near-square decal CENTRED on the visible front face (founder call:
      // clarity over wrap fidelity on the tile; the Studio positioner stays exact on the wrap).
      // NO mask: the white body reads as background locally (white-on-light-grey), so the
      // silhouette bites into the decal — and the panel sits fully inside the body anyway.
      return { file: 'prodigi-11oz-mug-blank-asset/Prodigi 11oz Mug blank.png', material: 'CERAMIC', register: 'band', mask: false, region: { x0: 0.11, y0: 0.25, x1: 0.57, y1: 0.75 } };
    default:
      return null; // giftWrap (no print) → keep SVG
  }
}

/**
 * Founder-layered frame → a standard (blank, mask, window) triple. The aperture is the
 * ENCLOSED transparent region of product.png (flood the outside in from the border; what
 * remains transparent is the window — exact, no heuristics). The stored blank composites
 * background → shadow → white paper (over the window, tucked under the moulding) →
 * product; the mask clips the child's print to the aperture, so it renders UNDER the
 * frame edge exactly as the physical print sits in the rebate.
 */
const layeredCache = new Map<string, { blank: Buffer; mask: Buffer; window: Box; W: number; H: number }>();
async function layeredFrame(dir: string, orientation: 'portrait' | 'landscape' = 'portrait'): Promise<{ blank: Buffer; mask: Buffer; window: Box; W: number; H: number }> {
  // Cache on the layers' mtimes, not just the dir — the founder iterates on these
  // files, and a long-lived dev server must never serve a stale derivation.
  const files = ['background.png', 'product.png', 'shadow.png'];
  const key = dir + '|' + orientation + '|' + files.map((f) => statSync(path.join(dir, f)).mtimeMs).join('|');
  const hit = layeredCache.get(key);
  if (hit) return hit;
  const product = readFileSync(path.join(dir, 'product.png'));
  const { data, info } = await sharp(product).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: c } = info;

  // The PRODUCT layer is the canvas authority. The shadow must match it exactly
  // (their registration is the alignment that matters); the background is a flat
  // backdrop, so a size mismatch there is cover-fitted rather than rejected.
  const shadowMeta = await sharp(readFileSync(path.join(dir, 'shadow.png'))).metadata();
  if (shadowMeta.width !== W || shadowMeta.height !== H) {
    throw new Error(`layered frame ${dir}: shadow.png is ${shadowMeta.width}x${shadowMeta.height} but product.png is ${W}x${H} — re-export on one canvas`);
  }

  // Flood the OUTSIDE transparent area in from the borders; enclosed transparency = aperture.
  const transparent = (p: number) => data[p * c + 3]! < 128;
  const outside = new Uint8Array(W * H);
  const queue: number[] = [];
  const push = (x: number, y: number) => {
    const p = y * W + x;
    if (!outside[p] && transparent(p)) { outside[p] = 1; queue.push(p); }
  };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (queue.length) {
    const p = queue.pop()!;
    const x = p % W, y = (p - x) / W;
    if (x > 0) push(x - 1, y);
    if (x < W - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < H - 1) push(x, y + 1);
  }
  const maskRaw = Buffer.alloc(W * H);
  let mx0 = W, my0 = H, mx1 = -1, my1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (transparent(p) && !outside[p]) {
        maskRaw[p] = 255;
        if (x < mx0) mx0 = x;
        if (x > mx1) mx1 = x;
        if (y < my0) my0 = y;
        if (y > my1) my1 = y;
      }
    }
  if (mx1 < 0) throw new Error(`layered frame ${dir}: product.png has no enclosed transparent aperture`);
  const mask = await sharp(maskRaw, { raw: { width: W, height: H, channels: 1 } }).png().toBuffer();

  // White paper over the aperture, inflated ~1.5% so its edge hides under the moulding.
  const inflate = Math.round(0.015 * Math.min(W, H));
  const px = Math.max(0, mx0 - inflate);
  const py = Math.max(0, my0 - inflate);
  const paper = await sharp({
    create: { width: Math.min(W - px, mx1 - mx0 + 1 + 2 * inflate), height: Math.min(H - py, my1 - my0 + 1 + 2 * inflate), channels: 3, background: '#ffffff' },
  }).png().toBuffer();

  const backdrop = await sharp(readFileSync(path.join(dir, 'background.png')))
    .flatten({ background: '#ffffff' }) // a transparent backdrop must not read as black
    .resize(W, H, { fit: 'cover' }) // cover-fit to the product canvas (flat backdrop — safe)
    .toBuffer();
  const blank = await sharp(backdrop)
    .composite([
      { input: readFileSync(path.join(dir, 'shadow.png')), left: 0, top: 0 },
      { input: paper, left: px, top: py },
      { input: product, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();

  let out = { blank, mask, window: { x0: mx0 / W, y0: my0 / H, x1: (mx1 + 1) / W, y1: (my1 + 1) / H }, W, H };

  // LANDSCAPE: the same frame hung on its side — rotate the derived blank + mask 90°
  // clockwise and carry the window box into the rotated space. The print canvas of a
  // landscape variant is already swapped (356×279), so the quad aspect-locks onto it.
  if (orientation === 'landscape') {
    const w = out.window;
    out = {
      blank: await sharp(out.blank).rotate(90).png().toBuffer(),
      mask: await sharp(out.mask).rotate(90).png().toBuffer(),
      window: { x0: 1 - w.y1, y0: w.x0, x1: 1 - w.y0, y1: w.x1 },
      W: out.H,
      H: out.W,
    };
  }
  layeredCache.set(key, out);
  return out;
}

/**
 * Founder-layered jigsaw → a (blank, mask, overlay, window) bundle. The board layer
 * (printquad.png: a white board on a transparent surround, at the print's true dimensions)
 * is the registration authority: its OPAQUE region is both the print quad (where the art
 * lands) and the silhouette mask (so the art clips to the board's shape). The stored blank
 * composites background → shadow → white board; puzzlelines.png becomes the foreground
 * overlay the compositor lays OVER the art (the die-cut lines the drawing reads through).
 * PORTRAIT is the same drop rotated 90° — the print canvas is already swapped, so the quad
 * aspect-locks onto it (mirrors layeredFrame's landscape branch).
 */
const layeredJigCache = new Map<string, { blank: Buffer; mask: Buffer; overlay: Buffer; window: Box; W: number; H: number }>();
async function layeredJigsaw(dir: string, orientation: 'portrait' | 'landscape'): Promise<{ blank: Buffer; mask: Buffer; overlay: Buffer; window: Box; W: number; H: number }> {
  const files = ['background.png', 'shadow.png', 'printquad.png', 'puzzlelines.png'];
  const key = dir + '|' + orientation + '|' + files.map((f) => statSync(path.join(dir, f)).mtimeMs).join('|');
  const hit = layeredJigCache.get(key);
  if (hit) return hit;

  // The BOARD layer is the canvas authority: opaque region = print quad AND silhouette mask.
  const boardPng = readFileSync(path.join(dir, 'printquad.png'));
  const { data, info } = await sharp(boardPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: c } = info;
  const maskRaw = Buffer.alloc(W * H);
  let mx0 = W, my0 = H, mx1 = -1, my1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * c + 3]! >= 128) {
        maskRaw[y * W + x] = 255;
        if (x < mx0) mx0 = x;
        if (x > mx1) mx1 = x;
        if (y < my0) my0 = y;
        if (y > my1) my1 = y;
      }
    }
  if (mx1 < 0) throw new Error(`layered jigsaw ${dir}: printquad.png has no opaque board region`);
  const mask = await sharp(maskRaw, { raw: { width: W, height: H, channels: 1 } }).png().toBuffer();

  // Shadow + piece lines MUST share the board's canvas (their registration IS the alignment
  // that sells it); the background is a flat backdrop, so a size mismatch there is cover-fit.
  for (const f of ['shadow.png', 'puzzlelines.png']) {
    const m = await sharp(readFileSync(path.join(dir, f))).metadata();
    if (m.width !== W || m.height !== H) {
      throw new Error(`layered jigsaw ${dir}: ${f} is ${m.width}x${m.height} but printquad.png is ${W}x${H} — re-export on one canvas`);
    }
  }

  const backdrop = await sharp(readFileSync(path.join(dir, 'background.png')))
    .flatten({ background: '#ffffff' }) // a transparent backdrop must not read as black
    .resize(W, H, { fit: 'cover' })
    .toBuffer();
  const blank = await sharp(backdrop)
    .composite([
      { input: readFileSync(path.join(dir, 'shadow.png')), left: 0, top: 0 },
      { input: boardPng, left: 0, top: 0 }, // the white board is the print surface
    ])
    .png()
    .toBuffer();
  const overlay = await sharp(readFileSync(path.join(dir, 'puzzlelines.png'))).png().toBuffer();

  let out = { blank, mask, overlay, window: { x0: mx0 / W, y0: my0 / H, x1: (mx1 + 1) / W, y1: (my1 + 1) / H }, W, H };

  // PORTRAIT: the same board turned 90° — rotate blank + mask + overlay and carry the window
  // box into the rotated space (the portrait variant's print canvas is already swapped).
  if (orientation === 'portrait') {
    const w = out.window;
    out = {
      blank: await sharp(out.blank).rotate(90).png().toBuffer(),
      mask: await sharp(out.mask).rotate(90).png().toBuffer(),
      overlay: await sharp(out.overlay).rotate(90).png().toBuffer(),
      window: { x0: 1 - w.y1, y0: w.x0, x1: 1 - w.y0, y1: w.x1 },
      W: out.H,
      H: out.W,
    };
  }
  layeredJigCache.set(key, out);
  return out;
}

/**
 * The print WINDOW on a framed-print blank → normalised bbox. Preferred: the transparent hole
 * (exact). Fallback (frames shipped with an opaque white window): walk OUT from the centre until
 * the colour breaks from the window's own colour for a sustained run — the inner moulding edge —
 * with an adaptive threshold (a white moulding on a white shot barely deviates) and symmetric
 * mirroring if one side still fails (these product shots centre the frame).
 */
async function frameWindow(buf: Buffer): Promise<Box> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: c } = info;

  let minX = W, minY = H, maxX = -1, maxY = -1;
  const step = Math.max(1, Math.floor(Math.min(W, H) / 800));
  for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
    if (data[(y * W + x) * c + (c - 1)]! < 128) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX >= 0) return { x0: minX / W, y0: minY / H, x1: maxX / W, y1: maxY / H };

  const px = (x: number, y: number) => { const i = (y * W + x) * c; return [data[i]!, data[i + 1]!, data[i + 2]!] as const; };
  const [cr, cg, cb] = px(Math.round(W / 2), Math.round(H / 2));
  const run = Math.max(3, Math.round(Math.min(W, H) * 0.004));
  const scan = (dx: number, dy: number, thresh: number): number | null => {
    let x = Math.round(W / 2), y = Math.round(H / 2), streak = 0, steps = 0;
    while (x > 0 && x < W - 1 && y > 0 && y < H - 1) {
      x += dx; y += dy; steps++;
      const [r, g, b] = px(x, y);
      streak = Math.abs(r - cr) + Math.abs(g - cg) + Math.abs(b - cb) > thresh ? streak + 1 : 0;
      if (streak >= run) return steps - run;
    }
    return null;
  };
  const edge = (dx: number, dy: number): number | null => {
    for (const thresh of [90, 45, 24]) { const s = scan(dx, dy, thresh); if (s !== null) return s; }
    return null;
  };
  let L = edge(-1, 0), R = edge(1, 0), T = edge(0, -1), B = edge(0, 1);
  L = L ?? R; R = R ?? L; T = T ?? B; B = B ?? T;
  if (L === null || T === null) return { x0: 0.15, y0: 0.15, x1: 0.85, y1: 0.85 };
  return { x0: (W / 2 - L) / W, y0: (H / 2 - T) / H, x1: (W / 2 + R!) / W, y1: (H / 2 + B!) / H };
}

/**
 * Detect the product on a clean-background blank: flood-fill BACKGROUND in from the border
 * (pixels within `thresh` of the corner-sampled bg colour), everything unreached = product.
 * The flood makes white-on-white interiors solid (enclosed regions are never reached).
 */
async function detectProduct(buf: Buffer, thresh = 18): Promise<{ bbox: Box; mask: Buffer; coverage: number }> {
  const img = sharp(buf).flatten({ background: '#ffffff' }).resize(DETECT_EDGE, DETECT_EDGE, { fit: 'inside', withoutEnlargement: true });
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: c } = info;

  let br = 0, bg = 0, bb = 0, n = 0;
  for (const [cx, cy] of [[0, 0], [W - 8, 0], [0, H - 8], [W - 8, H - 8]] as const) {
    for (let y = cy; y < cy + 8; y++) for (let x = cx; x < cx + 8; x++) { const i = (y * W + x) * c; br += data[i]!; bg += data[i + 1]!; bb += data[i + 2]!; n++; }
  }
  br /= n; bg /= n; bb /= n;
  const isBgColour = (i: number) => Math.abs(data[i]! - br) + Math.abs(data[i + 1]! - bg) + Math.abs(data[i + 2]! - bb) <= thresh * 3;

  const visited = new Uint8Array(W * H);
  const queue: number[] = [];
  const push = (x: number, y: number) => { const p = y * W + x; if (!visited[p] && isBgColour(p * c)) { visited[p] = 1; queue.push(p); } };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (queue.length) {
    const p = queue.pop()!;
    const x = p % W, y = (p - x) / W;
    if (x > 0) push(x - 1, y);
    if (x < W - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < H - 1) push(x, y + 1);
  }

  const maskRaw = Buffer.alloc(W * H);
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x;
    if (!visited[p]) { maskRaw[p] = 255; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX < 0) { minX = 0; minY = 0; maxX = W - 1; maxY = H - 1; maskRaw.fill(255); }

  // Erode slightly (blur → high threshold) so the clip sits just INSIDE the true edge.
  const mask = await sharp(maskRaw, { raw: { width: W, height: H, channels: 1 } }).blur(2).threshold(200).png().toBuffer();
  let productPx = 0;
  for (let i = 0; i < maskRaw.length; i++) if (maskRaw[i]) productPx++;
  const bboxArea = Math.max(1, (maxX - minX + 1) * (maxY - minY + 1));
  return { bbox: { x0: minX / W, y0: minY / H, x1: (maxX + 1) / W, y1: (maxY + 1) / H }, mask, coverage: productPx / bboxArea };
}

/** Keep a derived box inside the photo: translate in if it fits, else shrink about its centre
 * (aspect preserved). A face-cover on a tightly-cropped blank can overshoot by a few % — losing
 * that sliver beats rejecting the template (the quad ASPECT, which preview==print rides on,
 * is untouched). */
function fitWithin01(b: Box): Box {
  let { x0, y0, x1, y1 } = b;
  const w = x1 - x0, h = y1 - y0;
  const scale = Math.min(1, 1 / w, 1 / h);
  if (scale < 1) {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    x0 = cx - (w * scale) / 2; x1 = cx + (w * scale) / 2;
    y0 = cy - (h * scale) / 2; y1 = cy + (h * scale) / 2;
  }
  if (x0 < 0) { x1 -= x0; x0 = 0; }
  if (y0 < 0) { y1 -= y0; y0 = 0; }
  if (x1 > 1) { x0 -= x1 - 1; x1 = 1; }
  if (y1 > 1) { y0 -= y1 - 1; y1 = 1; }
  return { x0, y0, x1, y1 };
}

const asQuad = (b: Box): Quad => { const f = fitWithin01(b); return [[f.x0, f.y0], [f.x1, f.y0], [f.x1, f.y1], [f.x0, f.y1]]; };

/** Centre an aspect-locked rect over `box`, covering or containing it — in PIXEL space (the
 * photo may be non-square, so normalised units can't carry an aspect ratio). */
function aspectRect(box: Box, W: number, H: number, printAspect: number, fit: 'cover' | 'contain'): Box {
  const bw = (box.x1 - box.x0) * W, bh = (box.y1 - box.y0) * H;
  const boxAspect = bw / bh;
  let w: number, h: number;
  if (fit === 'cover' ? printAspect < boxAspect : printAspect > boxAspect) { w = bw; h = bw / printAspect; }
  else { h = bh; w = bh * printAspect; }
  if (fit === 'cover') { if (w < bw) { w = bw; h = bw / printAspect; } if (h < bh) { h = bh; w = bh * printAspect; } }
  const cx = ((box.x0 + box.x1) / 2) * W, cy = ((box.y0 + box.y1) / 2) * H;
  return { x0: (cx - w / 2) / W, y0: (cy - h / 2) / H, x1: (cx + w / 2) / W, y1: (cy + h / 2) / H };
}

export async function POST(req: Request): Promise<Response> {
  const denied = requireJobsSecret(req);
  if (denied) return denied;
  const db = getDb();
  const rows = await db
    .select({
      id: productVariants.id, sku: productVariants.sku, attrs: productVariants.attributes, key: products.key,
      printWmm: printTemplates.printWidthMm, printHmm: printTemplates.printHeightMm,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .innerJoin(printTemplates, eq(printTemplates.variantId, productVariants.id))
    .where(eq(productVariants.active, true));

  const detected = new Map<string, Awaited<ReturnType<typeof detectProduct>>>();
  const windows = new Map<string, Box>();
  const dims = new Map<string, { W: number; H: number }>();
  let authored = 0;
  const skipped: string[] = [];
  const registration: { sku: string; print: string; mode: string; quadAspect: number | null; printAspect: number; driftPct: number | null }[] = [];

  for (const r of rows) {
    const p = plan(r.key, (r.attrs as Record<string, string>) ?? {});
    if (!p) { skipped.push(r.key); continue; }
    const printAspectEarly = r.printWmm / r.printHmm;

    if (p.register === 'layered-frame') {
      const d = await layeredFrame(p.dir, p.orientation);
      const quad = asQuad(aspectRect(d.window, d.W, d.H, printAspectEarly, 'cover'));
      await setMockupTemplate(db, { variantId: r.id, blank: d.blank, contentType: 'image/png', printQuad: quad, materialClass: p.material, mask: d.mask });
      authored++;
      const qa = ((quad[1]![0] - quad[0]![0]) * d.W) / ((quad[3]![1] - quad[0]![1]) * d.H);
      registration.push({
        sku: r.sku, print: `${r.printWmm}x${r.printHmm}mm`, mode: 'layered-frame',
        quadAspect: Math.round(qa * 1000) / 1000, printAspect: Math.round(printAspectEarly * 1000) / 1000,
        driftPct: Math.round(Math.abs(qa / printAspectEarly - 1) * 1000) / 10,
      });
      continue;
    }

    if (p.register === 'layered-jigsaw') {
      const d = await layeredJigsaw(p.dir, p.orientation);
      const quad = asQuad(aspectRect(d.window, d.W, d.H, printAspectEarly, 'cover'));
      // The piece lines ride along as the compositor's foreground overlay (over the art).
      await setMockupTemplate(db, { variantId: r.id, blank: d.blank, contentType: 'image/png', printQuad: quad, materialClass: p.material, mask: d.mask, overlay: d.overlay });
      authored++;
      const qa = ((quad[1]![0] - quad[0]![0]) * d.W) / ((quad[3]![1] - quad[0]![1]) * d.H);
      registration.push({
        sku: r.sku, print: `${r.printWmm}x${r.printHmm}mm`, mode: 'layered-jigsaw',
        quadAspect: Math.round(qa * 1000) / 1000, printAspect: Math.round(printAspectEarly * 1000) / 1000,
        driftPct: Math.round(Math.abs(qa / printAspectEarly - 1) * 1000) / 10,
      });
      continue;
    }

    const filePath = path.join(ROOT, p.file);
    const raw = readFileSync(filePath);
    // Rotate the blank into the print canvas's orientation where needed (cache by file+rotation).
    const cacheKey = p.rotate ? `${p.file}#r${p.rotate}` : p.file;
    const buf = p.rotate ? await sharp(raw).rotate(p.rotate).jpeg({ quality: 92 }).toBuffer() : raw;
    const contentType = p.rotate ? 'image/jpeg' : p.file.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    let d = dims.get(cacheKey);
    if (!d) { const m = await sharp(buf).metadata(); d = { W: m.width!, H: m.height! }; dims.set(cacheKey, d); }
    const printAspect = r.printWmm / r.printHmm;

    let quad: Quad;
    let mask: Buffer | undefined;
    if (p.register === 'window-cover') {
      let win = windows.get(cacheKey);
      if (!win) { win = await frameWindow(buf); windows.set(cacheKey, win); }
      quad = asQuad(aspectRect(win, d.W, d.H, printAspect, 'cover'));
      // Store the blank with the transparent window FLATTENED TO WHITE (the paper): with a
      // contain placement the design no longer covers the whole window, and the uncovered
      // margin must read as paper, not a transparent hole. (Detection above used the alpha.)
      const flat = await sharp(buf).flatten({ background: '#ffffff' }).png().toBuffer();
      await setMockupTemplate(db, { variantId: r.id, blank: flat, contentType: 'image/png', printQuad: quad, materialClass: p.material });
      authored++;
      const qaF = ((quad[1]![0] - quad[0]![0]) * d.W) / ((quad[3]![1] - quad[0]![1]) * d.H);
      registration.push({
        sku: r.sku, print: `${r.printWmm}x${r.printHmm}mm`, mode: p.register,
        quadAspect: Math.round(qaF * 1000) / 1000, printAspect: Math.round(printAspect * 1000) / 1000,
        driftPct: Math.round(Math.abs(qaF / printAspect - 1) * 1000) / 10,
      });
      continue;
    } else {
      let det = detected.get(cacheKey);
      if (!det) { det = await detectProduct(buf); detected.set(cacheKey, det); }
      const useMask = p.mask && det.coverage >= 0.35; // quality gate: never clip with a failed silhouette
      mask = useMask ? det.mask : undefined;
      if (p.register === 'face-cover') {
        quad = asQuad(aspectRect(det.bbox, d.W, d.H, printAspect, 'cover'));
      } else if (p.register === 'panel-physical') {
        // TRUE physical scale: px-per-mm from the product's detected extent + real width.
        const pxPerMm = ((det.bbox.x1 - det.bbox.x0) * d.W) / p.productWidthMm;
        const w = r.printWmm * pxPerMm, h = r.printHmm * pxPerMm;
        const cx = ((det.bbox.x0 + det.bbox.x1) / 2) * d.W;
        const y1 = (det.bbox.y1 - p.bottomInsetFrac * (det.bbox.y1 - det.bbox.y0)) * d.H;
        quad = asQuad({ x0: (cx - w / 2) / d.W, y0: (y1 - h) / d.H, x1: (cx + w / 2) / d.W, y1: y1 / d.H });
      } else if (p.register === 'panel-contain') {
        // frame 'canvas': the region is AUTHORED in full-canvas fractions (our synthetic
        // garment blanks declare their chest panel in the blank's own coordinates — the
        // same constants the 3D builders use, so photo and spin views agree by
        // construction). Default 'bbox': fractions of the detected product extent
        // (real photography, where the product's position in frame isn't authored).
        const region: Box = p.frame === 'canvas'
          ? p.region
          : {
              x0: det.bbox.x0 + p.region.x0 * (det.bbox.x1 - det.bbox.x0), y0: det.bbox.y0 + p.region.y0 * (det.bbox.y1 - det.bbox.y0),
              x1: det.bbox.x0 + p.region.x1 * (det.bbox.x1 - det.bbox.x0), y1: det.bbox.y0 + p.region.y1 * (det.bbox.y1 - det.bbox.y0),
            };
        quad = asQuad(aspectRect(region, d.W, d.H, printAspect, 'contain'));
      } else {
        // band (mug): the stated region of the bbox, aspect deliberately unlocked (cylinder).
        const b = det.bbox;
        quad = asQuad({
          x0: b.x0 + p.region.x0 * (b.x1 - b.x0), y0: b.y0 + p.region.y0 * (b.y1 - b.y0),
          x1: b.x0 + p.region.x1 * (b.x1 - b.x0), y1: b.y0 + p.region.y1 * (b.y1 - b.y0),
        });
      }
    }

    await setMockupTemplate(db, { variantId: r.id, blank: buf, contentType, printQuad: quad, materialClass: p.material, mask });
    authored++;

    const qa = p.register === 'band' ? null : ((quad[1]![0] - quad[0]![0]) * d.W) / ((quad[3]![1] - quad[0]![1]) * d.H);
    registration.push({
      sku: r.sku, print: `${r.printWmm}x${r.printHmm}mm`, mode: p.register,
      quadAspect: qa === null ? null : Math.round(qa * 1000) / 1000,
      printAspect: Math.round(printAspect * 1000) / 1000,
      driftPct: qa === null ? null : Math.round(Math.abs(qa / printAspect - 1) * 1000) / 10,
    });
  }
  return Response.json({ authored, skippedProducts: [...new Set(skipped)], registration });
}
