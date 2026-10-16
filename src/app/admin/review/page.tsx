import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDb } from '@/db/client';
import { currentReviewer } from '@/server/admin/context';
import { reviewQueue } from '@/server/admin/review';
import { FlowHeader } from '@/ui/components/FlowHeader';
import { MfaGate, ReviewList } from './ReviewClient';

export const metadata: Metadata = { title: 'content review', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * The content-review queue (D8) — admins only, behind two-step login. To anyone else it simply
 * doesn't exist (404), so the page can't even be found by poking around.
 */
export default async function ReviewPage() {
  const r = await currentReviewer();
  if (!r.accountId || !r.isAdmin) notFound();

  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <FlowHeader tag="admin" />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-6 md:px-6">
        <h1 className="font-display text-3xl text-cocoa">content review</h1>
        <p className="mt-1 max-w-xl text-sm text-ink-soft">
          Pictures the safety checks held back. Looking at a child&apos;s picture is a privacy event: pictures stay hidden until you choose to look, and every look and decision is recorded.
        </p>
        {!r.mfaVerified ? <MfaGate enrolled={r.enrolled} /> : <Queue reviewer={r} />}
      </main>
    </div>
  );
}

async function Queue({ reviewer }: { reviewer: Awaited<ReturnType<typeof currentReviewer>> }) {
  const { items, blocked } = await reviewQueue(getDb(), reviewer);
  return (
    <>
      {blocked > 0 ? (
        <div role="note" className="mt-6 rounded-[16px] border-2 border-cocoa bg-berry-pale p-4 text-sm text-cocoa">
          <b>{blocked} item{blocked === 1 ? '' : 's'} matched a known-illegal image list.</b> These are never shown — not here, not to anyone. They are preserved for the report: follow the illegal-content runbook.
        </div>
      ) : null}
      <ReviewList items={items.map((i) => ({ ...i, flaggedAt: i.flaggedAt?.toISOString() ?? null }))} />
    </>
  );
}
