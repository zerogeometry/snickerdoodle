'use server';

import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { printTemplates, templateAssets } from '@/db/schema';
import { getStorageObjectGrant, resolveAssetViewer } from '@/server/assets';
import { composeMockup, NoMockupTemplateError, type MockupSize } from '@/server/print/compositor';
import { getCurrentAccount, getUploadClaims } from '@/server/session';
import { presignDownload } from '@/storage';
import type { RawTransform } from '@/server/print/geometry';

export type MockupPreviewResult =
  | { ok: true; url: string; tier: 'FLAT'; widthPx?: number; heightPx?: number }
  | { ok: false; needsAuth?: boolean; fallback: true };

/**
 * Compose a photoreal product mockup (the child's design on a brand-safe blank
 * product photo) IN-VPC and hand back a signed URL. Gated end to end — a signed-in
 * member via their family membership, a guest via the upload claim on their own
 * ephemeral draft. On ANY failure — no template authored yet, a too-low-res design,
 * an engine error, or an unauthorised viewer — it returns { ok:false, fallback:true }
 * so the catalogue rests on its calm empty block, never a broken image or a thrown 500.
 */
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

export async function composeMockupAction(input: {
  assetId: string;
  variantId: string;
  transform: RawTransform;
  size?: MockupSize;
  sourceObjectId?: string;
}): Promise<MockupPreviewResult> {
  const account = await getCurrentAccount();
  const claims = await getUploadClaims();
  const db = getDb();
  const viewer = await resolveAssetViewer(db, input.assetId, account?.id ?? null, claims);

  try {
    const res = await composeMockup(db, viewer, {
      assetId: input.assetId,
      variantId: input.variantId,
      transform: input.transform,
      size: input.size,
      sourceObjectId: input.sourceObjectId,
    });
    const grant = await getStorageObjectGrant(db, res.mockupObjectId, viewer, 600);
    return { ok: true, url: grant.url, tier: res.tier, widthPx: res.widthPx, heightPx: res.heightPx };
  } catch (err) {
    // "No template yet" is the expected steady state for SVG-only products — silent.
    // Anything else is an ENGINE failure the SVG fallback would otherwise hide: log it.
    if (!(err instanceof NoMockupTemplateError)) {
      console.warn('[mockup] compose failed, serving SVG fallback:', err instanceof Error ? err.message : err);
    }
    return { ok: false, needsAuth: account === null && viewer.uploadClaim == null, fallback: true };
  }
}
