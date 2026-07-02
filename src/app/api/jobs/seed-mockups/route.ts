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
 * Reads blanks off disk (dev only) — production template authoring will upload via an admin UI.
 * Products without a suitable blank (storybook, tees, bodysuit, card, calendar) are skipped and
 * keep their SVG tile until a blank is authored. printQuad = the normalised (0..1) TL,TR,BR,BL
 * corners of the print area on the blank; framed prints auto-detect the transparent frame window.
 */

const ROOT = path.join(process.cwd(), '.prodigi-assets', 'blanks');
type Quad = [number, number][];
type Material = 'PAPER' | 'LIGHT_FABRIC' | 'DARK_FABRIC' | 'CERAMIC' | 'GLOSS';
type Plan = { file: string; quad: Quad | 'auto'; material: Material };

const FRAME: Record<string, string> = {
  gold: 'prodigi-classic-frame-blanks/Gold Classic Frame_blank.png',
  black: 'prodigi-classic-frame-blanks/Black classic frame_blank.png',
  white: 'prodigi-classic-frame-blanks/White classic frame_blank.png',
  natural: 'prodigi-classic-frame-blanks/Natural classic frame_blank.png',
};
const JIG = 'prodigi-jigsaw-puzzle-blank-assets/Prodigi Jigsaw blanks';

// Quads derived from auto-detected product bounding boxes, inset to the print surface.
function plan(key: string, attrs: Record<string, string>): Plan | null {
  const size = attrs.size ?? '';
  const colour = attrs.colour ?? '';
  switch (key) {
    case 'framedPrint':
      return FRAME[colour] ? { file: FRAME[colour], quad: 'auto', material: 'PAPER' } : null;
    case 'mug': // flat decal on the front face (curved wrap is a later tier)
      return { file: 'prodigi-11oz-mug-blank-asset/Prodigi 11oz Mug blank.png', quad: [[0.30, 0.33], [0.55, 0.33], [0.55, 0.70], [0.30, 0.70]], material: 'CERAMIC' };
    case 'cushion':
      if (size === 'heart') return { file: 'prodigi-cushions-blank-assets/Heart Cushion Blank 1.jpg', quad: [[0.28, 0.34], [0.74, 0.34], [0.74, 0.75], [0.28, 0.75]], material: 'LIGHT_FABRIC' };
      if (size === '18″ round') return { file: 'prodigi-cushions-blank-assets/Round cushion blank.jpg', quad: [[0.27, 0.30], [0.72, 0.30], [0.72, 0.76], [0.27, 0.76]], material: 'LIGHT_FABRIC' };
      return { file: 'prodigi-cushions-blank-assets/Cushion blank.jpg', quad: [[0.24, 0.26], [0.78, 0.26], [0.78, 0.79], [0.24, 0.79]], material: 'LIGHT_FABRIC' };
    case 'jigsaw': {
      const f = size.startsWith('252') ? 'Prodigi jigsaw 252 pcs.jpg' : size.startsWith('110') ? 'Prodigi jigsaw 110 pcs.jpg' : 'Prodigi jigsaw 30 pcs.jpg';
      return { file: `${JIG}/${f}`, quad: [[0.16, 0.24], [0.85, 0.24], [0.85, 0.78], [0.16, 0.78]], material: 'PAPER' };
    }
    case 'blanket':
      return { file: 'prodigi-fleece-blanket-blank-asset/Prodigi Fleece Blanket blank.jpg', quad: [[0.13, 0.17], [0.89, 0.17], [0.89, 0.85], [0.13, 0.85]], material: 'LIGHT_FABRIC' };
    case 'apron':
      return { file: 'prodigi-apron-blank-asset/Prodigi-Apron-blank.jpg', quad: [[0.33, 0.34], [0.67, 0.34], [0.67, 0.80], [0.33, 0.80]], material: 'LIGHT_FABRIC' };
    case 'bauble':
      return { file: 'prodigi-ceramic-christmas-tree-ornament-blank-asset/Prodigi-ceramic-christmas-ornament-blank.jpg', quad: [[0.30, 0.33], [0.70, 0.33], [0.70, 0.70], [0.30, 0.70]], material: 'CERAMIC' };
    case 'sack':
      return { file: 'prodigi-christmas-sack-blank-asset/Prodigi-Christmas-Sack blank.jpg', quad: [[0.22, 0.35], [0.78, 0.35], [0.78, 0.85], [0.22, 0.85]], material: 'LIGHT_FABRIC' };
    default:
      return null; // storybook, kidsTee, adultTee, babyBodysuit, card, calendar, giftWrap → keep SVG
  }
}

/** The transparent print window on a framed-print blank → normalised TL,TR,BR,BL quad. */
async function alphaQuad(buf: Buffer): Promise<Quad> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: c } = info;
  let minX = W, minY = H, maxX = -1, maxY = -1;
  const step = Math.max(1, Math.floor(Math.min(W, H) / 800));
  for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
    if (data[(y * W + x) * c + (c - 1)]! < 128) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX < 0) return [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]]; // no window found → sane default
  const x0 = minX / W, y0 = minY / H, x1 = maxX / W, y1 = maxY / H;
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

  let authored = 0;
  const skipped: string[] = [];
  for (const r of rows) {
    const p = plan(r.key, (r.attrs as Record<string, string>) ?? {});
    if (!p) { skipped.push(r.key); continue; }
    const buf = readFileSync(path.join(ROOT, p.file));
    const quad = p.quad === 'auto' ? await alphaQuad(buf) : p.quad;
    const contentType = p.file.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    await setMockupTemplate(db, { variantId: r.id, blank: buf, contentType, printQuad: quad, materialClass: p.material });
    authored++;
  }
  return Response.json({ authored, skippedProducts: [...new Set(skipped)] });
}
