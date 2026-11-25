import { and, eq, gte, inArray, isNotNull, isNull, lt, notInArray, sql } from 'drizzle-orm';
import { opsAlerts, orderItems, orders, products } from '@/db/schema';
import { SUPPORT_EMAIL } from '@/lib/support';
import { appUrl, sendMail, type MailMessage } from '../mail';
import type { DbHandle } from '../db';
import { pounds, waited, type Need } from './needs';
import { londonDay, londonMidnight, needsYou, PAID_STATES, type NeedScope } from './today';

/**
 * The admin app's emails (project-office/briefs/ADMIN-APP-plan.md):
 *  - URGENT, straight away, once per problem: a chargeback, a reported picture, an order stuck past its limit, a
 *    refund on an order already at Prodigi. Site problems are left out here: the server's watchdog already emails
 *    those itself.
 *  - THE MORNING EMAIL at 7am London: yesterday's orders, this week so far, and everything on the Today list; on a
 *    Monday, last week's numbers too. Nothing is sent on a quiet day with nothing to say.
 * References, amounts and counts only: never a customer's name, email or address, never a picture.
 */

type Send = (m: MailMessage) => Promise<void>;
const teamInbox = (env: Record<string, string | undefined> = process.env) => (env.ADMIN_EMAIL_TO ?? '').trim() || (env.SUPPORT_INBOX ?? '').trim() || SUPPORT_EMAIL;

/** Which urgent items this run should email: new ones not already emailed or marked done. Pure. */
export function newUrgent(needs: Need[], told: Map<string, { emailedAt: Date | null; handledAt: Date | null }>): Need[] {
  return needs.filter((n) => n.urgent && n.kind !== 'site' && !told.get(n.key)?.emailedAt && !told.get(n.key)?.handledAt);
}

export function urgentEmail(items: Need[], now: Date, env?: Record<string, string | undefined>): { subject: string; text: string } {
  const first = items[0]!;
  return {
    subject: items.length === 1 ? `[snickerdoodle] needs you now: ${first.title}` : `[snickerdoodle] ${items.length} things need you now`,
    text: [
      items.length === 1 ? 'This needs you now:' : 'These need you now:',
      '',
      ...items.flatMap((n) => [`• ${n.title}`, `  ${n.detail}`, `  ${n.href.startsWith('http') ? n.href : appUrl(n.href, env)}`, '']),
      `Everything that needs you: ${appUrl('/admin', env)}`,
      `(sent ${now.toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}, once per problem)`,
    ].join('\n'),
  };
}

/** The every-5-minutes run: email new urgent problems once; note the ones that have cleared. */
export async function runUrgentAlerts(db: DbHandle, opts: { now?: Date; send?: Send; env?: Record<string, string | undefined>; scope?: NeedScope } = {}): Promise<{ urgent: number; emailed: number; cleared: number }> {
  const now = opts.now ?? new Date();
  const send = opts.send ?? sendMail;
  const needs = await needsYou(db, now, opts.scope);
  const urgent = needs.filter((n) => n.urgent && n.kind !== 'site');
  const keys = urgent.map((n) => n.key);
  const rows = keys.length ? await db.select().from(opsAlerts).where(inArray(opsAlerts.key, keys)) : [];
  const told = new Map(rows.map((r) => [r.key, { emailedAt: r.emailedAt, handledAt: r.handledAt }]));
  for (const n of urgent) {
    await db
      .insert(opsAlerts)
      .values({ key: n.key, kind: n.kind, firstSeenAt: now, lastSeenAt: now })
      .onConflictDoUpdate({ target: opsAlerts.key, set: { lastSeenAt: now, resolvedAt: null } });
  }
  const fresh = newUrgent(urgent, told);
  if (fresh.length) {
    await send({ kind: 'order-ops', to: teamInbox(opts.env), ...urgentEmail(fresh, now, opts.env) });
    await db.update(opsAlerts).set({ emailedAt: now }).where(inArray(opsAlerts.key, fresh.map((n) => n.key)));
  }
  // emailed problems no longer on the list have cleared
  const cleared = await db
    .update(opsAlerts)
    .set({ resolvedAt: now })
    .where(and(isNotNull(opsAlerts.emailedAt), isNull(opsAlerts.resolvedAt), keys.length ? notInArray(opsAlerts.key, keys) : sql`true`, opts.scope ? sql`${opsAlerts.key} like ${'%' + opts.scope.orderRefPrefix + '%'}` : sql`true`))
    .returning({ key: opsAlerts.key });
  return { urgent: urgent.length, emailed: fresh.length, cleared: cleared.length };
}

