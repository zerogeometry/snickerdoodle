import type { Decision } from './policy';

/**
 * Content review (D8): a human looking at a flagged picture is itself a privacy event, so it is
 * rare, minimal, access-controlled and logged. Only an ADMIN who has passed TWO-STEP LOGIN this
 * session may open the queue or see a flagged picture; nobody may see CSAM-hash-BLOCKED content
 * (it is preserved for the report, never viewed or redistributed — the runbook handles it); and a
 * picture that was never flagged is not the reviewer's to look at.
 */
export interface Reviewer {
  /** null = signed out */
  accountId: string | null;
  isAdmin: boolean;
  /** Passed the authenticator-app code this session. */
  mfaVerified: boolean;
}

export type ReviewAction = 'open-queue' | 'view' | 'clear' | 'remove';

export function canReview(reviewer: Reviewer, action: ReviewAction, item?: { moderationStatus: string }): Decision {
  if (!reviewer.accountId) return { allowed: false, reason: 'not signed in' };
  if (!reviewer.isAdmin) return { allowed: false, reason: 'not an admin' };
  if (!reviewer.mfaVerified) return { allowed: false, reason: 'two-step login required' };
  if (action === 'open-queue') return { allowed: true, reason: 'admin with two-step login' };
  if (!item) return { allowed: false, reason: 'no item' };
  if (item.moderationStatus === 'BLOCKED') return { allowed: false, reason: 'blocked content is never viewed or redistributed' };
  if (item.moderationStatus !== 'FLAGGED') return { allowed: false, reason: 'only flagged items are reviewed' };
  return { allowed: true, reason: 'admin with two-step login, flagged item' };
}
