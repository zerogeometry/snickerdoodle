import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { getStorageObjectGrant, resolveAssetViewer } from '@/server/assets';
import { composeMockup, NoMockupTemplateError, type MockupSize } from '@/server/print/compositor';
import { getCurrentAccount, getUploadClaims } from '@/server/session';
import type { RawTransform } from '@/server/print/geometry';

/** The compose result shape — shared by this handler and the MockupPreview that calls it. */
export type MockupPreviewResult =
  | { ok: true; url: string; tier: 'FLAT' | 'PERSPECTIVE'; widthPx?: number; heightPx?: number }
  | { ok: false; needsAuth?: boolean; fallback: true };

/**
 * Compose a photoreal product mockup and hand back a signed URL — the SAME gated,
 * in-VPC pipeline as before, but as a ROUTE HANDLER rather than a Server Action.
 *
 * Why: Server Actions are SERIALISED by the Next.js router (one at a time) and a pending
 * one is ABORTED when the component re-renders or another action dispatches. With several
 * previews (the catalogue tile, the colour strip, the big preview) all composing at once —
 * plus the guest ingest action in flight — they contended and aborted each other, so some
 * thumbnails rendered and some didn't ("not rendering consistently"). A route handler is a
 * plain concurrent request: every preview composes in parallel, independently, reliably.
 *
 * Auth is identical: the viewer is resolved from the session account OR the held upload
 * claim (guest drafts), then gated inside composeMockup via canViewAsset. Never cached.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse<MockupPreviewResult>> {
  let body: {
    assetId?: unknown;
    variantId?: unknown;
    transform?: unknown;
    size?: unknown;
    sourceObjectId?: unknown;
    view?: unknown;
    fill?: unknown;
    spanHalf?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, fallback: true }, { status: 400 });
  }
  const { assetId, variantId, transform, size, sourceObjectId, view, fill, spanHalf } = body;
  if (typeof assetId !== 'string' || typeof variantId !== 'string') {
    return NextResponse.json({ ok: false, fallback: true }, { status: 400 });
  }

  const account = await getCurrentAccount();
  const claims = await getUploadClaims();
  const db = getDb();
  const viewer = await resolveAssetViewer(db, assetId, account?.id ?? null, claims);

  try {
    const res = await composeMockup(db, viewer, {
      assetId,
      variantId,
      transform: (transform ?? {}) as RawTransform, // untrusted; clamped server-side
      size: (typeof size === 'string' ? size : undefined) as MockupSize | undefined,
      sourceObjectId: typeof sourceObjectId === 'string' ? sourceObjectId : undefined,
      view: typeof view === 'string' ? view : undefined,
      fill: typeof fill === 'string' ? fill : undefined,
      spanHalf: spanHalf === 'front' || spanHalf === 'back' ? spanHalf : undefined,
    });
    const grant = await getStorageObjectGrant(db, res.mockupObjectId, viewer, 600);
    return NextResponse.json(
      { ok: true, url: grant.url, tier: res.tier, widthPx: res.widthPx, heightPx: res.heightPx },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (err) {
    // "No template yet" is the expected steady state for a product without a blank — silent.
    // Anything else is an ENGINE failure worth logging (the fallback would otherwise hide it).
    if (!(err instanceof NoMockupTemplateError)) {
      console.warn('[mockup] compose failed, serving fallback:', err instanceof Error ? err.message : err);
    }
    return NextResponse.json({ ok: false, needsAuth: account === null && viewer.uploadClaim == null, fallback: true });
  }
}
