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
 *
 * EVERY refusal leaves one line in the server log: the route, the status and the reason
 * (`[app-api] POST /api/app/v1/assets → 422 image`). Before 13 Nov 2026 a refusal left nothing, so when
 * the app was told no there was no way to see why from the box. The line never holds anything
 * personal: no key, no body, no query, no ids (see `routeOf`), no error message.
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

/** The fixed words an app API path is made of. Anything else in a path is an id (or junk a caller typed). */
const ROUTE_WORDS = new Set(['api', 'app', 'v1', 'artists', 'assets', 'checkout-grants', 'children', 'me', 'occasions', 'orders', 'products', 'progress', 'revoke', 'sync', 'token', 'wishes']);

/** `POST /api/app/v1/assets/:id` — the method and the path's fixed words only. Never an id, a query or anything a caller typed. */
export function routeOf(req: Request): string {
  let path = '?';
  try {
    path = new URL(req.url).pathname
      .split('/')
      .map((part) => (part === '' || ROUTE_WORDS.has(part) ? part : ':id'))
      .join('/');
  } catch {}
  return `${/^[A-Z]{3,7}$/.test(req.method) ? req.method : '?'} ${path}`;
}

/** What went wrong on OUR side, as far as is safe to write down: the error's type and code. Never its message (a database error's can hold values). */
function faultOf(e: unknown): string {
  if (!(e instanceof Error)) return typeof e;
  const code = (e as { code?: unknown }).code ?? (e as { Code?: unknown }).Code;
  const status = (e as { $metadata?: { httpStatusCode?: unknown } }).$metadata?.httpStatusCode;
  const safe = (v: unknown) => (typeof v === 'number' || (typeof v === 'string' && /^[\w.:-]{1,60}$/.test(v)) ? String(v) : null);
  return [/^[\w.]{1,60}$/.test(e.name) ? e.name : 'Error', safe(code) && `code ${safe(code)}`, safe(status) && `status ${safe(status)}`].filter(Boolean).join(', ');
}

function refuse(req: Request, status: number, reason: string, detail?: string, extra: Record<string, string> = {}): NextResponse {
  const line = `[app-api] ${routeOf(req)} → ${status} ${reason}${detail ? ` (${detail})` : ''}`;
  if (status >= 500) console.error(line);
  else console.warn(line);
  return appJson({ reason }, status, extra);
}

function fail(req: Request, e: unknown): NextResponse {
  if (e instanceof AppAuthError) return refuse(req, 401, e.reason);
  if (e instanceof AppApiError) return refuse(req, e.status, e.reason, e.detail);
  return refuse(req, 500, 'server', faultOf(e));
}

/** A route that needs the phone's key. */
export function withAppViewer<C>(handler: (ctx: { req: Request; db: DbHandle; av: AppViewer; params: C }) => Promise<NextResponse>) {
  return async (req: Request, context: { params: Promise<C> }): Promise<NextResponse> => {
    try {
      const db = getDb();
      const av = await requireAppViewer(db, req.headers.get('authorization'));
      const gate = await rateLimit(db, { ...PER_KEY, caller: av.tokenId });
      if (!gate.ok) return refuse(req, 429, 'slow-down', 'every call from this phone', { 'Retry-After': String(gate.retryAfterSec) });
      return await handler({ req, db, av, params: await context.params });
    } catch (e) {
      return fail(req, e);
    }
  };
}

/** A route with no key (the product list, the code swap): limited per IP instead. */
export function withoutKey(handler: (ctx: { req: Request; db: DbHandle }) => Promise<NextResponse>) {
  return async (req: Request): Promise<NextResponse> => {
    try {
      const db = getDb();
      const gate = await rateLimit(db, { ...PER_IP, caller: ipFromHeaders(req.headers) });
      if (!gate.ok) return refuse(req, 429, 'slow-down', 'every call from this address', { 'Retry-After': String(gate.retryAfterSec) });
      return await handler({ req, db });
    } catch (e) {
      return fail(req, e);
    }
  };
}

/** A JSON body as a plain object ({} for anything else) — every field is checked by the caller. */
export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  const body = (await req.json().catch(() => null)) as unknown;
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}
