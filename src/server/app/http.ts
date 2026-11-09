import { NextResponse } from 'next/server';
import { getDb } from '@/db/client';
import type { DbHandle } from '@/server/db';
import { ipFromHeaders, rateLimit } from '@/server/rateLimit';
import { AppAuthError, requireAppViewer, type AppViewer } from './appAuth';
import { AppApiError } from './api';

/**
 * The shell every /api/app/v1 route shares: never cached, never indexed, no CORS (only the app calls
 * it, never a web page), errors as `{ reason }` JSON the app reads, and a per-key (or per-IP) rate
 * limit. A 401 always means "the link has gone" — the app forgets its key and keeps everything local.
 */
const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' };

export function appJson(body: unknown, status = 200, extra: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { ...HEADERS, ...extra } });
}

export function appNoContent(): NextResponse {
  return new NextResponse(null, { status: 204, headers: HEADERS });
}

/** A linked phone may make this many calls per 10 minutes; an unlinked caller (per IP) fewer. */
const PER_KEY = { bucket: 'app-api:key', limit: 600, windowSec: 600 };
const PER_IP = { bucket: 'app-api:ip', limit: 120, windowSec: 600 };

function fail(e: unknown): NextResponse {
  if (e instanceof AppAuthError) return appJson({ reason: e.reason }, 401);
  if (e instanceof AppApiError) return appJson({ reason: e.reason }, e.status);
  console.warn(`[app-api] failed (${e instanceof Error ? e.name : typeof e})`); // never the body or the key
  return appJson({ reason: 'server' }, 500);
}

/** A route that needs the phone's key. */
export function withAppViewer<C>(handler: (ctx: { req: Request; db: DbHandle; av: AppViewer; params: C }) => Promise<NextResponse>) {
  return async (req: Request, context: { params: Promise<C> }): Promise<NextResponse> => {
    try {
      const db = getDb();
      const av = await requireAppViewer(db, req.headers.get('authorization'));
      const gate = await rateLimit(db, { ...PER_KEY, caller: av.tokenId });
      if (!gate.ok) return appJson({ reason: 'slow-down' }, 429, { 'Retry-After': String(gate.retryAfterSec) });
      return await handler({ req, db, av, params: await context.params });
    } catch (e) {
      return fail(e);
    }
  };
}

/** A route with no key (the product list, the code swap): limited per IP instead. */
export function withoutKey(handler: (ctx: { req: Request; db: DbHandle }) => Promise<NextResponse>) {
  return async (req: Request): Promise<NextResponse> => {
    try {
      const db = getDb();
      const gate = await rateLimit(db, { ...PER_IP, caller: ipFromHeaders(req.headers) });
      if (!gate.ok) return appJson({ reason: 'slow-down' }, 429, { 'Retry-After': String(gate.retryAfterSec) });
      return await handler({ req, db });
    } catch (e) {
      return fail(e);
    }
  };
}

/** A JSON body as a plain object ({} for anything else) — every field is checked by the caller. */
export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  const body = (await req.json().catch(() => null)) as unknown;
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}
