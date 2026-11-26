import { IconChevronDown, IconGift, IconHelpCircle, IconMapPin, IconTruck } from '@tabler/icons-react';
import Link from 'next/link';
import type { ReceiptLine } from '@/lib/order-lines';
import type { Parcel } from '@/lib/tracking';
import { formatPence } from '@/pricing';
import type { OrderSummary } from '@/server/orders';
import { Icon } from '../primitives/Icon';
import { OrderLineThumb } from './OrderLineThumb';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'awaiting payment',
  PAID: 'being made',
  FULFILLING: 'being made',
  SHIPPED: 'on its way',
  CANCELLED: 'cancelled',
};

const placedOn = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });

/** "doodle mug · 11oz, blue" → name + what sets it apart, as the basket shows them. */
const nameAndSub = (label: string) => {
  const at = label.indexOf(' · ');
  return at < 0 ? { name: label, sub: null } : { name: label.slice(0, at), sub: label.slice(at + 3) };
};

/** "× 2", or for a card pack "2 packs". */
const qtyText = (l: ReceiptLine) => (l.packSize ? (l.qty > 1 ? `${l.qty} packs` : null) : l.qty > 1 ? `× ${l.qty}` : null);

/** Where the parcel(s) are: every parcel's tracking as it leaves its print lab — a big order can come in several. */
function TrackingNote({ status, parcels }: { status: string; parcels: Parcel[] }) {
  const tracked = parcels.filter((p) => p.url || p.number);
  const list = tracked.length ? (
    <ul className="space-y-0.5">
      {tracked.map((p, i) => (
        <li key={p.number ?? p.url ?? i}>
          {p.url ? (
            <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 font-bold text-cinnamon underline underline-offset-2">
              <Icon icon={IconTruck} size={16} /> track {tracked.length > 1 ? `parcel ${i + 1}` : 'your parcel'}
              {p.carrier ? ` with ${p.carrier}` : ''}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            <p className="py-2">
              {tracked.length > 1 ? `Parcel ${i + 1} tracking number` : 'Tracking number'}
              {p.carrier ? ` (${p.carrier})` : ''}: <span className="font-bold text-cocoa">{p.number}</span>
            </p>
          )}
        </li>
      ))}
    </ul>
  ) : null;
  const untracked = parcels.length - tracked.length;
  if (status === 'SHIPPED') {
    if (!list) return <p className="py-2">Sent by standard post, so there&apos;s no tracking. It should be with you very soon.</p>;
    return (
      <>
        {parcels.length > 1 ? <p className="pt-1">Coming in {parcels.length} parcels, as each part is made in its own workshop, so they may not arrive on the same day.</p> : null}
        {list}
        {untracked > 0 ? <p className="pb-1">{untracked === 1 ? 'One parcel goes' : `${untracked} parcels go`} by standard post, with no tracking.</p> : null}
      </>
    );
  }
  if (status === 'PAID' || status === 'FULFILLING') {
    if (!list) return <p className="py-2">Being made with care. Tracking appears here as soon as it&apos;s sent.</p>;
    return (
      <>
        <p className="pt-1">Some of it is already on its way. The rest is still being made, and its tracking appears here when it&apos;s sent.</p>
        {list}
      </>
    );
  }
  if (status === 'PENDING') return <p className="py-2">Waiting for the payment to go through.</p>;
  return null;
}

const helpTopic = (status: string) => (status === 'SHIPPED' ? 'order-problem' : status === 'PENDING' || status === 'CANCELLED' ? 'order-where' : 'order-change');

/**
 * One order on /orders (founder, 26 Nov 2026): a tile of its own — at a glance its number, date, status, a strip of
 * its pictures and its total — that opens (a native <details>, so it works without script and by keyboard) to its
 * lines laid out like the basket, who it's going to and where (it may be a gift), and its tracking.
 */
