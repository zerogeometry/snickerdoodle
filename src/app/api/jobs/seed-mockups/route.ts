import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { products, productVariants } from '@/db/schema';
import { requireJobsSecret } from '@/server/jobs/auth';
import { setMockupTemplate } from '@/server/print/templates';

/**
 * DEV template seeder — authors FLAT photoreal mockup templates for the launch range from the
 * Prodigi blank product photos staged in `.prodigi-assets/blanks/` (gitignored). Idempotent
 * (re-authoring bumps the template version). Guarded by JOBS_SECRET like the other jobs.
 *
 * Registration is DETECTED, not hand-guessed: the product silhouette is found by flood-filling
 * the background in from the image border (robust for white-product-on-white-background shots,
 * where simple thresholding leaves holes), giving (a) a silhouette MASK the compositor clips
 * the design to — art can never overlap the product's edge — and (b) the product bbox, from
 * which each product's print quad is derived as fractional insets (full-face for all-over
 * prints like cushions/blanket/bauble; a front panel for mug/apron/sack). Framed prints skip
 * detection: their print window IS the blank's transparent hole (exact, per frame colour).
 *
 * Products without a suitable blank (storybook, tees, bodysuit, card, calendar) are skipped
 * and keep the SVG tile until a blank is authored.
 */

const ROOT = path.join(process.cwd(), '.prodigi-assets', 'blanks');
const DETECT_EDGE = 1200; // detection + mask working resolution

type Quad = [number, number][];
type Material = 'PAPER' | 'LIGHT_FABRIC' | 'DARK_FABRIC' | 'CERAMIC' | 'GLOSS';
/** Fractional insets of the DETECTED product bbox → the print quad. */
type Insets = { l: number; t: number; r: number; b: number };
type Plan = { file: string; material: Material; insets: Insets; mask: boolean } | { file: string; material: Material; window: 'alpha' };

const FRAME: Record<string, string> = {
  gold: 'prodigi-classic-frame-blanks/Gold Classic Frame_blank.png',
  black: 'prodigi-classic-frame-blanks/Black classic frame_blank.png',
  white: 'prodigi-classic-frame-blanks/White classic frame_blank.png',
  natural: 'prodigi-classic-frame-blanks/Natural classic frame_blank.png',
};
const JIG = 'prodigi-jigsaw-puzzle-blank-assets/Prodigi Jigsaw blanks';

function plan(key: string, attrs: Record<string, string>): Plan | null {
  const size = attrs.size ?? '';
  const colour = attrs.colour ?? '';
  switch (key) {
    case 'framedPrint':
      return FRAME[colour] ? { file: FRAME[colour], material: 'PAPER', window: 'alpha' } : null;
    // All-over prints: the quad is the (near-)whole product face; the mask shapes it.
    case 'cushion': {
      const file = size === 'heart' ? 'Heart Cushion Blank 1.jpg' : size === '18″ round' ? 'Round cushion blank.jpg' : 'Cushion blank.jpg';
      return { file: `prodigi-cushions-blank-assets/${file}`, material: 'LIGHT_FABRIC', insets: { l: 0.02, t: 0.02, r: 0.02, b: 0.02 }, mask: true };
    }
    // Rectangular faces: NO mask — white-on-white blanks defeat silhouette detection, and a
    // wrong clip (art erased) is far worse than no clip. The inset quad stays inside the face.
    case 'jigsaw': {
      const f = size.startsWith('252') ? 'Prodigi jigsaw 252 pcs.jpg' : size.startsWith('110') ? 'Prodigi jigsaw 110 pcs.jpg' : 'Prodigi jigsaw 30 pcs.jpg';
      return { file: `${JIG}/${f}`, material: 'PAPER', insets: { l: 0.03, t: 0.03, r: 0.03, b: 0.03 }, mask: false };
    }
    case 'blanket':
      return { file: 'prodigi-fleece-blanket-blank-asset/Prodigi Fleece Blanket blank.jpg', material: 'LIGHT_FABRIC', insets: { l: 0.06, t: 0.08, r: 0.06, b: 0.08 }, mask: false };
    case 'bauble': // top inset clears the metal cap + hanger
      return { file: 'prodigi-ceramic-christmas-tree-ornament-blank-asset/Prodigi-ceramic-christmas-ornament-blank.jpg', material: 'CERAMIC', insets: { l: 0.03, t: 0.18, r: 0.03, b: 0.04 }, mask: true };
    // Panel prints: a front panel of the detected bbox (Prodigi prints a panel, not all-over).
    case 'mug': // a wide-ish band on the body's visible front — right inset clears the handle, top/bottom the rim + shadow
      return { file: 'prodigi-11oz-mug-blank-asset/Prodigi 11oz Mug blank.png', material: 'CERAMIC', insets: { l: 0.05, t: 0.28, r: 0.38, b: 0.24 }, mask: true };
    case 'apron': // chest-to-hem centre panel, clear of the ties (white-on-white → no reliable mask)
      return { file: 'prodigi-apron-blank-asset/Prodigi-Apron-blank.jpg', material: 'LIGHT_FABRIC', insets: { l: 0.28, t: 0.42, r: 0.28, b: 0.10 }, mask: false };
    case 'sack': // front panel below the drawstring
      return { file: 'prodigi-christmas-sack-blank-asset/Prodigi-Christmas-Sack blank.jpg', material: 'LIGHT_FABRIC', insets: { l: 0.25, t: 0.42, r: 0.25, b: 0.12 }, mask: true };
    default:
      return null; // storybook, kidsTee, adultTee, babyBodysuit, card, calendar, giftWrap → keep SVG
  }
}

