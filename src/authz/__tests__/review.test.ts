import { describe, expect, it } from 'vitest';
import { HASH_UNCHECKED_LABEL, canReview, hashCheckSkipped, type Reviewer } from '@/authz';
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

describe('content review — a picture the hash check never saw', () => {
  const unchecked = { moderationStatus: 'FLAGGED', moderationDetail: { labels: [HASH_UNCHECKED_LABEL], original: { status: 'FLAGGED', labels: [HASH_UNCHECKED_LABEL] } } };
  const legacyShape = { moderationStatus: 'FLAGGED', moderationDetail: { labels: [HASH_UNCHECKED_LABEL] } }; // profile pictures store labels only

  it('can never be VIEWED or CLEARED (could be known CSAM; clearing would skip the hash gate)', () => {
    for (const item of [unchecked, legacyShape]) {
      expect(canReview(admin, 'view', item).allowed).toBe(false);
      expect(canReview(admin, 'clear', item).allowed).toBe(false);
    }
  });

  it('can still be REMOVED by an admin with two-step login (and by nobody else)', () => {
    expect(canReview(admin, 'remove', unchecked).allowed).toBe(true);
    expect(canReview({ ...admin, mfaVerified: false }, 'remove', unchecked).allowed).toBe(false);
  });

  it('only the UPLOAD\'s verdict counts: a classifier flag or a design flag is reviewed as normal', () => {
    const classifierFlag = { moderationStatus: 'FLAGGED', moderationDetail: { labels: ['Violence'], original: { status: 'FLAGGED', labels: ['Violence'] } } };
    expect(hashCheckSkipped(classifierFlag)).toBe(false);
    for (const action of ['view', 'clear', 'remove'] as const) expect(canReview(admin, action, classifierFlag).allowed).toBe(true);
    const designOnly = { moderationStatus: 'FLAGGED', moderationDetail: { labels: ['drawn-words'], original: { status: 'CLEAR', labels: [] }, design: { status: 'FLAGGED', labels: ['drawn-words'] } } };
    expect(canReview(admin, 'view', designOnly).allowed).toBe(true);
    // an unchecked upload stays unchecked even after a design is added on top
    const uncheckedWithDesign = { moderationStatus: 'FLAGGED', moderationDetail: { labels: [HASH_UNCHECKED_LABEL, 'drawn-words'], original: { status: 'FLAGGED', labels: [HASH_UNCHECKED_LABEL] }, design: { status: 'FLAGGED', labels: ['drawn-words'] } } };
    expect(canReview(admin, 'clear', uncheckedWithDesign).allowed).toBe(false);
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
