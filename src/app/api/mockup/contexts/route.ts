import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { instantContexts } from '@/server/print/instantContext';
import { ipFromHeaders, LIMITS, rateLimit } from '@/server/rateLimit';
import type { InstantContext, ProductPhoto } from '@/lib/instantMockup';

/**
 * The product photos + print areas the browser needs to draw INSTANT previews of the shopper's
 * drawing while the photoreal mockups are made (src/server/print/instantContext.ts), and the plain
 * product photos that stand in on the tiles it can't draw. Brand-safe, non-child data — no viewer
 * needed, nothing about any drawing is sent or returned.
 */
export const dynamic = 'force-dynamic';

type Body = { contexts: Record<string, InstantContext | null>; photos: Record<string, ProductPhoto | null> };
const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(req: NextRequest): Promise<NextResponse<Body>> {
  let ids: string[];
  let views: Record<string, string> = {};
  try {
    const body = (await req.json()) as { variantIds?: unknown; views?: unknown };
    if (!Array.isArray(body.variantIds) || body.variantIds.length > 80 || !body.variantIds.every((v) => typeof v === 'string' && UUID.test(v))) throw new Error('bad');
    ids = [...new Set(body.variantIds as string[])];
    if (body.views !== undefined) {
      const v = body.views as Record<string, unknown>;
      if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error('bad');
      const entries = Object.entries(v);
      if (entries.length > 80 || !entries.every(([k, x]) => UUID.test(k) && typeof x === 'string' && /^[a-z0-9-]{1,40}$/.test(x))) throw new Error('bad');
      views = Object.fromEntries(entries) as Record<string, string>;
    }
  } catch {
    return NextResponse.json({ contexts: {}, photos: {} }, { status: 400 });
  }
  const db = getDb();
  const gate = await rateLimit(db, { ...LIMITS.mockupContextsPerIp, caller: ipFromHeaders(req.headers) });
  if (!gate.ok) return NextResponse.json({ contexts: {}, photos: {} }, { status: 429, headers: { 'retry-after': String(gate.retryAfterSec) } });
  return NextResponse.json(await instantContexts(db, ids, views), { headers: { 'cache-control': 'no-store' } });
}
