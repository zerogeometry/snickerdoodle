import { and, desc, eq, inArray, notInArray } from 'drizzle-orm';
import { auditRecords, rightsRequests, supportRequests } from '@/db/schema';
import type { Reviewer } from '@/authz';
import type { DbHandle } from '../db';
import { assertAdmin } from './today';

/**
 * The admin app's Inbox: everyone waiting on us, whatever way they came. Help-page messages (the same records as the
 * support inbox, whose email copy goes to support@) and data-protection requests and complaints (legal deadlines).
 * Reported pictures are counted on Today and handled in review, where every look is recorded.
 */

export type InboxShow = 'waiting' | 'all';

export interface InboxSupport {
  kind: 'support';
  id: string;
  ref: string;
  topic: string;
  email: string;
  name: string | null;
  orderRef: string | null;
  message: string;
  status: 'OPEN' | 'ANSWERED' | 'CLOSED';
  signedIn: boolean;
  receivedAt: Date;
  emailed: boolean;
}

export interface InboxRights {
  kind: 'rights';
  id: string;
  type: string;
  status: string;
  receivedAt: Date;
  dueAt: Date | null;
  completedAt: Date | null;
  outcome: string | null;
  acknowledged: boolean;
}

export type InboxItem = InboxSupport | InboxRights;

/** Waiting first (data requests by due date, then messages oldest first); "all" adds what's done, newest first. */
export async function inbox(db: DbHandle, reviewer: Reviewer, show: InboxShow = 'waiting', limit = 200): Promise<InboxItem[]> {
  assertAdmin(reviewer);
  const support = await db
    .select()
    .from(supportRequests)
    .where(show === 'waiting' ? eq(supportRequests.status, 'OPEN') : undefined)
    .orderBy(desc(supportRequests.receivedAt))
    .limit(limit);
  const rights = await db
    .select({
      id: rightsRequests.id,
      type: rightsRequests.type,
      status: rightsRequests.status,
      receivedAt: rightsRequests.receivedAt,
      dueAt: rightsRequests.dueAt,
      completedAt: rightsRequests.completedAt,
      outcome: rightsRequests.outcome,
      complaintAckAt: rightsRequests.complaintAckAt,
    })
    .from(rightsRequests)
    .where(show === 'waiting' ? notInArray(rightsRequests.status, ['COMPLETED', 'DECLINED']) : undefined)
    .orderBy(desc(rightsRequests.receivedAt))
    .limit(limit);

  const s: InboxSupport[] = support.map((m) => ({
    kind: 'support',
    id: m.id,
    ref: m.ref,
    topic: m.topic,
    email: m.email,
    name: m.name,
    orderRef: m.orderRef,
    message: m.message,
    status: m.status,
    signedIn: !!m.accountId,
    receivedAt: m.receivedAt,
    emailed: !!m.teamNotifiedAt,
  }));
  const r: InboxRights[] = rights.map((x) => ({ kind: 'rights', id: x.id, type: x.type, status: x.status, receivedAt: x.receivedAt, dueAt: x.dueAt, completedAt: x.completedAt, outcome: x.outcome, acknowledged: !!x.complaintAckAt }));
  if (show === 'all') return [...s, ...r].sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
  const due = (x: InboxRights) => x.dueAt?.getTime() ?? Infinity;
  return [...r.sort((a, b) => due(a) - due(b)), ...s.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())];
}

/** A data request's own words and who sent it: recorded in the audit trail (who looked, when, which request). */
export async function revealRights(db: DbHandle, reviewer: Reviewer, id: string): Promise<{ email: string | null; name: string | null; details: string | null } | null> {
  assertAdmin(reviewer);
  const [x] = await db
    .select({ email: rightsRequests.subjectEmail, name: rightsRequests.requesterName, details: rightsRequests.details })
    .from(rightsRequests)
    .where(eq(rightsRequests.id, id));
  if (!x) return null;
  await db.insert(auditRecords).values({ actorAccountId: reviewer.accountId, actorType: 'ADMIN', event: 'ADMIN_PERSONAL_DATA_VIEWED', targetType: 'rights_request', targetId: id, metadata: { what: 'rights request' } });
  return x;
}

export type RightsMove = 'IN_PROGRESS' | 'CLOCK_PAUSED' | 'COMPLETED' | 'DECLINED';

/** Move a data request along. Finishing it (done or declined) records when, an outcome note, and the audit event. */
export async function setRightsStatus(db: DbHandle, reviewer: Reviewer, id: string, status: RightsMove, outcome: string | null, now = new Date()): Promise<boolean> {
  assertAdmin(reviewer);
  if (!['IN_PROGRESS', 'CLOCK_PAUSED', 'COMPLETED', 'DECLINED'].includes(status)) return false;
  const finished = status === 'COMPLETED' || status === 'DECLINED';
  const note = (outcome ?? '').trim().slice(0, 1000) || null;
  const res = await db
    .update(rightsRequests)
    .set({ status, ...(finished ? { completedAt: now, outcome: note } : {}), ...(status === 'CLOCK_PAUSED' ? { clockPausedAt: now } : {}) })
    .where(and(eq(rightsRequests.id, id), inArray(rightsRequests.status, ['RECEIVED', 'CLOCK_PAUSED', 'IN_PROGRESS'])))
    .returning({ id: rightsRequests.id });
  if (!res.length) return false;
  if (finished) await db.insert(auditRecords).values({ actorAccountId: reviewer.accountId, actorType: 'ADMIN', event: 'RIGHTS_REQUEST_COMPLETED', targetType: 'rights_request', targetId: id, metadata: { status } });
  return true;
}
