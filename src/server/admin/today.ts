import { and, eq, gte, inArray, isNotNull, lt, notInArray, or, sql } from 'drizzle-orm';
import { assets, opsAlerts, opsStatus, orderItemArtwork, orderItems, orders, profileImages, promoCodes, rightsRequests, supportRequests } from '@/db/schema';
import { AuthzError, canReview, type Reviewer } from '@/authz';
import { REPORTED_BY_MEMBER_LABEL, REPORTED_LABEL } from '@/lib/reports';
import type { DbHandle } from '../db';
import { buildNeeds, LIMITS, type Need, type NeedFacts } from './needs';

/**
 * The Today screen's data (the admin app): the facts behind the "needs you" list (./needs.ts holds the rules) and
 * the pulse. Admins with two-step login only (the same gate as review and the support inbox).
 */

export const PAID_STATES = ['PAID', 'FULFILLING', 'SHIPPED'] as const;

/** The admin app's gate: an admin who has passed two-step login this session. */
export function assertAdmin(r: Reviewer): void {
  const d = canReview(r, 'open-queue');
  if (!d.allowed) throw new AuthzError(d);
}

/** YYYY-MM-DD of a moment on the London calendar. */
export function londonDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** The UTC instant of 00:00 London time on a London calendar day (GMT or BST). */
export function londonMidnight(ymd: string): Date {
  const guess = new Date(`${ymd}T00:00:00Z`);
  const name = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', timeZoneName: 'shortOffset' }).formatToParts(guess).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-]\d+)?/.exec(name);
  return new Date(guess.getTime() - (m?.[1] ? Number(m[1]) : 0) * 3_600_000);
}

