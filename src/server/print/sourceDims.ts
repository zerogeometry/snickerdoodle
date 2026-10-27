import 'server-only';
import { eq } from 'drizzle-orm';
import { assets } from '@/db/schema';
import { derivativeKey } from '@/storage';
import type { DbHandle } from '@/server/db';

/** The most a Studio design is ever enlarged for crisp added things (src/server/studio-doc.ts). */
export const DESIGN_MAX_ENLARGE = 4;

/**
 * A Studio design's REAL pixel size — the drawing's own pixels across it, before any enlarging for
 * crisp stickers / words (and divided by any scaling-up of the drawing inside its frame). Stored in
 * the studio doc with the design's content hash, so it can only ever vouch for those exact bytes.
 */
export interface DesignPx {
  width: number;
  height: number;
  sha256: string;
}

/**
 * The pixel size every PRINT-QUALITY gate judges a source on (gap audit, 27 Oct: adding a sticker
 * stored the design up to 4× enlarged, and the gate read that file's size — so a too-small drawing
 * could pass the print floor). An original, a trim or a cutout is judged on its file; a Studio
 * design on its recorded real size. A design without a matching record that HAS added things is
 * judged at the most it could have been enlarged — too careful, never too generous. Layout keeps
 * using the file's own size (same shape); only the quality judgement changes.
 */
export async function printSourceDims(
  db: DbHandle,
  assetId: string,
  obj: { key: string; sha256?: string | null },
  file: { width: number; height: number },
): Promise<{ width: number; height: number }> {
  if (obj.key !== derivativeKey(assetId, 'design')) return file;
  const [row] = await db.select({ doc: assets.studioDoc }).from(assets).where(eq(assets.id, assetId));
  const doc = row?.doc as { designPx?: DesignPx; objects?: unknown[] } | null;
  const px = doc?.designPx;
  if (px && obj.sha256 && px.sha256 === obj.sha256) return { width: Math.min(px.width, file.width), height: Math.min(px.height, file.height) };
  if (!doc?.objects?.length) return file; // nothing was added, so nothing was enlarged
  return { width: Math.max(1, Math.round(file.width / DESIGN_MAX_ENLARGE)), height: Math.max(1, Math.round(file.height / DESIGN_MAX_ENLARGE)) };
}
