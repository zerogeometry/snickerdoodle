import type { Metadata } from 'next';
import { getDb } from '@/db/client';
import type { currentReviewer } from '@/server/admin/context';
import { reviewQueue } from '@/server/admin/review';
import { AdminShell, adminOr404 } from '../AdminShell';
import { ReviewList } from './ReviewClient';

export const metadata: Metadata = { title: 'content review', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * The content-review queue (D8) — admins only, behind two-step login. To anyone else it simply
 * doesn't exist (404), so the page can't even be found by poking around.
 */
export default async function ReviewPage() {
  const r = await adminOr404();
  return (
    <AdminShell
      section="review"
      title="content review"
      blurb="Pictures the safety checks held back. Looking at a child's picture is a privacy event: pictures stay hidden until you choose to look, and every look and decision is recorded."
      reviewer={r}
    >
      <Queue reviewer={r} />
    </AdminShell>
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
