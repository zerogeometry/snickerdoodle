import { type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { getCurrentAccount, getUploadClaims } from '@/server/session';
import { ipFromHeaders, LIMITS, rateLimit } from '@/server/rateLimit';
import { BundlePreviewDenied, renderFramePreview } from '@/server/print/bundleCompose';
import { clampTransform, type RawTransform } from '@/server/print/geometry';
import { isMultiPhotoFrameKey, MAX_FRAME_SLOTS } from '@/lib/multi-photo-frame';

/**
 * The MULTI PHOTO FRAME builder's picture: the founder's frame in the chosen size + colour with each
 * square's drawing on it (src/server/print/bundleCompose.ts renderFramePreview). POST { sku, squares } —
 * every field untrusted: the frame comes from the sku (a frame variant's), the squares are read no
 * further than the biggest frame, each placement is clamped, and EACH drawing passes the authz gate
 * before any of it is read. The picture comes straight back as image/webp and is never stored or cached.
 */
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store, private' };

export async function POST(req: NextRequest): Promise<Response> {
  let body: { sku?: unknown; squares?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 400, headers: NO_STORE });
  }
  const sku = typeof body.sku === 'string' && isMultiPhotoFrameKey(body.sku) ? body.sku : null;
  const raw = Array.isArray(body.squares) ? body.squares.slice(0, MAX_FRAME_SLOTS) : null;
  if (!sku || !raw?.length) return new Response(null, { status: 400, headers: NO_STORE });
  const squares: Array<{ assetId: string; sourceObjectId?: string; transform: ReturnType<typeof clampTransform> }> = [];
  for (const s of raw) {
    const o = s as { assetId?: unknown; sourceObjectId?: unknown; transform?: unknown } | null;
    if (!o || typeof o.assetId !== 'string' || !o.assetId) return new Response(null, { status: 400, headers: NO_STORE });
    squares.push({
      assetId: o.assetId,
      ...(typeof o.sourceObjectId === 'string' ? { sourceObjectId: o.sourceObjectId } : {}),
      transform: clampTransform((o.transform ?? undefined) as RawTransform | undefined),
    });
  }
  const db = getDb();
  const [gate, account, uploadClaims] = await Promise.all([rateLimit(db, { ...LIMITS.mockupsPerIp, caller: ipFromHeaders(req.headers) }), getCurrentAccount(), getUploadClaims()]);
  if (!gate.ok) return new Response(null, { status: 429, headers: { ...NO_STORE, 'retry-after': String(gate.retryAfterSec) } });
  try {
    const out = await renderFramePreview(db, { accountId: account?.id ?? null, uploadClaims }, { variantSku: sku, squares });
    if (!out) return new Response(null, { status: 404, headers: NO_STORE }); // no layout seeded for this frame
    return new Response(new Uint8Array(out.webp), { headers: { ...NO_STORE, 'content-type': 'image/webp', 'server-timing': `render;dur=${out.ms}` } });
  } catch (e) {
    if (e instanceof BundlePreviewDenied) return new Response(null, { status: 403, headers: NO_STORE });
    console.warn('[frame preview] failed:', e instanceof Error ? e.message : e);
    return new Response(null, { status: 500, headers: NO_STORE });
  }
}
