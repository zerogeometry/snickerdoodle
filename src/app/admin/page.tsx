import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/db/client';
import { assertAdmin, needsYou, pulse } from '@/server/admin/today';
import { LIMITS, pounds, waited } from '@/server/admin/needs';
import { AdminShell, AdminStat, adminOr404, type AdminReviewer } from './AdminShell';
import { TodayList } from './TodayList';

export const metadata: Metadata = { title: 'today · admin', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Today: the admin app's home (project-office/briefs/ADMIN-APP-plan.md). What needs a person, most urgent first,
 * each with the button that deals with it; then four numbers. Admins with two-step login only; "not found" to
 * anyone else.
 */
export default async function TodayPage() {
  const r = await adminOr404();
  return (
    <AdminShell section="today" title="today" blurb="What needs you, most urgent first. Urgent things are emailed straight away; everything is in the 7am email." reviewer={r}>
      <Today reviewer={r} />
    </AdminShell>
  );
}

async function Today({ reviewer }: { reviewer: AdminReviewer }) {
  assertAdmin(reviewer); // AdminShell renders this only after two-step login; checked again here all the same
  const db = getDb();
  const now = new Date();
  const [items, p] = await Promise.all([needsYou(db, now), pulse(db, now)]);
  const day = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' });
  return (
    <>
      <h2 className="mt-6 font-display text-xl text-cocoa">
        needs you{items.length ? <span className="ml-2 rounded-pill bg-cta px-2.5 py-0.5 align-middle text-sm text-white">{items.length}</span> : null}
      </h2>
      <TodayList
        items={items.map((n) => ({
          key: n.key,
          kind: n.kind,
          title: n.title,
          detail: n.detail,
          waited: waited(n.since, now),
          due: n.due ? day(n.due) : null,
          dueSoon: !!n.due && n.due.getTime() - now.getTime() < LIMITS.rightsSoonDays * 86_400_000,
          href: n.href,
          action: n.action,
          urgent: n.urgent,
          dismissable: n.dismissable,
        }))}
      />
      <h2 className="mt-8 font-display text-xl text-cocoa">the pulse</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <AdminStat label="orders today" value={p.ordersToday} note={pounds(p.revenueTodayPence)} />
        <AdminStat label="this week" value={pounds(p.revenueWeekPence)} note={`${p.ordersWeek} order${p.ordersWeek === 1 ? '' : 's'} since Monday`} />
        <AdminStat label="on their way" value={p.onTheirWay} note="at Prodigi, not shipped yet" />
        <AdminStat label="the site" value={p.healthy ? 'all well' : 'needs a look'} tone={p.healthy ? 'good' : 'bad'} note={<Link href="/admin/health" className="underline underline-offset-2">health</Link>} />
      </div>
    </>
  );
}
