import type { Metadata } from 'next';
import Link from 'next/link';
import { IconExternalLink } from '@tabler/icons-react';
import { getDb } from '@/db/client';
import { orderDetail, prodigiOrderUrl, STATUS_WORDS, stripePaymentUrl } from '@/server/admin/orders';
import { pounds } from '@/server/admin/needs';
import { Icon } from '@/ui/primitives/Icon';
import { AdminEmpty, AdminShell, adminOr404, type AdminReviewer } from '../../AdminShell';
import { RetryOrder, RevealContact } from './OrderActions';

export const metadata: Metadata = { title: 'order · admin', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const LINE_WORDS: Record<string, string> = {
  PENDING: 'waiting to be made',
  RENDERING: 'making the print file',
  RENDER_FAILED: 'print file failed',
  READY: 'print file ready',
  SUBMITTED: 'at Prodigi',
  IN_PRODUCTION: 'being made',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  BLOCKED_GATE: 'held by the safety check',
  ERROR: 'something went wrong',
};

/** One order: what was bought, the money, where it is, and the safe things to do. No child pictures or names. */
export default async function OrderPage({ params }: { params: Promise<{ ref: string }> }) {
  const r = await adminOr404();
  const { ref } = await params;
  return (
    <AdminShell section="orders" title={`order ${decodeURIComponent(ref).slice(0, 40)}`} reviewer={r}>
      <Detail reviewer={r} orderRef={decodeURIComponent(ref).slice(0, 40)} />
    </AdminShell>
  );
}

const when = (d: Date | null) => (d ? d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : null);

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-pill border-2 border-cocoa/25 bg-paper px-4 text-sm font-bold text-ink-soft hover:border-cocoa">
      {children} <Icon icon={IconExternalLink} size={15} />
    </a>
  );
}