export function OrderTile({ order: o, index, open }: { order: OrderSummary; index: number; open: boolean }) {
  const count = o.items.reduce((n, l) => n + l.qty, 0);
  const strip = o.items.slice(0, 4);
  const more = o.items.length - strip.length;
  return (
    <details open={open} className="group pop-in overflow-hidden rounded-[18px] border-2 border-cocoa bg-paper shadow-[0_3px_0_var(--color-cocoa)]" style={{ ['--i' as string]: Math.min(index + 1, 8) }}>
      <summary className="cursor-pointer list-none marker:hidden [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-cocoa/10 bg-honey-band px-4 py-2.5">
          <span className="text-[13px] font-extrabold text-cocoa">
            Order {o.ref} <span className="font-semibold text-ink-soft">· {placedOn(o.createdAtISO)}</span>
          </span>
          <span className="sticker flex -rotate-2 items-center gap-1.5 rounded-pill bg-leaf-pale px-2.5 py-0.5 text-[11px] font-extrabold text-cocoa">
            <Icon icon={IconTruck} size={13} /> {STATUS_LABEL[o.status] ?? o.status.toLowerCase()}
          </span>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {strip.map((l, i) => (
              <div key={i} className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-oat">
                <OrderLineThumb line={l} cardPreviewVariantId={o.cardPreviewVariantId} px={48} />
              </div>
            ))}
            {more > 0 ? <span className="shrink-0 pl-1 text-[12px] font-bold text-ink-soft">+{more}</span> : null}
          </div>
          <div className="shrink-0 text-right">
            <div className="font-display text-lg leading-tight text-cocoa">{formatPence(o.totalPence)}</div>
            <div className="text-[11px] text-ink-faint">
              {count} {count === 1 ? 'item' : 'items'}
            </div>
          </div>
          <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-cocoa/20 bg-paper-2 text-cocoa transition-transform group-open:rotate-180">
            <Icon icon={IconChevronDown} size={16} />
          </span>
          <span className="sr-only">show what&apos;s in order {o.ref}</span>
        </div>
      </summary>

      <div className="border-t-2 border-cocoa/10">
        <ul className="space-y-2 p-3">
          {o.items.map((l, i) => {
            const { name, sub } = nameAndSub(l.label);
            const qty = qtyText(l);
            return (
              <li key={i} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-line bg-paper p-2.5">
                <div className="h-14 w-14 overflow-hidden rounded-xl bg-oat">
                  <OrderLineThumb line={l} cardPreviewVariantId={o.cardPreviewVariantId} px={56} />
                </div>
                <div className="min-w-0">
                  <div className="break-words text-sm font-bold text-cocoa">{name}</div>
                  {sub ? <div className="break-words text-[11px] text-ink-faint">{sub}</div> : null}
                  {qty ? <div className="text-[11px] font-bold text-ink-soft">{qty}</div> : null}
                </div>
                <div className="text-right text-sm font-bold text-cocoa">{formatPence(l.linePence)}</div>
              </li>
            );
          })}
        </ul>

        <dl className="space-y-1 border-t-2 border-cocoa/10 px-4 py-2.5 text-[13px]">
          {o.savings.map((sv) => (
            <div key={sv.label} className="flex justify-between text-green-save">
              <dt>{sv.label}</dt>
              <dd>−{formatPence(sv.pence)}</dd>
            </div>
          ))}
          <div className="flex justify-between text-ink-soft">
            <dt>Delivery</dt>
            <dd>{o.deliveryPence > 0 ? formatPence(o.deliveryPence) : 'free'}</dd>
          </div>
          <div className="flex items-center justify-between pt-1">
            <dt className="text-ink-soft">Total</dt>
            <dd className="font-display text-lg text-cocoa">{formatPence(o.totalPence)}</dd>
          </div>
        </dl>

        {o.shipTo ? (
          <div className="flex gap-2.5 border-t-2 border-cocoa/10 px-4 py-3 text-[13px] leading-snug text-ink-soft">
            <Icon icon={o.gift ? IconGift : IconMapPin} size={16} className="mt-0.5 shrink-0 text-cinnamon" />
            <div className="min-w-0">
              <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">{o.gift ? 'a gift for' : 'going to'}</div>
              <address className="not-italic">
                <span className="font-bold text-cocoa">{o.shipTo.name}</span>
                <br />
                {o.shipTo.line1}
                {o.shipTo.line2 ? (
                  <>
                    <br />
                    {o.shipTo.line2}
                  </>
                ) : null}
                <br />
                {o.shipTo.townOrCity}, {o.shipTo.postcode}
                {o.shipTo.countryCode && o.shipTo.countryCode !== 'GB' ? ` · ${o.shipTo.countryCode}` : ''}
              </address>
              {o.gift ? <p className="mt-1 text-[12px] text-ink-faint">sent as a gift, so there are no prices in the parcel</p> : null}
            </div>
          </div>
        ) : null}

        <div className="border-t-2 border-cocoa/10 px-4 py-2.5 text-[13px] text-ink-soft">
          <TrackingNote status={o.status} parcels={o.parcels} />
        </div>

        <div className="border-t-2 border-cocoa/10 px-4 py-1">
          <Link href={`/help?topic=${helpTopic(o.status)}&order=${encodeURIComponent(o.ref)}#contact`} className="inline-flex min-h-11 items-center gap-1.5 text-[14px] font-bold text-cinnamon">
            <Icon icon={IconHelpCircle} size={16} /> need help with this order?
          </Link>
        </div>
      </div>
    </details>
  );
}