/**
 * The print WINDOW on a framed-print blank → normalised TL,TR,BR,BL quad. Preferred:
 * the transparent hole (exact). Fallback (frames shipped with an opaque white window,
 * e.g. the black/white/natural blanks): walk OUT from the centre until the colour breaks
 * from the window's own colour for a sustained run — that's the inner moulding edge.
 */
async function frameWindowQuad(buf: Buffer): Promise<Quad> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: c } = info;

  // 1. Transparent-window path (exact).
  let minX = W, minY = H, maxX = -1, maxY = -1;
  const step = Math.max(1, Math.floor(Math.min(W, H) / 800));
  for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
    if (data[(y * W + x) * c + (c - 1)]! < 128) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX >= 0) return [[minX / W, minY / H], [maxX / W, minY / H], [maxX / W, maxY / H], [minX / W, maxY / H]];

  // 2. Centre-out scan. Reference = the window colour at the centre; an edge = `run`
  //    consecutive pixels deviating by > thresh (skips paper texture / soft vignette).
  //    ADAPTIVE: a white moulding on a white shot barely deviates, so step the threshold
  //    down until the edge is found before the border; if one side still fails, mirror
  //    its symmetric partner (these product shots centre the frame).
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
    return null; // ran off the image — no edge at this threshold
  };
  const edge = (dx: number, dy: number): number | null => {
    for (const thresh of [90, 45, 24]) { const s = scan(dx, dy, thresh); if (s !== null) return s; }
    return null;
  };
  let L = edge(-1, 0), R = edge(1, 0), T = edge(0, -1), B = edge(0, 1);
  L = L ?? R; R = R ?? L; T = T ?? B; B = B ?? T; // mirror a failed side from its partner
  if (L === null || T === null) return [[0.15, 0.15], [0.85, 0.15], [0.85, 0.85], [0.15, 0.85]];
  const x0 = (W / 2 - L) / W, x1 = (W / 2 + R!) / W;
  const y0 = (H / 2 - T) / H, y1 = (H / 2 + B!) / H;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

/**
 * Detect the product on a clean-background blank: flood-fill BACKGROUND in from the border
 * (pixels within `thresh` of the corner-sampled bg colour), everything unreached = product.
 * The flood makes white-on-white interiors solid (they're enclosed, so never reached) while
 * soft shadows attached to the border stay background if close to bg, or get absorbed into
 * the product region if not — either way the quad insets keep art off them.
 */