async function Detail({ reviewer, orderRef }: { reviewer: AdminReviewer; orderRef: string }) {
  const o = await orderDetail(getDb(), reviewer, orderRef);
  if (!o)
    return (
      <AdminEmpty title="no order with that number">
        <Link href="/admin/orders" className="underline underline-offset-2">
          back to orders
        </Link>
      </AdminEmpty>
    );
  const steps: { label: string; at: string | null; done: boolean }[] = [
    { label: 'paid', at: when(o.paidAt), done: !!o.paidAt },
    { label: 'sent to Prodigi', at: o.prodigiOrderId ? when(o.claimedAt) : null, done: !!o.prodigiOrderId },
    { label: 'shipped', at: o.status === 'SHIPPED' ? 'yes' : null, done: o.status === 'SHIPPED' },
  ];
  const fullyRefunded = o.money.refundedPence > 0 && o.money.refundedPence >= o.money.totalPence;
  return (
    <div className="mt-5 space-y-5">
      {o.dispute && !o.dispute.closedAt ? (
        <div role="alert" className="rounded-[18px] border-2 border-cta bg-paper p-4 text-sm text-cocoa">
          <b>Chargeback: {pounds(o.dispute.amountPence)}</b>
          {o.dispute.reason ? ` (${o.dispute.reason.replace(/_/g, ' ')})` : ''}. {o.dispute.dueBy ? `Answer in Stripe by ${new Date(o.dispute.dueBy).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.` : ''}
          <div className="mt-2">
            <Ext href={`https://dashboard.stripe.com/disputes/${o.dispute.id}`}>answer in Stripe</Ext>
          </div>
        </div>
      ) : null}
      {fullyRefunded && o.status === 'FULFILLING' ? (
        <div role="alert" className="rounded-[18px] border-2 border-cta bg-paper p-4 text-sm text-cocoa">
          <b>Refunded, but already at Prodigi.</b> Cancel it in Prodigi if they haven’t made it yet.
        </div>
      ) : null}

      <section aria-label="where it is" className="rounded-[20px] border-2 border-cocoa/15 bg-paper p-4">
        <p className="text-sm text-ink-soft">
          <b className="text-cocoa">{STATUS_WORDS[o.status] ?? o.status.toLowerCase()}</b>
          {o.isSample ? ' · a sample at cost (not a sale)' : ''}
          {o.isGift ? ' · a gift' : ''}
          {o.guest ? ' · guest checkout' : ''}
          {o.shippingMethod ? ` · ${o.shippingMethod.toLowerCase()} delivery` : ''}
        </p>
        <ol className="mt-3 flex flex-wrap gap-2 text-xs">
          {steps.map((s) => (
            <li key={s.label} className={`rounded-pill border-2 px-3 py-1 font-bold ${s.done ? 'border-green-save text-green-save' : 'border-cocoa/15 text-ink-faint'}`}>
              {s.label}
              {s.at && s.at !== 'yes' ? ` · ${s.at}` : ''}
            </li>
          ))}
        </ol>
        {o.tracking?.url || o.tracking?.number ? (
          <p className="mt-3 text-sm text-ink-soft">
            Tracking: {o.tracking.carrier ? `${o.tracking.carrier} ` : ''}
            {o.tracking.url ? (
              <a href={o.tracking.url} target="_blank" rel="noopener noreferrer" className="font-bold text-cocoa underline underline-offset-2">
                {o.tracking.number ?? 'track it'}
              </a>
            ) : (
              <b className="text-cocoa">{o.tracking.number}</b>
            )}
          </p>
        ) : null}
        {o.submitError ? <p className="mt-3 rounded-[12px] bg-paper-2 p-2 text-xs text-cinnamon">Prodigi said: {o.submitError.slice(0, 300)}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {o.canRetry ? <RetryOrder orderRef={o.ref} /> : null}
          {o.stripePaymentIntent ? <Ext href={stripePaymentUrl(o.stripePaymentIntent)}>open in Stripe</Ext> : null}
          {o.prodigiOrderId ? <Ext href={prodigiOrderUrl(o.prodigiOrderId)}>{o.prodigiSplitOrderId ? 'open the main order in Prodigi' : 'open in Prodigi'}</Ext> : null}
          {o.prodigiSplitOrderId ? <Ext href={prodigiOrderUrl(o.prodigiSplitOrderId)}>open the phone case’s order in Prodigi</Ext> : null}
        </div>
        {o.shippingMethod ? <p className="mt-2 text-xs text-ink-soft">Sent by: {o.shippingMethod}</p> : null}
      </section>

      <section aria-label="what was bought" className="rounded-[20px] border-2 border-cocoa/15 bg-paper p-4">
        <h2 className="font-display text-lg text-cocoa">what was bought</h2>
        <ul className="mt-2 space-y-2">
          {o.lines.map((l, i) => (
            <li key={i} className="flex items-start justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="font-bold text-cocoa">
                  {l.qty} × {l.product}
                </span>
                {l.states.length ? <span className="block text-xs text-ink-soft">{[...new Set(l.states)].map((s) => LINE_WORDS[s] ?? s.toLowerCase()).join(', ')}</span> : null}
                {l.problems.map((p, j) => (
                  <span key={j} className="block text-xs text-cinnamon">
                    {p}
                  </span>
                ))}
              </span>
              <span className="shrink-0 font-bold text-cocoa">{pounds(l.linePence)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t-2 border-cocoa/10 pt-3 text-sm">
          <dt className="text-ink-soft">items</dt>
          <dd className="text-right">{pounds(o.money.subtotalPence)}</dd>
          <dt className="text-ink-soft">{o.isSample ? 'card fee' : 'delivery'}</dt>
          <dd className="text-right">{pounds(o.money.deliveryPence)}</dd>
          {o.money.savingsPence ? (
            <>
              <dt className="text-ink-soft">savings</dt>
              <dd className="text-right">−{pounds(o.money.savingsPence)}</dd>
            </>
          ) : null}
          {o.money.promoSavingPence ? (
            <>
              <dt className="text-ink-soft">code {o.code?.code ?? ''}</dt>
              <dd className="text-right">−{pounds(o.money.promoSavingPence)}</dd>
            </>
          ) : null}
          {o.money.creditPence ? (
            <>
              <dt className="text-ink-soft">credit</dt>
              <dd className="text-right">−{pounds(o.money.creditPence)}</dd>
            </>
          ) : null}
          <dt className="font-bold text-cocoa">paid</dt>
          <dd className="text-right font-bold text-cocoa">{pounds(o.money.totalPence)}</dd>
          {o.money.refundedPence ? (
            <>
              <dt className="font-bold text-cinnamon">refunded</dt>
              <dd className="text-right font-bold text-cinnamon">{pounds(o.money.refundedPence)}</dd>
            </>
          ) : null}
        </dl>
        {o.code?.partner ? <p className="mt-2 text-xs text-ink-faint">Code from {o.code.partner}.</p> : null}
      </section>

      <section aria-label="customer" className="rounded-[20px] border-2 border-cocoa/15 bg-paper p-4">
        <h2 className="font-display text-lg text-cocoa">customer</h2>
        <p className="mt-1 text-sm text-ink-soft">Kept hidden until you need it, for a reply or a delivery problem.</p>
        <RevealContact orderRef={o.ref} />
      </section>
    </div>
  );
}
