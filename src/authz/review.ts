import type { Decision } from './policy';

/**
 * Content review (D8): a human looking at a flagged picture is itself a privacy event, so it is
 * rare, minimal, access-controlled and logged. Only an ADMIN who has passed TWO-STEP LOGIN this
 * session may open the queue or see a flagged picture; nobody may see CSAM-hash-BLOCKED content
 * (it is preserved for the report, never viewed or redistributed — the runbook handles it); and a
 * picture that was never flagged is not the reviewer's to look at.
 *
 * A picture whose known-CSAM hash check could NOT run (provider down, IWF not configured) is held
 * for review, but review may neither SHOW it nor CLEAR it: looking at it could mean a person viewing
 * known CSAM, and clearing it would let it skip the hash gate. It can only be removed — or the
 * parent uploads it again once the hash check is back.
 */

/** The label the moderation gate puts on an upload whose hash check couldn't run. */
export const HASH_UNCHECKED_LABEL = 'hash-check-unavailable';
export interface Reviewer {
  /** null = signed out */
  accountId: string | null;
  isAdmin: boolean;
  /** Passed the authenticator-app code this session. */
  mfaVerified: boolean;
}

export type ReviewAction = 'open-queue' | 'view' | 'clear' | 'remove';

/** The item as stored: its status, and the verdict detail that says which checks ran. */
export interface ReviewSubject {
  moderationStatus: string;
  moderationDetail?: unknown;
}

/** Did this item's UPLOAD skip the hash check? (A Studio design is never hash-checked — the upload is.) */
export function hashCheckSkipped(item: ReviewSubject): boolean {
  const d = (item.moderationDetail ?? {}) as { labels?: unknown; original?: { labels?: unknown } };
  const labels = Array.isArray(d.original?.labels) ? d.original.labels : Array.isArray(d.labels) ? d.labels : [];
  return labels.includes(HASH_UNCHECKED_LABEL);
}

export function canReview(reviewer: Reviewer, action: ReviewAction, item?: ReviewSubject): Decision {
  if (!reviewer.accountId) return { allowed: false, reason: 'not signed in' };
  if (!reviewer.isAdmin) return { allowed: false, reason: 'not an admin' };
  if (!reviewer.mfaVerified) return { allowed: false, reason: 'two-step login required' };
  if (action === 'open-queue') return { allowed: true, reason: 'admin with two-step login' };
  if (!item) return { allowed: false, reason: 'no item' };
  if (item.moderationStatus === 'BLOCKED') return { allowed: false, reason: 'blocked content is never viewed or redistributed' };
  if (item.moderationStatus !== 'FLAGGED') return { allowed: false, reason: 'only flagged items are reviewed' };
  if (action !== 'remove' && hashCheckSkipped(item)) return { allowed: false, reason: 'the known-CSAM hash check never ran on this picture — it can be removed, never viewed or cleared' };
  return { allowed: true, reason: 'admin with two-step login, flagged item' };
}
