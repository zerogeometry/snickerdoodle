import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { instantContexts } from '@/server/print/instantContext';
import { ipFromHeaders, LIMITS, rateLimit } from '@/server/rateLimit';
import type { InstantContext } from '@/lib/instantMockup';

/**
 * The product photos + print areas the browser needs to draw INSTANT previews of the shopper's
 * drawing while the photoreal mockups are made (src/server/print/instantContext.ts). Brand-safe,
 * non-child data — no viewer needed, nothing about any drawing is sent or returned.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse<{ contexts: Record<string, InstantContext | null> }>> {
  let ids: string[];
  try {
    const body = (await req.json()) as { variantIds?: unknown };
    if (!Array.isArray(body.variantIds) || body.variantIds.length > 80 || !body.variantIds.every((v) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v))) throw new Error('bad');
    ids = [...new Set(body.variantIds as string[])];
  } catch {
    return NextResponse.json({ contexts: {} }, { status: 400 });
  }
  const db = getDb();
  const gate = await rateLimit(db, { ...LIMITS.mockupContextsPerIp, caller: ipFromHeaders(req.headers) });
  if (!gate.ok) return NextResponse.json({ contexts: {} }, { status: 429, headers: { 'retry-after': String(gate.retryAfterSec) } });
  const contexts = await instantContexts(db, ids);
  return NextResponse.json({ contexts }, { headers: { 'cache-control': 'no-store' } });
}
