import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { renderTemplatePreview } from '@/server/print/compositor';
import { requireJobsSecret } from '@/server/jobs/auth';

/**
 * Post-deploy render check (infra/aws-london/bin/smoke.sh): proves the image's native picture
 * libraries (sharp/libvips and resvg) are the right Linux builds and that the mockup compositor
 * runs, by drawing ONE product mockup — the brand-safe example painting from /public on a
 * synthetic product photo, through the same perspective warp the shop uses.
 *
 * Nothing about a customer is touched: no database, no storage, no viewer, no child's picture.
 * Kept behind the JOBS_SECRET because it is CPU work (never an open door for load).
 */
export const dynamic = 'force-dynamic';

const EXAMPLE_DRAWING = path.join(process.cwd(), 'public', 'examples', 'range', 'drawing.webp');
// a slightly angled print area, so the perspective tier (the heavier one) is exercised
const QUAD: [number, number][] = [[0.22, 0.2], [0.8, 0.24], [0.78, 0.8], [0.2, 0.76]];

export async function POST(req: Request): Promise<Response> {
  const denied = requireJobsSecret(req);
  if (denied) return denied;
  const t0 = Date.now();
  try {
    // resvg: the same renderer the card back, height chart and drawn mockups use
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#f6eedf"/></svg>';
    const blank = await sharp(Buffer.from(new Resvg(svg).render().asPng())).png().toBuffer();
    const mockup = await renderTemplatePreview({
      blank,
      quad: QUAD,
      materialClass: 'PAPER',
      design: await readFile(EXAMPLE_DRAWING),
      productKey: 'framedPrint',
      print: { widthPx: 1200, heightPx: 1200, bleedMm: 3, requiredDpi: 150 },
      size: 'thumb',
    });
    const meta = await sharp(mockup).metadata();
    return Response.json(
      { ok: true, format: meta.format, width: meta.width, height: meta.height, ms: Date.now() - t0 },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (e) {
    console.error('[health] render check failed:', (e as Error).message);
    return Response.json({ ok: false, ms: Date.now() - t0 }, { status: 500, headers: { 'cache-control': 'no-store' } });
  }
}
