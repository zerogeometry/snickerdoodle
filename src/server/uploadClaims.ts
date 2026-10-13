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

/** Encode + sign a set of claim ids into a cookie value. */
export function signClaims(claimIds: string[]): string {
  const payload = Buffer.from(JSON.stringify(claimIds)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

/** Verify + decode a cookie value → the claim ids, or [] if absent/tampered. */
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
  try {
    const ids: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
