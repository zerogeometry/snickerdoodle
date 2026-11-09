import { describe, expect, it } from 'vitest';
import { canReview, hashDeferredSensitive, reviewRemoveOnly, type Reviewer } from '@/authz';

/**
 * Founder decision D25 (9 Nov 2026): until IWF is connected, uploads are screened by the classifier
 * and the drawn-words check alone. A deferred item flagged for anything sexual, unknown or unreadable
 * is REMOVE-ONLY — no person may open it. Part of the review authz matrix (launch gate).
 */

const admin: Reviewer = { accountId: 'a1', isAdmin: true, mfaVerified: true };
const keepsake = (original: Record<string, unknown>, design?: Record<string, unknown>) => ({
  moderationStatus: 'FLAGGED',
  moderationDetail: { labels: (original.labels as string[]) ?? [], original: { status: 'FLAGGED', labels: [], ...original }, ...(design ? { design } : {}) },
});

describe('review with the hash check deferred (D25)', () => {
  it('possibly sexual (or unknown / unreadable): remove only, never viewed or cleared', () => {
    const item = keepsake({ labels: ['Exposed Male Genitalia'], hashCheck: 'deferred', sensitive: true });
    expect(canReview(admin, 'view', item).allowed).toBe(false);
    expect(canReview(admin, 'clear', item).allowed).toBe(false);
    expect(canReview(admin, 'remove', item).allowed).toBe(true);
    expect(reviewRemoveOnly(item)).toBe(true);
  });

  it('a deferred verdict that does not say sensitive:false counts as sensitive (fail-safe)', () => {
    const item = keepsake({ labels: ['Violence'], hashCheck: 'deferred' });
    expect(hashDeferredSensitive(item)).toBe(true);
    expect(canReview(admin, 'view', item).allowed).toBe(false);
  });

  it('flagged only for violence, hate symbols, rude gestures or words: a reviewer may look and decide', () => {
    const item = keepsake({ labels: ['Middle Finger', 'drawn-words'], hashCheck: 'deferred', sensitive: false });
    for (const action of ['view', 'clear', 'remove'] as const) expect(canReview(admin, action, item).allowed).toBe(true);
    expect(reviewRemoveOnly(item)).toBe(false);
  });

  it('a clean upload with a sensitive Studio design on top is remove-only too (the design shows the upload)', () => {
    const item = keepsake({ status: 'CLEAR', labels: [], hashCheck: 'deferred', sensitive: false }, { status: 'FLAGGED', labels: ['Explicit'], sensitive: true });
    expect(canReview(admin, 'view', item).allowed).toBe(false);
    expect(canReview(admin, 'remove', item).allowed).toBe(true);
  });

  it('profile pictures store the deferral at the top level — same rule', () => {
    const sensitive = { moderationStatus: 'FLAGGED', moderationDetail: { labels: ['Explicit'], hashCheck: 'deferred', sensitive: true } };
    const fine = { moderationStatus: 'FLAGGED', moderationDetail: { labels: ['Hate Symbols'], hashCheck: 'deferred', sensitive: false } };
    expect(canReview(admin, 'view', sensitive).allowed).toBe(false);
    expect(canReview(admin, 'view', fine).allowed).toBe(true);
  });

  it('with IWF connected (no deferral) the old rules apply unchanged', () => {
    const item = keepsake({ labels: ['Explicit'] });
    expect(hashDeferredSensitive(item)).toBe(false);
    expect(canReview(admin, 'view', item).allowed).toBe(true);
  });

  it('still only for a signed-in admin with two-step login', () => {
    const item = keepsake({ labels: ['Violence'], hashCheck: 'deferred', sensitive: false });
    expect(canReview({ ...admin, mfaVerified: false }, 'view', item).allowed).toBe(false);
    expect(canReview({ ...admin, isAdmin: false }, 'remove', item).allowed).toBe(false);
  });
});
