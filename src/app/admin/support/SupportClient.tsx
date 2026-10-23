'use client';

import { IconInbox, IconMail } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { setSupportStatusAction } from '@/app/actions/admin';
import { toast } from '@/lib/store';
import { Icon } from '@/ui/primitives/Icon';

type Item = {
  id: string;
  ref: string;
  topic: string;
  email: string;
  name: string | null;
  orderRef: string | null;
  message: string;
  status: 'OPEN' | 'ANSWERED' | 'CLOSED';
  signedIn: boolean;
  receivedAt: string;
  emailed: boolean;
};

const NEXT: Record<Item['status'], { to: Item['status']; label: string }[]> = {
  OPEN: [
    { to: 'ANSWERED', label: 'mark answered' },
    { to: 'CLOSED', label: 'close' },
  ],
  ANSWERED: [
    { to: 'CLOSED', label: 'close' },
    { to: 'OPEN', label: 'reopen' },
  ],
  CLOSED: [{ to: 'OPEN', label: 'reopen' }],
};

export function SupportList({ items }: { items: Item[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const move = async (it: Item, to: Item['status']) => {
    setBusy(it.id);
    try {
      const r = await setSupportStatusAction(it.id, to);
      toast(r.ok ? `${it.ref} → ${to.toLowerCase()}` : 'that didn’t work — refresh and try again');
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  if (items.length === 0) {
    return (
      <div className="mt-6 rounded-[20px] border-2 border-dashed border-cocoa/25 bg-paper p-8 text-center text-sm text-ink-soft">
        <Icon icon={IconInbox} size={28} className="mx-auto text-green-save" />
        <p className="mt-2 font-bold text-cocoa">inbox zero</p>
        <p>Nothing waiting for a reply.</p>
      </div>
    );
  }

  return (
    <ul className="mt-5 space-y-4" aria-label="help messages">
      {items.map((it) => (
        <li key={it.id} className="rounded-[20px] border-2 border-cocoa/15 bg-paper p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-extrabold text-cocoa">
              {it.ref} · {it.topic}
            </span>
            <span className="text-xs text-ink-faint">{new Date(it.receivedAt).toLocaleString('en-GB')}</span>
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            {it.name ? `${it.name} · ` : ''}
            <b className="text-cocoa">{it.email}</b> · {it.signedIn ? 'signed in' : 'not signed in'}
            {it.orderRef ? (
              <>
                {' '}
                · order <b className="font-mono text-cocoa">{it.orderRef}</b>
              </>
            ) : null}
            {' '}· <span className="font-bold">{it.status.toLowerCase()}</span>
            {!it.emailed ? <span className="text-cinnamon"> · email to the inbox didn’t send</span> : null}
          </p>
          <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-cocoa">{it.message}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={`mailto:${it.email}?subject=${encodeURIComponent(`Re: your message (ref ${it.ref})`)}`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-pill border-2 border-cocoa bg-honey-band px-4 text-sm font-bold text-cocoa"
            >
              <Icon icon={IconMail} size={16} /> reply
            </a>
            {NEXT[it.status].map((n) => (
              <button key={n.to} type="button" disabled={busy === it.id} onClick={() => move(it, n.to)} className="inline-flex min-h-11 items-center rounded-pill border-2 border-cocoa/25 px-4 text-sm font-bold text-ink-soft hover:border-cocoa disabled:opacity-50">
                {n.label}
              </button>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
