'use server';

import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { printTemplates, templateAssets } from '@/db/schema';
import { presignDownload } from '@/storage';

// The compose itself is a ROUTE HANDLER now (src/app/api/mockup/route.ts) — server
// actions serialise and abort each other, so several previews composing at once rendered
// inconsistently. This file keeps only the brand-safe product-context action below.

export type MockupContext = {
  ok: true;
  blankUrl: string;
  maskUrl: string | null;
  /** Normalised TL,TR,BR,BL corners of the print area on the blank. */
  quad: [number, number][];
  blankW: number;
  blankH: number;
} | { ok: false };

/**
 * The BRAND-SAFE product context for a variant — the blank product photo, its print-area
 * quad and (optional) silhouette mask — so the positioner can show the image being placed
 * ON the product, live. Structurally NON-child data (the same imagery the public catalogue
 * renders), so no viewer gate; short-lived signed URLs.
 */
export async function mockupContextAction(input: { variantId: string }): Promise<MockupContext> {
  const db = getDb();
  const [tpl] = await db.select().from(printTemplates).where(eq(printTemplates.variantId, input.variantId));
  if (!tpl?.blankObjectId || !tpl.printQuad) return { ok: false };
  const [blank] = await db.select().from(templateAssets).where(eq(templateAssets.id, tpl.blankObjectId));
  if (!blank?.widthPx || !blank.heightPx) return { ok: false };
  const [mask] = tpl.maskObjectId ? await db.select().from(templateAssets).where(eq(templateAssets.id, tpl.maskObjectId)) : [undefined];
  return {
    ok: true,
    blankUrl: await presignDownload(blank.key, 600),
    maskUrl: mask ? await presignDownload(mask.key, 600) : null,
    quad: tpl.printQuad,
    blankW: blank.widthPx,
    blankH: blank.heightPx,
  };
}
