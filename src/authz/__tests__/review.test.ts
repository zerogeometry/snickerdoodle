import { describe, expect, it } from 'vitest';
import { canReview, type Reviewer } from '@/authz';
import { base32Encode, openSecret, sealSecret, totpCode, verifyTotp } from '@/server/admin/totp';
import { signStepUp, verifyStepUp } from '@/server/admin/stepUp';

const admin: Reviewer = { accountId: 'a1', isAdmin: true, mfaVerified: true };
const FLAGGED = { moderationStatus: 'FLAGGED' };

describe('content review — who may look (launch gate: authz matrix)', () => {
  it('only a signed-in admin who passed two-step login gets in', () => {
    expect(canReview({ accountId: null, isAdmin: false, mfaVerified: false }, 'open-queue').allowed).toBe(false);
    expect(canReview({ accountId: 'p1', isAdmin: false, mfaVerified: true }, 'open-queue').allowed).toBe(false);
    expect(canReview({ accountId: 'a1', isAdmin: true, mfaVerified: false }, 'open-queue').allowed).toBe(false);
    expect(canReview(admin, 'open-queue').allowed).toBe(true);
  });

  it('every action on an item needs the same, and the item must be FLAGGED', () => {
    for (const action of ['view', 'clear', 'remove'] as const) {
      expect(canReview(admin, action, FLAGGED).allowed).toBe(true);
      expect(canReview({ ...admin, mfaVerified: false }, action, FLAGGED).allowed).toBe(false);
      expect(canReview({ ...admin, isAdmin: false }, action, FLAGGED).allowed).toBe(false);
      expect(canReview(admin, action, { moderationStatus: 'CLEAR' }).allowed).toBe(false); // not the reviewer's to look at
      expect(canReview(admin, action, { moderationStatus: 'PENDING' }).allowed).toBe(false);
      expect(canReview(admin, action).allowed).toBe(false);
    }
  });

  it('CSAM-blocked content is never viewed, cleared or removed through review — by anyone', () => {
    for (const action of ['view', 'clear', 'remove'] as const) expect(canReview(admin, action, { moderationStatus: 'BLOCKED' }).allowed).toBe(false);
  });
});

describe('two-step login', () => {
  it('makes the standard authenticator codes (RFC 6238 test vector)', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(totpCode(secret, 59_000)).toBe('287082');
    expect(totpCode(secret, 1_111_111_109_000)).toBe('081804');
  });

  it('accepts the current code and one step either side, nothing else', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    const now = 1_111_111_109_000;
    expect(verifyTotp(secret, totpCode(secret, now), now)).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, now - 30_000), now)).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, now - 90_000), now)).toBe(false);
    expect(verifyTotp(secret, '12345', now)).toBe(false);
    expect(verifyTotp(secret, 'abcdef', now)).toBe(false);
  });

  it('the secret is stored sealed, and a tampered seal opens to nothing', () => {
    const sealed = sealSecret('JBSWY3DPEHPK3PXP');
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(openSecret(sealed)).toBe('JBSWY3DPEHPK3PXP');
    expect(openSecret(sealed.slice(0, -2) + 'xx')).toBeNull();
  });

  it('the step-up cookie is bound to the account, signed, and expires', () => {
    const now = 1_700_000_000_000;
    const c = signStepUp('a1', now);
    expect(verifyStepUp(c, 'a1', now + 1000)).toBe(true);
    expect(verifyStepUp(c, 'someone-else', now)).toBe(false);
    expect(verifyStepUp(c, 'a1', now + 9 * 3_600_000)).toBe(false); // past 8 hours
    expect(verifyStepUp(c.replace('a1.', 'a2.'), 'a2', now)).toBe(false); // forged account
  });
});
