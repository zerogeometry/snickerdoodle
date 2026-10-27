import 'server-only';
import { headers } from 'next/headers';

/**
 * A small fixed-window rate limiter for the abuse-prone and costly entry points (uploads cost
 * screening + storage, emails can be used to bomb someone, promo codes can be guessed).
 *
 * In memory, on purpose: D18 runs ONE app process on one box, so this is exact there and needs
 * no table, no service and no ops. (On the serverless test site it's best-effort per instance.)
 * If the app ever runs on several boxes, move the buckets to Postgres — the call sites stay.
 */
export const LIMITS = {
  /** sign-in links to one address */
  'magic-link': { max: 5, windowMs: 60 * 60_000 },
  /** drawings uploaded by one visitor before an account */
  'guest-upload': { max: 40, windowMs: 60 * 60_000 },
  /** uploads into a family (keepsakes, profile pictures) by one account */
  'account-upload': { max: 120, windowMs: 60 * 60_000 },
  /** magic edits (CPU-heavy) by one visitor */
  'magic-edit': { max: 120, windowMs: 60 * 60_000 },
  /** promo code look-ups by one visitor */
  'promo-check': { max: 30, windowMs: 15 * 60_000 },
  /** checkouts started by one visitor (each makes a Stripe session) */
  checkout: { max: 30, windowMs: 60 * 60_000 },
  /** reports sent by one visitor */
  report: { max: 20, windowMs: 60 * 60_000 },
  /** founding-families sign-ups from one visitor (the per-inbox re-send throttle is in the service) */
  waitlist: { max: 5, windowMs: 10 * 60_000 },
  /** emails a member can make us send (invites, gift requests, email change, wishes) */
  'send-email': { max: 40, windowMs: 24 * 60 * 60_000 },
} as const satisfies Record<string, { max: number; windowMs: number }>;
export type LimitName = keyof typeof LIMITS;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 50_000; // memory bound; expired buckets are swept when we get near it

/** Count one attempt. Returns false when this key is over its limit for the current window. */
export function allow(name: LimitName, key: string, now = Date.now()): boolean {
  const { windowMs } = LIMITS[name];
  const max = maxFor(name);
  const id = `${name}:${key}`;
  let b = buckets.get(id);
  if (!b || b.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) sweep(now);
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(id, b);
  }
  b.count++;
  return b.count <= max;
}

/** Is this key already over its limit? (Doesn't count an attempt — pair with allow() on failure.) */
export function isOver(name: LimitName, key: string, now = Date.now()): boolean {
  const b = buckets.get(`${name}:${key}`);
  return !!b && b.resetAt > now && b.count >= maxFor(name);
}

/** RATE_LIMIT_SCALE (≥1) raises every limit — for e2e runs that drive many journeys from one
 * address. It can only loosen by a factor, never switch limits off. */
function maxFor(name: LimitName): number {
  const scale = Number(process.env.RATE_LIMIT_SCALE);
  return LIMITS[name].max * (Number.isFinite(scale) && scale > 1 ? Math.min(scale, 1000) : 1);
}

function sweep(now: number) {
  for (const [id, b] of buckets) if (b.resetAt <= now) buckets.delete(id);
  // still full (a flood of distinct keys): drop the oldest half rather than grow without bound
  if (buckets.size >= MAX_BUCKETS) {
    let n = 0;
    for (const id of buckets.keys()) {
      if (n++ > MAX_BUCKETS / 2) break;
      buckets.delete(id);
    }
  }
}

/** Test hook. */
export function resetRateLimits(): void {
  buckets.clear();
}

/**
 * The visitor's IP as our own edge saw it. Netlify sets x-nf-client-connection-ip; on the
 * Lightsail box Caddy sets X-Forwarded-For itself (it ignores a client-sent one by default).
 * Never logged or stored — only used as a bucket key.
 */
export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    return (
      h.get('x-nf-client-connection-ip') ??
      h.get('x-real-ip') ??
      h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      'unknown'
    );
  } catch {
    return 'unknown'; // outside a request (tests, jobs)
  }
}

/** Convenience for server actions: limit by the visitor's IP. */
export async function allowVisitor(name: LimitName): Promise<boolean> {
  return allow(name, await clientIp());
}
