'use client';

import {
  IconAlertTriangle,
  IconCheck,
  IconCircleCheck,
  IconCoin,
  IconCreditCard,
  IconExternalLink,
  IconFlag,
  IconHeartbeat,
  IconMessage,
  IconPackage,
  IconPhoto,
  IconReceiptRefund,
  IconScale,
  IconTruck,
} from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { markHandledAction } from '@/app/actions/adminOps';
import { toast } from '@/lib/store';
import { Icon, type TablerIconComponent } from '@/ui/primitives/Icon';

/** One "needs you" item as the page hands it over (dates as ISO strings, waited/due already in words). */
export type TodayItem = {
  key: string;
  kind: string;
  title: string;
  detail: string;
  waited: string;
  due: string | null;
  dueSoon: boolean;
  href: string;
  action: string;
  urgent: boolean;
  dismissable: boolean;
};

const ICON: Record<string, TablerIconComponent> = {
  'prodigi-card': IconCreditCard,
  dispute: IconCreditCard,
  report: IconFlag,
  site: IconHeartbeat,
  order: IconPackage,
  'refund-at-prodigi': IconReceiptRefund,
  rights: IconScale,
  review: IconPhoto,
  support: IconMessage,
  prodigi: IconTruck,
  commission: IconCoin,
};

export function TodayList({ items }: { items: TodayItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [gone, setGone] = useState<Set<string>>(new Set());

  const done = async (it: TodayItem) => {
    setBusy(it.key);
    try {
      const r = await markHandledAction(it.key);
      if (r.ok) {
        setGone((g) => new Set(g).add(it.key));
        router.refresh();
      } else toast('that didn’t work — refresh and try again');
    } finally {
      setBusy(null);
    }
  };

  const shown = items.filter((i) => !gone.has(i.key));
  if (shown.length === 0) {
    return (
      <div className="mt-5 rounded-[20px] border-2 border-dashed border-cocoa/25 bg-paper p-8 text-center text-sm text-ink-soft">
        <Icon icon={IconCircleCheck} size={30} className="mx-auto text-green-save" />
        <p className="mt-2 font-display text-xl text-cocoa">all clear</p>
        <p>Nothing needs you right now.</p>
      </div>
    );
  }

  return (
    <ul className="mt-4 space-y-3" aria-label="needs you, most urgent first">
      {shown.map((it) => {
        const external = it.href.startsWith('http');
        const cls = 'inline-flex min-h-11 items-center gap-1.5 rounded-pill border-2 border-cocoa px-4 text-sm font-bold';
        return (
          <li key={it.key} className={`rounded-[20px] border-2 bg-paper p-4 ${it.urgent ? 'border-cta shadow-[0_3px_0_var(--color-cta-deep)]' : 'border-cocoa/15'}`}>
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ${it.urgent ? 'bg-cta text-white' : 'bg-honey-band text-cocoa'}`}>
                <Icon icon={ICON[it.kind] ?? IconAlertTriangle} size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-extrabold leading-snug text-cocoa">{it.title}</p>
                <p className="mt-1 text-sm text-ink-soft">{it.detail}</p>
                <p className="mt-1 text-xs text-ink-faint">
                  {it.urgent ? <b className="text-cinnamon">urgent · </b> : null}waiting {it.waited}
                  {it.due ? <span className={it.dueSoon ? 'font-bold text-cinnamon' : ''}> · due {it.due}</span> : null}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {external ? (
                    <a href={it.href} target="_blank" rel="noopener noreferrer" className={`${cls} bg-honey-band text-cocoa`}>
                      {it.action} <Icon icon={IconExternalLink} size={15} />
                    </a>
                  ) : (
                    <Link href={it.href} className={`${cls} bg-honey-band text-cocoa`}>
                      {it.action}
                    </Link>
                  )}
                  {it.dismissable ? (
                    <button type="button" disabled={busy === it.key} onClick={() => void done(it)} className={`${cls} border-cocoa/25 text-ink-soft hover:border-cocoa disabled:opacity-50`}>
                      <Icon icon={IconCheck} size={15} /> done
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
