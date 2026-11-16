import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { getDb } from '@/db/client';
import { formatPence } from '@/pricing/format';
import { commissionOwed, isMonth, lastMonth, listCodes, type CodeFilter } from '@/server/admin/codes';
import { AdminEmpty, AdminShell, AdminStat, adminOr404, type AdminReviewer } from '../AdminShell';
import { CodeList, CommissionPartners, NewCode, SectionError, SectionSkeleton } from './CodesClient';

export const metadata: Metadata = { title: 'codes · admin', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const FILTERS: { id: CodeFilter; label: string }[] = [
  { id: 'active', label: 'switched on' },
  { id: 'off', label: 'switched off' },
  { id: 'all', label: 'everything' },
];

/** Discount + partner codes (the admin app): make one, switch one off or on, and see what each partner is owed. */
export default async function CodesPage({ searchParams }: { searchParams: Promise<{ show?: string; month?: string }> }) {
  const reviewer = await adminOr404();
  const sp = await searchParams;
  const show: CodeFilter = sp.show === 'off' ? 'off' : sp.show === 'all' ? 'all' : 'active';
  const month = isMonth(sp.month) ? sp.month : lastMonth();
  const href = (q: { show?: CodeFilter; month?: string }) => {
    const p = new URLSearchParams();
    const s = q.show ?? show;
    if (s !== 'active') p.set('show', s);
    const m = q.month ?? sp.month;
    if (isMonth(m)) p.set('month', m);
    const qs = p.toString();
    return `/admin/codes${qs ? `?${qs}` : ''}`;
  };

  return (
    <AdminShell
      section="codes"
      title="codes"
      reviewer={reviewer}
      blurb="Discount and partner codes. The shop works out what a code is worth at checkout, and a code never takes an order below its margin floor, whatever it says here."
    >
      <NewCode />

      <section aria-labelledby="codes-list" className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="codes-list" className="font-display text-xl text-cocoa">
            the codes
          </h2>
          <div className="flex flex-wrap gap-2 text-sm" role="group" aria-label="show">
            {FILTERS.map((f) => (
              <Link
                key={f.id}
                href={href({ show: f.id })}
                aria-current={show === f.id ? 'true' : undefined}
                className={`inline-flex min-h-11 items-center rounded-pill border-2 px-4 font-bold ${show === f.id ? 'border-cocoa bg-honey-band text-cocoa' : 'border-cocoa/20 bg-paper text-ink-soft hover:border-cocoa'}`}
              >
                {f.label}
              </Link>
            ))}
          </div>
        </div>
        <Suspense key={show} fallback={<SectionSkeleton label="loading the codes" rows={3} />}>
          <Codes reviewer={reviewer} show={show} />
        </Suspense>
      </section>

      <section id="commission" aria-labelledby="commission-title" className="mt-10 scroll-mt-4">
        <h2 id="commission-title" className="font-display text-xl text-cocoa">
          commission owed
        </h2>
        <p className="mt-1 max-w-xl text-sm text-ink-soft">
          What each partner earned on orders paid in a month (UK time). A creator earns on a follower’s first paid order; a school PTA on every order. Refunded and cancelled orders don’t count.
        </p>
        <form method="get" action="/admin/codes#commission" className="mt-3 flex flex-wrap items-end gap-2">
          {show !== 'active' ? <input type="hidden" name="show" value={show} /> : null}
          <label className="text-sm font-bold text-cocoa">
            month
            <input
              type="month"
              name="month"
              defaultValue={month}
              required
              className="mt-1 block h-11 rounded-[14px] border-2 border-cocoa/25 bg-paper px-3 text-[16px] text-cocoa focus:border-cocoa focus:outline-none"
            />
          </label>
          <button type="submit" className="inline-flex min-h-11 items-center rounded-pill border-2 border-cocoa bg-paper px-4 text-sm font-bold text-cocoa hover:bg-honey-band">
            show
          </button>
        </form>
        <Suspense key={month} fallback={<SectionSkeleton label="adding up commission" rows={2} />}>
          <Commission reviewer={reviewer} month={month} />
        </Suspense>
      </section>
    </AdminShell>
  );
}

async function Codes({ reviewer, show }: { reviewer: AdminReviewer; show: CodeFilter }) {
  let data: Awaited<ReturnType<typeof listCodes>>;
  try {
    data = await listCodes(getDb(), reviewer, show);
  } catch (e) {
    console.error('[admin/codes] list failed', e);
    return <SectionError>The codes didn’t load. Refresh to try again; nothing has changed.</SectionError>;
  }
  const { codes, referrals } = data;
  return (
    <>
      {codes.length === 0 ? (
        <AdminEmpty title={show === 'off' ? 'nothing switched off' : show === 'active' ? 'no codes switched on' : 'no codes yet'}>
          {show === 'off' ? 'Every code is still working.' : 'Make the first one with “new code” above.'}
        </AdminEmpty>
      ) : (
        <CodeList
          codes={codes.map((c) => ({
            ...c,
            startsAt: c.startsAt?.toISOString() ?? null,
            endsAt: c.endsAt?.toISOString() ?? null,
            createdAt: c.createdAt.toISOString(),
          }))}
        />
      )}
      {show !== 'off' && referrals.codes > 0 ? (
        <div className="mt-4 rounded-[20px] border-2 border-dashed border-cocoa/25 bg-paper p-4 text-sm text-ink-soft">
          <p className="font-bold text-cocoa">parents’ referral codes, all together</p>
          <p className="mt-1">
            {referrals.codes} personal code{referrals.codes === 1 ? '' : 's'} ({referrals.active} switched on) · {referrals.orders} paid order{referrals.orders === 1 ? '' : 's'} ·{' '}
            {formatPence(referrals.revenuePence)} taken · {formatPence(referrals.discountPence)} off for friends. The shop makes these, one per parent; they’re never listed one by one.
          </p>
        </div>
      ) : null}
    </>
  );
}

async function Commission({ reviewer, month }: { reviewer: AdminReviewer; month: string }) {
  let data: Awaited<ReturnType<typeof commissionOwed>>;
  try {
    data = await commissionOwed(getDb(), reviewer, month);
  } catch (e) {
    console.error('[admin/codes] commission failed', e);
    return <SectionError>The commission didn’t add up this time. Refresh to try again.</SectionError>;
  }
  if (data.partners.length === 0) {
    return <AdminEmpty title={`nobody to pay for ${data.label}`}>No paid orders used a partner code that month.</AdminEmpty>;
  }
  const earning = data.partners.filter((p) => p.commissionPence > 0).length;
  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <AdminStat label={`owed for ${data.label}`} value={formatPence(data.totalPence)} />
        <AdminStat label="partners to pay" value={earning} note={`${data.partners.length} with paid orders`} />
      </div>
      <CommissionPartners partners={data.partners} />
    </>
  );
}