async function detectProduct(buf: Buffer, thresh = 18): Promise<{ bbox: { x0: number; y0: number; x1: number; y1: number }; mask: Buffer; coverage: number }> {
  const img = sharp(buf).flatten({ background: '#ffffff' }).resize(DETECT_EDGE, DETECT_EDGE, { fit: 'inside', withoutEnlargement: true });
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: c } = info;

  // Background colour = mean of the four 8×8 corner patches.
  let br = 0, bg = 0, bb = 0, n = 0;
  for (const [cx, cy] of [[0, 0], [W - 8, 0], [0, H - 8], [W - 8, H - 8]] as const) {
    for (let y = cy; y < cy + 8; y++) for (let x = cx; x < cx + 8; x++) { const i = (y * W + x) * c; br += data[i]!; bg += data[i + 1]!; bb += data[i + 2]!; n++; }
  }
  br /= n; bg /= n; bb /= n;
  const isBgColour = (i: number) => Math.abs(data[i]! - br) + Math.abs(data[i + 1]! - bg) + Math.abs(data[i + 2]! - bb) <= thresh * 3;

  // BFS flood from every border pixel across bg-coloured pixels.
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

  // Product = not background. Bbox + a white-on-black single-channel mask.
  const maskRaw = Buffer.alloc(W * H);
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x;
    if (!visited[p]) { maskRaw[p] = 255; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX < 0) { minX = 0; minY = 0; maxX = W - 1; maxY = H - 1; maskRaw.fill(255); }

  // Erode slightly (blur → high threshold) so the clip sits just INSIDE the true edge.
  const mask = await sharp(maskRaw, { raw: { width: W, height: H, channels: 1 } }).blur(2).threshold(200).png().toBuffer();
  // Coverage = product pixels / bbox area — a SOLID silhouette ≈ 0.6–0.95. A near-empty or
  // patchy value means detection failed (white-on-white blank) and the mask must not be used.
  let productPx = 0;
  for (let i = 0; i < maskRaw.length; i++) if (maskRaw[i]) productPx++;
  const bboxArea = Math.max(1, (maxX - minX + 1) * (maxY - minY + 1));
  return { bbox: { x0: minX / W, y0: minY / H, x1: (maxX + 1) / W, y1: (maxY + 1) / H }, mask, coverage: productPx / bboxArea };
}

function quadFromBbox(b: { x0: number; y0: number; x1: number; y1: number }, ins: Insets): Quad {
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  const x0 = b.x0 + ins.l * w, x1 = b.x1 - ins.r * w;
  const y0 = b.y0 + ins.t * h, y1 = b.y1 - ins.b * h;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

export async function POST(req: Request): Promise<Response> {
  const denied = requireJobsSecret(req);
  if (denied) return denied;
  const db = getDb();
  const rows = await db
    .select({ id: productVariants.id, sku: productVariants.sku, attrs: productVariants.attributes, key: products.key })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(eq(productVariants.active, true));

  // Detection is per-FILE; many variants share a blank (e.g. 8 mug colours) → cache it.
  const detected = new Map<string, Awaited<ReturnType<typeof detectProduct>>>();
  let authored = 0;
  const skipped: string[] = [];
  const quads: Record<string, Quad> = {};
  for (const r of rows) {
    const p = plan(r.key, (r.attrs as Record<string, string>) ?? {});
    if (!p) { skipped.push(r.key); continue; }
    const buf = readFileSync(path.join(ROOT, p.file));
    const contentType = p.file.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

    if ('window' in p) {
      const quad = await frameWindowQuad(buf);
      quads[`${r.key}:${p.file}`] = quad;
      await setMockupTemplate(db, { variantId: r.id, blank: buf, contentType, printQuad: quad, materialClass: p.material });
    } else {
      let det = detected.get(p.file);
      if (!det) { det = await detectProduct(buf); detected.set(p.file, det); }
      const quad = quadFromBbox(det.bbox, p.insets);
      quads[`${r.key}:${p.file}`] = quad;
      // Quality gate: only clip to a silhouette the detector actually found solidly.
      const useMask = p.mask && det.coverage >= 0.35;
      await setMockupTemplate(db, { variantId: r.id, blank: buf, contentType, printQuad: quad, materialClass: p.material, mask: useMask ? det.mask : undefined });
    }
    authored++;
  }
  return Response.json({ authored, skippedProducts: [...new Set(skipped)], quads });
}
