import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { claimSecret } from '../uploadClaims';

/**
 * Two-step login for admins (CLAUDE.md: ADMIN routes MFA) — standard time-based codes (TOTP,
 * RFC 6238: HMAC-SHA1, 30-second steps, 6 digits), the kind every authenticator app makes. No
 * extra library: it's a few lines of node:crypto.
 *
 * The shared secret is stored ENCRYPTED (AES-256-GCM, key derived from AUTH_SECRET), never as
 * plain text in the database.
 */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('not base32');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh 160-bit secret, as the base32 an authenticator app takes. */
export const newTotpSecret = (): string => base32Encode(randomBytes(20));

/** The 6-digit code for a moment in time. */
export function totpCode(secretB32: string, at = Date.now(), step = 30): string {
  const counter = Math.floor(at / 1000 / step);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secretB32)).update(msg).digest();
  const o = h[h.length - 1]! & 0xf;
  const n = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(n % 1_000_000).padStart(6, '0');
}

/** Does `code` match now, or one step either side (phones drift a little)? Constant-time compare. */
export function verifyTotp(secretB32: string, code: string, at = Date.now()): boolean {
  return matchTotpStep(secretB32, code, at) !== null;
}

/** The time-step `code` belongs to (now, or one either side), or null. Every step is checked, so the
 * time taken says nothing. The caller spends the step once (src/server/admin/totpReplay.ts). */
export function matchTotpStep(secretB32: string, code: string, at = Date.now(), step = 30): number | null {
  const c = String(code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  let found: number | null = null;
  for (const d of [-1, 0, 1]) {
    const t = at + d * step * 1000;
    const want = Buffer.from(totpCode(secretB32, t, step));
    if (timingSafeEqual(want, Buffer.from(c)) && found === null) found = Math.floor(t / 1000 / step);
  }
  return found;
}

/** The link an authenticator app understands (paste it, or type the key by hand). */
export const otpauthUri = (secretB32: string, email: string) =>
  `otpauth://totp/${encodeURIComponent(`Snickerdoodle admin:${email}`)}?secret=${secretB32}&issuer=Snickerdoodle&digits=6&period=30`;

// ── at-rest encryption of the secret ─────────────────────────────────────────

const key = () => createHash('sha256').update(`snickerdoodle-admin-mfa:${claimSecret()}`).digest();

export function sealSecret(secretB32: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([c.update(secretB32, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

export function openSecret(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  const [v, iv, tag, body] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || !body) return null;
  try {
    const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(body, 'base64url')), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}
