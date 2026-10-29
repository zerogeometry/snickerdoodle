import { type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { getCurrentAccount, getUploadClaims } from '@/server/session';
import { ipFromHeaders, LIMITS, rateLimit } from '@/server/rateLimit';
import { BundlePreviewDenied, renderBundlePreview } from '@/server/print/bundleCompose';
import { bundleSizeOf, normalizeBundle } from '@/lib/christmas-bundle';
import { layoutForSize } from '@/server/print/bundleMockup';

/**
 * The CHRISTMAS FAMILY BUNDLE builder's picture of a size, with the shopper's drawings on it
 * (src/server/print/bundleCompose.ts). POST { sku, bundle } — every field untrusted: the size comes
 * from the sku, the drawings are normalised to it, and EACH drawing passes the authz gate before any
 * of it is read. The picture comes straight back as image/webp and is never stored or cached.
 */
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store, private' };

export async function POST(req: NextRequest): Promise<Response> {
  let body: { sku?: unknown; bundle?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 400, headers: NO_STORE });
  }
  const n = typeof body.sku === 'string' ? bundleSizeOf(body.sku) : null;
  const b = n ? normalizeBundle(body.bundle, n) : null;
  if (!n || !b) return new Response(null, { status: 400, headers: NO_STORE });
  const db = getDb();
  const [gate, account, uploadClaims] = await Promise.all([rateLimit(db, { ...LIMITS.mockupsPerIp, caller: ipFromHeaders(req.headers) }), getCurrentAccount(), getUploadClaims()]);
  if (!gate.ok) return new Response(null, { status: 429, headers: { ...NO_STORE, 'retry-after': String(gate.retryAfterSec) } });
  try {
    const out = await renderBundlePreview(db, { accountId: account?.id ?? null, uploadClaims }, { layout: layoutForSize(n) as 'x2' | 'x4' | 'x8', placemat: b.placemat, coaster: b.coaster, ornaments: b.ornaments });
    if (!out) return new Response(null, { status: 404, headers: NO_STORE }); // no layout seeded yet
    return new Response(new Uint8Array(out.webp), { headers: { ...NO_STORE, 'content-type': 'image/webp', 'server-timing': `render;dur=${out.ms}` } });
  } catch (e) {
    if (e instanceof BundlePreviewDenied) return new Response(null, { status: 403, headers: NO_STORE });
    console.warn('[bundle preview] failed:', e instanceof Error ? e.message : e);
    return new Response(null, { status: 500, headers: NO_STORE });
  }
}
