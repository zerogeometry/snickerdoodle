import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/db/client';
import { inbox, type InboxRights, type InboxShow, type InboxSupport } from '@/server/admin/inbox';
import { LIMITS } from '@/server/admin/needs';
import { supportTopic } from '@/lib/support';
import { AdminEmpty, AdminShell, adminOr404, type AdminReviewer } from '../AdminShell';
import { SupportList } from '../support/SupportClient';
import { RightsList } from './RightsList';

export const metadata: Metadata = { title: 'inbox · admin', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * The Inbox: everyone waiting on us. Data requests and complaints first (legal deadlines), then help-page messages,
 * oldest first. Replies are still written in email (support@); mark them here.
 */
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const r = await adminOr404();
  const show: InboxShow = (await searchParams).show === 'all' ? 'all' : 'waiting';
  return (
    <AdminShell section="inbox" title="inbox" blurb="Everyone waiting on us. Reply by email (it opens with the reference filled in), then mark it here." reviewer={r}>
      <div className="mt-5 flex gap-2 text-sm" role="group" aria-label="show">
        {(['waiting', 'all'] as const).map((s) => (
          <Link
            key={s}
            href={s === 'waiting' ? '/admin/inbox' : '/admin/inbox?show=all'}
            aria-current={show === s ? 'true' : undefined}
            className={`inline-flex min-h-11 items-center rounded-pill border-2 px-4 font-bold ${show === s ? 'border-cocoa bg-honey-band text-cocoa' : 'border-cocoa/20 text-ink-soft'}`}
          >
            {s === 'waiting' ? 'waiting' : 'everything'}
          </Link>
        ))}
      </div>
      <Items reviewer={r} show={show} />
    </AdminShell>
  );
}

async function Items({ reviewer, show }: { reviewer: AdminReviewer; show: InboxShow }) {
  const items = await inbox(getDb(), reviewer, show);
  const now = Date.now();
  const rights = items.filter((i): i is InboxRights => i.kind === 'rights');
  const support = items.filter((i): i is InboxSupport => i.kind === 'support');
  if (items.length === 0) return <AdminEmpty title="inbox zero">Nobody is waiting for a reply.</AdminEmpty>;
  return (
    <>
      <RightsList
        items={rights.map((x) => ({
          id: x.id,
          type: x.type,
          status: x.status,
          receivedAt: x.receivedAt.toISOString(),
          dueAt: x.dueAt?.toISOString() ?? null,
          dueSoon: !!x.dueAt && x.dueAt.getTime() - now < LIMITS.rightsSoonDays * 86_400_000,
          outcome: x.outcome,
          acknowledged: x.acknowledged,
        }))}
      />
      {support.length ? (
        <section aria-label="help messages" className="mt-6">
          <h2 className="font-display text-xl text-cocoa">help messages</h2>
          <SupportList
            items={support.map((m) => ({
              id: m.id,
              ref: m.ref,
              topic: supportTopic(m.topic)?.label ?? m.topic,
              email: m.email,
              name: m.name,
              orderRef: m.orderRef,
              message: m.message,
              status: m.status,
              signedIn: m.signedIn,
              receivedAt: m.receivedAt.toISOString(),
              emailed: m.emailed,
            }))}
          />
        </section>
      ) : null}
    </>
  );
}
