'use client';

import { IconEye, IconRefresh } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { retryOrderAction, revealContactAction } from '@/app/actions/adminOps';
import { toast } from '@/lib/store';
import { Icon } from '@/ui/primitives/Icon';

const BTN = 'inline-flex min-h-11 items-center gap-1.5 rounded-pill border-2 px-4 text-sm font-bold disabled:opacity-50';

/** "Show customer details": the email and address, fetched only on this tap (and recorded in the audit trail). */
export function RevealContact({ orderRef }: { orderRef: string }) {
  const [busy, setBusy] = useState(false);
  const [contact, setContact] = useState<{ email: string | null; address: string[] } | null>(null);
  if (contact)
    return (
      <div className="mt-2 rounded-[16px] bg-paper-2 p-3 text-sm text-cocoa">
        <p>
          <b>{contact.email ?? 'no email'}</b>
        </p>
        {contact.address.length ? <p className="mt-1 whitespace-pre-line text-ink-soft">{contact.address.join('\n')}</p> : <p className="mt-1 text-ink-soft">no delivery address recorded</p>}
        <p className="mt-2 text-xs text-ink-faint">Looking at these is recorded.</p>
      </div>
    );
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await revealContactAction(orderRef);
          if (r.ok) setContact({ email: r.email, address: r.address });
          else toast('couldn’t load those — refresh and try again');
        } finally {
          setBusy(false);
        }
      }}
      className={`${BTN} mt-2 border-cocoa/25 text-ink-soft hover:border-cocoa`}
    >
      <Icon icon={IconEye} size={16} /> show customer details
    </button>
  );
}

/** "Try again": failed print files are made again and the order goes to Prodigi on the next tick (every 5 minutes). */
export function RetryOrder({ orderRef }: { orderRef: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await retryOrderAction(orderRef);
          toast(r.ok ? 'queued — it tries again within 5 minutes' : 'that didn’t work — refresh and try again');
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className={`${BTN} border-cocoa bg-honey-band text-cocoa`}
    >
      <Icon icon={IconRefresh} size={16} /> try again
    </button>
  );
}
