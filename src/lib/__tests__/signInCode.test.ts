import { describe, expect, it } from 'vitest';
import { formatSignInCode, normalizeSignInCode, SIGN_IN_CODE_ALPHABET, SIGN_IN_CODE_LENGTH } from '@/lib/signInCode';
import { newSignInCode, verificationTokenHash } from '@/auth/signInCode';

describe('the sign-in code (founder, 12 Nov 2026)', () => {
  it('is 8 symbols from an alphabet with nothing that reads two ways', () => {
    for (const ch of '01OIL') expect(SIGN_IN_CODE_ALPHABET).not.toContain(ch);
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const c = newSignInCode();
      expect(c).toHaveLength(SIGN_IN_CODE_LENGTH);
      for (const ch of c) expect(SIGN_IN_CODE_ALPHABET).toContain(ch);
      seen.add(c);
    }
    expect(seen.size).toBe(500); // no repeats in 500 (31^8 possibilities)
  });

  it('shows as two halves and reads back however it is typed', () => {
    expect(formatSignInCode('K7MP42QX')).toBe('K7MP-42QX');
    for (const typed of ['K7MP-42QX', 'k7mp42qx', ' k7mp 42qx ', 'K7MP–42QX', 'k7mp_42qx']) expect(normalizeSignInCode(typed)).toBe('K7MP42QX');
  });

  it('anything that is not a code is refused before it is ever sent', () => {
    for (const bad of ['', 'K7MP42Q', 'K7MP42QXX', 'K7MP42Q0', 'K7MP42QI', 'K7MP42Q!', '<script>']) expect(normalizeSignInCode(bad)).toBeNull();
  });

  it('is hashed exactly the way Auth.js hashes its own tokens (sha256 of token + secret, hex)', async () => {
    const data = new TextEncoder().encode('K7MP42QXs3cret');
    const auth = [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map((b) => b.toString(16).padStart(2, '0')).join('');
    expect(verificationTokenHash('K7MP42QX', 's3cret')).toBe(auth);
  });
});
