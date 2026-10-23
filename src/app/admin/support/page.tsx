import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/db/client';
import { currentReviewer } from '@/server/admin/context';
import { supportInbox } from '@/server/admin/support';
import { supportTopic } from '@/lib/support';
import { FlowHeader } from '@/ui/components/FlowHeader';
import { MfaGate } from '../review/ReviewClient';
import { SupportList } from './SupportClient';

export const metadata: Metadata = { title: 'support inbox', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/** The support inbox — admins only, behind two-step login; to anyone else it doesn't exist (404). */
export default async function SupportInboxPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const r = await currentReviewer();
  if (!r.accountId || !r.isAdmin) notFound();
  const show = (await searchParams).show === 'all' ? 'all' : 'open';

  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <FlowHeader tag="admin" />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-6 md:px-6">
        <nav aria-label="admin" className="flex gap-4 text-sm font-bold">
          <Link href="/admin/review" className="text-ink-soft underline underline-offset-2">content review</Link>
          <span className="text-cocoa" aria-current="page">support inbox</span>
        </nav>
        <h1 className="mt-3 font-display text-3xl text-cocoa">support inbox</h1>
        <p className="mt-1 max-w-xl text-sm text-ink-soft">Messages from the help page. Each one was also emailed to the support inbox — reply by email, then mark it here.</p>
        {!r.mfaVerified ? <MfaGate enrolled={r.enrolled} /> : <Inbox reviewer={r} show={show} />}
      </main>
    </div>
  );
}

async function Inbox({ reviewer, show }: { reviewer: Awaited<ReturnType<typeof currentReviewer>>; show: 'open' | 'all' }) {
  const rows = await supportInbox(getDb(), reviewer, show);
  return (
    <>
      <div className="mt-5 flex gap-2 text-sm" role="group" aria-label="show">
        <Link href="/admin/support" aria-current={show === 'open' ? 'true' : undefined} className={`inline-flex min-h-11 items-center rounded-pill border-2 px-4 font-bold ${show === 'open' ? 'border-cocoa bg-honey-band text-cocoa' : 'border-cocoa/20 text-ink-soft'}`}>
          open
        </Link>
        <Link href="/admin/support?show=all" aria-current={show === 'all' ? 'true' : undefined} className={`inline-flex min-h-11 items-center rounded-pill border-2 px-4 font-bold ${show === 'all' ? 'border-cocoa bg-honey-band text-cocoa' : 'border-cocoa/20 text-ink-soft'}`}>
          everything
        </Link>
      </div>
      <SupportList
        items={rows.map((m) => ({
          id: m.id,
          ref: m.ref,
          topic: supportTopic(m.topic)?.label ?? m.topic,
          email: m.email,
          name: m.name,
          orderRef: m.orderRef,
          message: m.message,
          status: m.status,
          signedIn: !!m.accountId,
          receivedAt: m.receivedAt.toISOString(),
          emailed: !!m.teamNotifiedAt,
        }))}
      />
    </>
  );
}
