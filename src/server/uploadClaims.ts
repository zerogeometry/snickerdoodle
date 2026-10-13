import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The signed upload-claim cookie. A guest's browser holds the set of claim ids
 * for the ephemeral drafts they uploaded; authz grants access to a draft only
 * when the held claim equals that asset's ephemeralClaimId (see canViewAsset
 * STEP 0). The cookie is HMAC-signed with AUTH_SECRET so a guest can't inject a
 * claim they weren't issued — and claim ids are random UUIDs, so they can't be
 * guessed either. httpOnly + short-lived; never readable by client JS.
 */
export const UPLOAD_CLAIM_COOKIE = 'sd_upload_claims';

/** The signing secret. Production REFUSES to run without a real one — a guessable default
 * would let anyone forge an upload claim and adopt someone else's child's drawing. */
export function claimSecret(env: Record<string, string | undefined> = process.env): string {
  const s = env.AUTH_SECRET;
  if (s && s.length >= 32) return s;
  if (env.NODE_ENV === 'production') throw new Error('AUTH_SECRET (≥32 chars) is required in production');
  return s || 'dev-insecure-secret';
}

function secret(): string {
  return claimSecret();
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

/**
 * How many guest drafts one browser keeps a claim for. Losing a claim would make that draft
 * (and any basket line built on it) unreachable from this browser, so this is set far beyond any
 * real pre-sign-in session: claims are packed as raw 16-byte UUIDs, so 140 of them sign to
 * ~3.2KB — inside the ~4KB per-cookie limit with room for the name + attributes. The cookie
 * lives for the draft retention window, so this is "140 uploads in 30 days without signing in".
 * Access stays scoped to this one browser either way.
 */
export const MAX_UPLOAD_CLAIMS = 140;

/** Add a fresh claim, keeping the newest MAX_UPLOAD_CLAIMS (oldest drop off; no duplicates). */
export function appendClaim(claims: string[], claimId: string): string[] {
  return [...claims.filter((c) => c !== claimId), claimId].slice(-MAX_UPLOAD_CLAIMS);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PACKED = 'p'; // payload prefix for the packed-UUID format

function pack(ids: string[]): string {
  return PACKED + Buffer.concat(ids.map((id) => Buffer.from(id.replace(/-/g, ''), 'hex'))).toString('base64url');
}
function unpack(payload: string): string[] {
  const buf = Buffer.from(payload.slice(PACKED.length), 'base64url');
  if (buf.length % 16 !== 0) return [];
  const out: string[] = [];
  for (let i = 0; i < buf.length; i += 16) {
    const h = buf.subarray(i, i + 16).toString('hex');
    out.push(`${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`);
  }
  return out;
}

/** Encode + sign a set of claim ids into a cookie value. UUID claims (all real ones) are packed
 * compactly; anything else falls back to the original JSON payload. */
export function signClaims(claimIds: string[]): string {
  const payload =
    claimIds.length > 0 && claimIds.every((id) => UUID.test(id))
      ? pack(claimIds)
      : Buffer.from(JSON.stringify(claimIds)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

/** Verify + decode a cookie value → the claim ids, or [] if absent/tampered. Reads both the
 * packed format and the original JSON one (cookies issued before the switch keep working). */
export function verifyClaims(cookieValue: string | undefined | null): string[] {
  if (!cookieValue) return [];
  const dot = cookieValue.lastIndexOf('.');
  if (dot <= 0) return [];
  const payload = cookieValue.slice(0, dot);
  const mac = cookieValue.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return []; // tampered
  if (payload.startsWith(PACKED)) return unpack(payload);
  try {
    const ids: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
