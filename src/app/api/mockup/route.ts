import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { resolveAssetViewer } from '@/server/assets';
import { getCurrentAccount, getUploadClaims } from '@/server/session';
import { composeForViewer, requestAssetId, type MockupPreviewResult, type MockupRequestBody } from '@/server/print/mockupRequest';

export type { MockupPreviewResult } from '@/server/print/mockupRequest';

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
 * (A whole range at once goes through /api/mockup/batch.)
 *
 * Auth is identical: the viewer is resolved from the session account OR the held upload
 * claim (guest drafts), then gated inside composeMockup via canViewAsset. Never cached.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse<MockupPreviewResult>> {
  let body: MockupRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, fallback: true }, { status: 400 });
  }
  const assetId = requestAssetId(body);
  if (!assetId) return NextResponse.json({ ok: false, fallback: true }, { status: 400 });

  const account = await getCurrentAccount();
  const claims = await getUploadClaims();
  const db = getDb();
  const viewer = await resolveAssetViewer(db, assetId, account?.id ?? null, claims);
  const res = await composeForViewer(db, viewer, body, { needsAuth: account === null && viewer.uploadClaim == null });
  return NextResponse.json(res, { headers: { 'cache-control': 'no-store' } });
}