/** Sales between two moments (an admin's sample orders at cost are never sales). */
async function salesBetween(db: DbHandle, from: Date, to: Date) {
  const [t] = await db
    .select({ n: sql<number>`count(*)::int`, pence: sql<number>`coalesce(sum(${orders.totalPence}), 0)::int` })
    .from(orders)
    .where(and(inArray(orders.status, [...PAID_STATES]), eq(orders.isSample, false), gte(orders.paidAt, from), lt(orders.paidAt, to)));
  const top = await db
    .select({ label: sql<string>`coalesce(${products.label}, ${orderItems.productKey})`, units: sql<number>`sum(${orderItems.qty})::int` })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .leftJoin(products, eq(products.key, orderItems.productKey))
    .where(and(inArray(orders.status, [...PAID_STATES]), eq(orders.isSample, false), gte(orders.paidAt, from), lt(orders.paidAt, to)))
    .groupBy(sql`1`)
    .orderBy(sql`2 desc`)
    .limit(5);
  return { orders: t?.n ?? 0, pence: t?.pence ?? 0, top };
}

const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The morning email's text, or null on a quiet day (no orders yesterday, nothing on the list, not a Monday). */
export async function morningEmail(db: DbHandle, now = new Date(), env?: Record<string, string | undefined>): Promise<{ subject: string; text: string } | null> {
  const today = londonDay(now);
  const todayStart = londonMidnight(today);
  const yesterday = await salesBetween(db, londonMidnight(addDays(today, -1)), todayStart);
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = dow === 1;
  const weekStart = londonMidnight(addDays(today, -((dow + 6) % 7)));
  const week = monday ? null : await salesBetween(db, weekStart, todayStart);
  const lastWeek = monday ? await salesBetween(db, londonMidnight(addDays(today, -7)), todayStart) : null;
  const needs = await needsYou(db, now);
  if (!yesterday.orders && !needs.length && !monday) return null;

  const lines: string[] = [];
  lines.push(`Yesterday: ${yesterday.orders} order${yesterday.orders === 1 ? '' : 's'}, ${pounds(yesterday.pence)}.`);
  if (week) lines.push(`This week so far: ${week.orders} order${week.orders === 1 ? '' : 's'}, ${pounds(week.pence)}.`);
  if (lastWeek) {
    lines.push('', `Last week: ${lastWeek.orders} order${lastWeek.orders === 1 ? '' : 's'}, ${pounds(lastWeek.pence)}.`);
    if (lastWeek.top.length) lines.push(`Best sellers: ${lastWeek.top.map((t) => `${t.label} (${t.units})`).join(', ')}.`);
    lines.push(`The full week, channels and the gift loop: ${appUrl('/admin/week', env)}`);
  }
  lines.push('');
  if (needs.length) {
    lines.push(`Needs you (${needs.length}):`);
    for (const n of needs.slice(0, 15)) lines.push(`• ${n.title} (waiting ${waited(n.since, now)}${n.due ? `, due ${n.due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''})`);
    if (needs.length > 15) lines.push(`…and ${needs.length - 15} more.`);
  } else lines.push('Nothing needs you today.');
  lines.push('', `Open today: ${appUrl('/admin', env)}`);
  const dayName = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' });
  return { subject: `[snickerdoodle] today, ${dayName}${needs.length ? ` · ${needs.length} need${needs.length === 1 ? 's' : ''} you` : ''}`, text: lines.join('\n') };
}

/**
 * The morning run. The scheduler calls it at 06:00 and 07:00 UTC; it sends only in the 7 o'clock London hour (GMT
 * or BST) and only once a day (an ops_alerts row per day remembers).
 */
export async function runMorning(db: DbHandle, opts: { now?: Date; send?: Send; env?: Record<string, string | undefined>; force?: boolean } = {}): Promise<{ sent: boolean; reason: string }> {
  const now = opts.now ?? new Date();
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }).format(now));
  if (!opts.force && hour !== 7) return { sent: false, reason: `not 7am in London (${hour}h)` };
  const key = `morning:${londonDay(now)}`;
  const [already] = await db.select({ key: opsAlerts.key }).from(opsAlerts).where(and(eq(opsAlerts.key, key), isNotNull(opsAlerts.emailedAt)));
  if (already) return { sent: false, reason: 'already sent today' };
  const email = await morningEmail(db, now, opts.env);
  await db.insert(opsAlerts).values({ key, kind: 'morning', firstSeenAt: now, lastSeenAt: now, emailedAt: now }).onConflictDoUpdate({ target: opsAlerts.key, set: { emailedAt: now } });
  if (!email) return { sent: false, reason: 'a quiet day' };
  await (opts.send ?? sendMail)({ kind: 'order-ops', to: teamInbox(opts.env), ...email });
  return { sent: true, reason: 'sent' };
}
