import type { Metadata } from 'next';
import Link from 'next/link';
import { IconSearch } from '@tabler/icons-react';
import { getDb } from '@/db/client';
import { listOrders, ORDER_FILTERS, STATUS_WORDS, type OrderFilter } from '@/server/admin/orders';
import { pounds } from '@/server/admin/needs';
import { Icon } from '@/ui/primitives/Icon';
import { AdminEmpty, AdminShell, adminOr404, type AdminReviewer } from '../AdminShell';

export const metadata: Metadata = { title: 'orders · admin', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/** Orders: find one (by number or the customer's email), filter by where it is. No child pictures or names here. */
export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ show?: string; q?: string }> }) {
  const r = await adminOr404();
  const sp = await searchParams;
  const filter = (ORDER_FILTERS.find((f) => f.id === sp.show)?.id ?? (sp.q ? 'all' : 'attention')) as OrderFilter;
  const q = (sp.q ?? '').slice(0, 120);
  return (
    <AdminShell section="orders" title="orders" blurb="Every paid order and where it is. Refunds are made in Stripe; the app sees them come back." reviewer={r}>
      <form role="search" action="/admin/orders" className="mt-5 flex gap-2">
        <label htmlFor="order-q" className="sr-only">
          order number or customer email
        </label>
        <input id="order-q" name="q" defaultValue={q} placeholder="order number or email" className="min-h-11 min-w-0 flex-1 rounded-pill border-2 border-cocoa/25 bg-paper px-4 text-[15px] text-cocoa placeholder:text-ink-faint focus:border-cocoa" />
        <button type="submit" className="inline-flex min-h-11 items-center gap-1.5 rounded-pill border-2 border-cocoa bg-honey-band px-4 text-sm font-bold text-cocoa">
          <Icon icon={IconSearch} size={16} /> find
        </button>
      </form>
      <div className="-mx-4 mt-3 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0" role="group" aria-label="show">
        <div className="flex w-max gap-2">
          {ORDER_FILTERS.map((f) => (
            <Link
              key={f.id}
              href={`/admin/orders?show=${f.id}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
              aria-current={f.id === filter ? 'true' : undefined}
              className={`inline-flex min-h-11 items-center rounded-pill border-2 px-4 text-sm font-bold ${f.id === filter ? 'border-cocoa bg-honey-band text-cocoa' : 'border-cocoa/20 text-ink-soft'}`}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>
      <Orders reviewer={r} filter={filter} q={q} />
    </AdminShell>
  );
}

async function Orders({ reviewer, filter, q }: { reviewer: AdminReviewer; filter: OrderFilter; q: string }) {
  const rows = await listOrders(getDb(), reviewer, { filter, q });
  if (rows.length === 0)
    return <AdminEmpty title={filter === 'attention' && !q ? 'nothing stuck' : 'no orders found'}>{filter === 'attention' && !q ? 'Every paid order is moving the way it should.' : 'Try another filter, or the whole order number.'}</AdminEmpty>;
  return (
    <ul className="mt-4 divide-y-2 divide-cocoa/10 overflow-hidden rounded-[20px] border-2 border-cocoa/15 bg-paper" aria-label="orders">
      {rows.map((o) => (
        <li key={o.ref}>
          <Link href={`/admin/orders/${o.ref}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-honey-band/40">
            <span className="min-w-0">
              <span className="block font-mono text-sm font-bold text-cocoa">
                {o.ref}
                {o.isSample ? <span className="ml-2 rounded-pill border-2 border-cobalt px-2 py-0.5 align-middle font-sans text-[11px] font-bold text-cobalt">sample · at cost</span> : null}
              </span>
              <span className="block text-xs text-ink-soft">
                {(o.paidAt ?? o.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })} · {o.items} item{o.items === 1 ? '' : 's'}
                {o.isGift ? ' · gift' : ''}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-bold text-cocoa">{pounds(o.totalPence)}</span>
              <span className={`block text-xs font-bold ${o.trouble || o.disputed ? 'text-cinnamon' : 'text-ink-soft'}`}>
                {o.disputed ? 'chargeback' : o.trouble ? 'stuck' : STATUS_WORDS[o.status] ?? o.status.toLowerCase()}
                {o.refundedPence > 0 ? ` · ${o.refundedPence >= o.totalPence ? 'refunded' : `${pounds(o.refundedPence)} back`}` : ''}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
