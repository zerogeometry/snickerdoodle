import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * The small crypto pieces of linking Snickerdoodle Draw. Every secret (link code, phone key,
 * checkout pass) is 256 bits of randomness, shown once, and stored only as its SHA-256.
 */

/** A fresh secret, base64url. `prefix` makes a leaked one recognisable in logs/scanners. */
export function newSecret(prefix: string): string {
  return `${prefix}${randomBytes(32).toString('base64url')}`;
}

/** What we store instead of the secret. */
export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/** PKCE S256: BASE64URL(SHA-256(verifier)). */
export function s256(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

/** RFC 7636: 43–128 characters from the unreserved set. */
export const VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
/** An S256 challenge is exactly 43 base64url characters (a SHA-256, unpadded). */
export const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

/** Does this verifier match the challenge the app sent at the start? Constant-time compare. */
export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!VERIFIER.test(verifier) || !CHALLENGE.test(challenge)) return false;
  const a = Buffer.from(s256(verifier));
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}
