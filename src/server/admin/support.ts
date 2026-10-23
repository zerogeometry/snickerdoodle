import { desc, eq } from 'drizzle-orm';
import { supportRequests } from '@/db/schema';
import { AuthzError, canReview, type Reviewer } from '@/authz';
import type { DbHandle } from '../db';

/**
 * The support inbox (/admin/support): every help-page message, newest first — the same admin +
 * two-step-login gate as the review queue. The email to support@ is the everyday copy; this is the
 * record that can't get lost in a mailbox.
 */
export type SupportStatus = 'OPEN' | 'ANSWERED' | 'CLOSED';

const gate = (r: Reviewer) => {
  const d = canReview(r, 'open-queue');
  if (!d.allowed) throw new AuthzError(d);
};

export async function supportInbox(db: DbHandle, reviewer: Reviewer, show: 'open' | 'all' = 'open', limit = 200) {
  gate(reviewer);
  return db
    .select()
    .from(supportRequests)
    .where(show === 'open' ? eq(supportRequests.status, 'OPEN') : undefined)
    .orderBy(desc(supportRequests.receivedAt))
    .limit(limit);
}

export async function setSupportStatus(db: DbHandle, reviewer: Reviewer, id: string, status: SupportStatus, now = new Date()): Promise<boolean> {
  gate(reviewer);
  if (!['OPEN', 'ANSWERED', 'CLOSED'].includes(status)) return false;
  const res = await db
    .update(supportRequests)
    .set({ status, closedAt: status === 'OPEN' ? null : now })
    .where(eq(supportRequests.id, id))
    .returning({ id: supportRequests.id });
  return res.length > 0;
}