/** Monday 00:00 London of the week `at` is in. */
export function londonWeekStart(at: Date): Date {
  const ymd = londonDay(at);
  const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  const monday = new Date(Date.parse(`${ymd}T00:00:00Z`) - ((dow + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
  return londonMidnight(monday);
}

const REPORT_LABELS = [REPORTED_LABEL, REPORTED_BY_MEMBER_LABEL];
const reportedSql = sql`(${assets.moderationDetail} -> 'labels') ?| array[${sql.join(
  REPORT_LABELS.map((l) => sql`${l}`),
  sql`, `,
)}]`;

/** Everything the needs list looks at, read in one go. */
export async function gatherNeedFacts(db: DbHandle, now = new Date()): Promise<NeedFacts> {
  const notSentBefore = new Date(now.getTime() - LIMITS.notSentHours * 3_600_000);
  const recent = new Date(now.getTime() - LIMITS.recentDays * 86_400_000);

  const troubledRows = await db
    .select({ orderId: orderItems.orderId, state: orderItemArtwork.status, count: sql<number>`count(*)::int` })
    .from(orderItemArtwork)
    .innerJoin(orderItems, eq(orderItems.id, orderItemArtwork.orderItemId))
    .where(inArray(orderItemArtwork.status, ['RENDER_FAILED', 'ERROR', 'BLOCKED_GATE']))
    .groupBy(orderItems.orderId, orderItemArtwork.status);
  const troubledIds = [...new Set(troubledRows.map((r) => r.orderId))];

  const orderRows = await db
    .select({
      id: orders.id,
      ref: orders.ref,
      status: orders.status,
      paidAt: orders.paidAt,
      claimedAt: orders.claimedAt,
      createdAt: orders.createdAt,
      prodigiOrderId: orders.prodigiOrderId,
      submitError: orders.submitError,
      totalPence: orders.totalPence,
      refundedPence: orders.refundedPence,
      refundedAt: orders.refundedAt,
      dispute: orders.dispute,
      handOnly: sql<boolean>`not exists (select 1 from ${orderItems} i where i.order_id = ${orders.id} and i.spec ->> 'providerSku' is not null and coalesce(i.spec ->> 'provider', 'PRODIGI') = 'PRODIGI')`,
    })
    .from(orders)
    .where(
      or(
        and(eq(orders.status, 'PAID'), lt(orders.paidAt, notSentBefore)),
        troubledIds.length ? and(eq(orders.status, 'PAID'), inArray(orders.id, troubledIds)) : sql`false`,
        eq(orders.status, 'FULFILLING'),
        and(eq(orders.status, 'CANCELLED'), isNotNull(orders.prodigiOrderId), gte(orders.createdAt, recent)),
        isNotNull(orders.dispute),
      ),
    );

  const [flagged] = await db
    .select({ n: sql<number>`count(*)::int`, oldest: sql<Date | null>`min(${assets.moderatedAt})` })
    .from(assets)
    .where(eq(assets.moderationStatus, 'FLAGGED'));
  const [flaggedProfiles] = await db
    .select({ n: sql<number>`count(*)::int`, oldest: sql<Date | null>`min(${profileImages.moderatedAt})` })
    .from(profileImages)
    .where(eq(profileImages.moderationStatus, 'FLAGGED'));
  const [reported] = await db
    .select({ n: sql<number>`count(*)::int`, oldest: sql<Date | null>`min(${assets.moderatedAt})` })
    .from(assets)
    .where(and(eq(assets.moderationStatus, 'FLAGGED'), reportedSql));

  const rights = await db
    .select({ id: rightsRequests.id, type: rightsRequests.type, status: rightsRequests.status, receivedAt: rightsRequests.receivedAt, dueAt: rightsRequests.dueAt })
    .from(rightsRequests)
    .where(notInArray(rightsRequests.status, ['COMPLETED', 'DECLINED']));
  const support = await db
    .select({ id: supportRequests.id, ref: supportRequests.ref, topic: supportRequests.topic, receivedAt: supportRequests.receivedAt, orderRef: supportRequests.orderRef })
    .from(supportRequests)
    .where(eq(supportRequests.status, 'OPEN'));
  const status = await db.select().from(opsStatus);
  const handled = await db.select({ key: opsAlerts.key }).from(opsAlerts).where(isNotNull(opsAlerts.handledAt));

  // partner commission for last month, in the first ten days of a month
  let commission: NeedFacts['commission'] = null;
  const today = londonDay(now);
  if (Number(today.slice(8, 10)) <= 10) {
    const thisMonth = londonMidnight(`${today.slice(0, 7)}-01`);
    const lastMonthYmd = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10);
    const lastMonth = londonMidnight(lastMonthYmd);
    const [c] = await db
      .select({ pence: sql<number>`coalesce(sum(${orders.partnerCommissionPence}), 0)::int`, partners: sql<number>`count(distinct coalesce(${promoCodes.partnerName}, ${promoCodes.code}))::int` })
      .from(orders)
      .innerJoin(promoCodes, eq(promoCodes.id, orders.promoCodeId))
      .where(and(inArray(orders.status, [...PAID_STATES]), gte(orders.paidAt, lastMonth), lt(orders.paidAt, thisMonth), sql`${orders.partnerCommissionPence} > 0`));
    const month = new Date(`${lastMonthYmd}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    if (c && c.pence > 0) commission = { month, pence: c.pence, partners: c.partners };
  }

  const at = (v: Date | string | null) => (v ? new Date(v) : null);
  return {
    disputes: orderRows
      .filter((o) => o.dispute)
      .map((o) => ({ ref: o.ref, disputeId: o.dispute!.id, status: o.dispute!.status, reason: o.dispute!.reason, amountPence: o.dispute!.amountPence, dueBy: at(o.dispute!.dueBy), openedAt: new Date(o.dispute!.openedAt) })),
    orders: orderRows.map((o) => ({ ...o, troubled: troubledRows.filter((t) => t.orderId === o.id).map((t) => ({ state: t.state, count: t.count })) })),
    review: { waiting: (flagged?.n ?? 0) + (flaggedProfiles?.n ?? 0), oldestAt: [at(flagged?.oldest ?? null), at(flaggedProfiles?.oldest ?? null)].filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0] ?? null, reported: reported?.n ?? 0, reportedOldestAt: at(reported?.oldest ?? null) },
    rights,
    support,
    status: status.map((s) => ({ key: s.key, ok: s.ok, problems: Array.isArray(s.summary?.problems) ? s.summary.problems.map(String) : [], checkedAt: s.checkedAt })),
    commission,
    handled: new Set(handled.map((h) => h.key)),
  };
}

export async function needsYou(db: DbHandle, now = new Date()): Promise<Need[]> {
  return buildNeeds(await gatherNeedFacts(db, now), now);
}

export interface Pulse {
  ordersToday: number;
  revenueTodayPence: number;
  ordersWeek: number;
  revenueWeekPence: number;
  onTheirWay: number;
  healthy: boolean;
}

/** The four numbers under the list. Totals only. */
export async function pulse(db: DbHandle, now = new Date()): Promise<Pulse> {
  const dayStart = londonMidnight(londonDay(now));
  const weekStart = londonWeekStart(now);
  const paidSince = (from: Date) =>
    db
      .select({ n: sql<number>`count(*)::int`, pence: sql<number>`coalesce(sum(${orders.totalPence}), 0)::int` })
      .from(orders)
      .where(and(inArray(orders.status, [...PAID_STATES]), gte(orders.paidAt, from)));
  const [[day], [week], [moving], status] = await Promise.all([
    paidSince(dayStart),
    paidSince(weekStart),
    db.select({ n: sql<number>`count(*)::int` }).from(orders).where(eq(orders.status, 'FULFILLING')),
    db.select({ ok: opsStatus.ok, key: opsStatus.key }).from(opsStatus),
  ]);
  return {
    ordersToday: day?.n ?? 0,
    revenueTodayPence: day?.pence ?? 0,
    ordersWeek: week?.n ?? 0,
    revenueWeekPence: week?.pence ?? 0,
    onTheirWay: moving?.n ?? 0,
    healthy: status.filter((s) => s.key !== 'prodigi-check').every((s) => s.ok),
  };
}

/** "Done" on a dismissable item: off the list until the problem changes (a new key). */
export async function markHandled(db: DbHandle, reviewer: Reviewer, key: string, now = new Date()): Promise<void> {
  assertAdmin(reviewer);
  await db
    .insert(opsAlerts)
    .values({ key, kind: key.split(':')[0] ?? 'other', firstSeenAt: now, lastSeenAt: now, handledAt: now })
    .onConflictDoUpdate({ target: opsAlerts.key, set: { handledAt: now } });
}
