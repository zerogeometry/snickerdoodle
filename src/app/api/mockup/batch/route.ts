import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { resolveAssetViewer } from '@/server/assets';
import { getCurrentAccount, getUploadClaims } from '@/server/session';
import { ipFromHeaders, LIMITS, rateLimit } from '@/server/rateLimit';
import type { ViewerContext } from '@/authz';
import { composeForViewer, MOCKUP_BATCH_MAX, requestAssetId, type MockupPreviewResult, type MockupRequestBody } from '@/server/print/mockupRequest';
import type { ComposeMemo } from '@/server/print/compositor';

/**
 * Compose SEVERAL previews in one request — the catalogue reveal. The session + upload claims are
 * read once, each asset's viewer resolved once, and the drawing is downloaded + shrunk once for
 * the whole batch (a per-request memo — nothing outlives the request). Every item still goes
 * through composeMockup's own authz gate, exactly like the single route. The items compose
 * concurrently (the compositor caps CPU work), so their database round trips overlap.
 * Results come back in the request's order; a bad item is a fallback, never a failed batch.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse<{ results: MockupPreviewResult[] }>> {
  let items: MockupRequestBody[];
  try {
    const body = (await req.json()) as { items?: unknown };
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > MOCKUP_BATCH_MAX) throw new Error('bad batch');
    items = body.items as MockupRequestBody[];
  } catch {
    return NextResponse.json({ results: [] }, { status: 400 });
  }

  const db = getDb();
  // a batch counts as many previews as it asks for (the same per-device limit as the single route)
  // independent lookups, side by side (each is a round trip); nothing is composed until the gate passes
  const [gate, account, claims] = await Promise.all([
    rateLimit(db, { ...LIMITS.mockupsPerIp, caller: ipFromHeaders(req.headers), cost: items.length }),
    getCurrentAccount(),
    getUploadClaims(),
  ]);
  if (!gate.ok) return NextResponse.json({ results: [] }, { status: 429, headers: { 'retry-after': String(gate.retryAfterSec) } });
  const viewers = new Map<string, Promise<ViewerContext>>();
  const viewerFor = (assetId: string) => {
    let v = viewers.get(assetId);
    if (!v) {
      v = resolveAssetViewer(db, assetId, account?.id ?? null, claims);
      viewers.set(assetId, v);
    }
    return v;
  };
  const memo: ComposeMemo = new Map();

  const results = await Promise.all(
    items.map(async (b): Promise<MockupPreviewResult> => {
      const assetId = requestAssetId(b);
      if (!assetId) return { ok: false, fallback: true };
      const viewer = await viewerFor(assetId);
      return composeForViewer(db, viewer, b, { needsAuth: account === null && viewer.uploadClaim == null, memo });
    }),
  );
  return NextResponse.json({ results }, { headers: { 'cache-control': 'no-store' } });
}
