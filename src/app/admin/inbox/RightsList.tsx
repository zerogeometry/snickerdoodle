'use client';

import { IconEye, IconScale } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { revealRightsAction, setRightsStatusAction } from '@/app/actions/adminOps';
import { toast } from '@/lib/store';
import { Icon } from '@/ui/primitives/Icon';

export type RightsItem = {
  id: string;
  type: string;
  status: string;
  receivedAt: string;
  dueAt: string | null;
  dueSoon: boolean;
  outcome: string | null;
  acknowledged: boolean;
};

const TYPE_WORDS: Record<string, string> = {
  COMPLAINT: 'data-protection complaint',
  ACCESS: 'request for a copy of their data',
  ERASURE: 'request to delete their data',
  RECTIFICATION: 'request to correct their data',
  RESTRICTION: 'request to limit how we use their data',
  OBJECTION: 'objection to how we use their data',
  PORTABILITY: 'request to take their data elsewhere',
};
const STATUS_WORDS: Record<string, string> = { RECEIVED: 'new', CLOCK_PAUSED: 'waiting on them', IN_PROGRESS: 'in progress', COMPLETED: 'done', DECLINED: 'declined' };
const BTN = 'inline-flex min-h-11 items-center gap-1.5 rounded-pill border-2 px-4 text-sm font-bold disabled:opacity-50';
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** Data-protection requests and complaints: legal deadlines, so the due date leads. */
export function RightsList({ items }: { items: RightsItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label="data requests and complaints" className="mt-5">
      <h2 className="font-display text-xl text-cocoa">data requests and complaints</h2>
      <p className="mt-1 text-sm text-ink-soft">The law gives a month to respond (a complaint is acknowledged automatically when it arrives).</p>
      <ul className="mt-3 space-y-3">
        {items.map((it) => (
          <Rights key={it.id} it={it} />
        ))}
      </ul>
    </section>
  );
}

function Rights({ it }: { it: RightsItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [words, setWords] = useState<{ email: string | null; name: string | null; details: string | null } | null>(null);
  const [finishing, setFinishing] = useState<'COMPLETED' | 'DECLINED' | null>(null);
  const [outcome, setOutcome] = useState('');
  const open = it.status !== 'COMPLETED' && it.status !== 'DECLINED';

  const move = async (status: 'IN_PROGRESS' | 'CLOCK_PAUSED' | 'COMPLETED' | 'DECLINED', note: string | null) => {
    setBusy(true);
    try {
      const r = await setRightsStatusAction(it.id, status, note);
      toast(r.ok ? `marked ${STATUS_WORDS[status]}` : 'that didn’t work — refresh and try again');
      setFinishing(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`rounded-[20px] border-2 bg-paper p-4 ${open && it.dueSoon ? 'border-cta' : 'border-cocoa/15'}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-honey-band text-cocoa">
          <Icon icon={IconScale} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-cocoa">A {TYPE_WORDS[it.type] ?? it.type.toLowerCase()}</p>
          <p className="mt-1 text-xs text-ink-soft">
            received {day(it.receivedAt)} · <b>{STATUS_WORDS[it.status] ?? it.status.toLowerCase()}</b>
            {it.dueAt && open ? <span className={it.dueSoon ? 'font-bold text-cinnamon' : ''}> · due {day(it.dueAt)}</span> : null}
            {it.type === 'COMPLAINT' ? (it.acknowledged ? ' · acknowledged' : <span className="font-bold text-cinnamon"> · not acknowledged yet</span>) : null}
          </p>
          {it.outcome ? <p className="mt-2 text-sm text-ink-soft">Outcome: {it.outcome}</p> : null}
          {words ? (
            <div className="mt-2 rounded-[14px] bg-paper-2 p-3 text-sm text-cocoa">
              <p>
                {words.name ? `${words.name} · ` : ''}
                <b>{words.email ?? 'no email'}</b>
              </p>
              {words.details ? <p className="mt-1 whitespace-pre-wrap break-words">{words.details}</p> : null}
              <p className="mt-2 text-xs text-ink-faint">Looking at this is recorded.</p>
            </div>
          ) : null}
          {finishing ? (
            <div className="mt-3">
              <label htmlFor={`outcome-${it.id}`} className="text-sm font-bold text-cocoa">
                {finishing === 'COMPLETED' ? 'what was done' : 'why it was declined'} (kept with the request)
              </label>
              <textarea id={`outcome-${it.id}`} value={outcome} onChange={(e) => setOutcome(e.target.value.slice(0, 1000))} rows={3} className="mt-1 w-full rounded-[14px] border-2 border-cocoa/25 bg-paper p-2 text-sm text-cocoa focus:border-cocoa" />
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" disabled={busy || !outcome.trim()} onClick={() => void move(finishing, outcome)} className={`${BTN} border-cocoa bg-honey-band text-cocoa`}>
                  confirm {finishing === 'COMPLETED' ? 'done' : 'declined'}
                </button>
                <button type="button" onClick={() => setFinishing(null)} className={`${BTN} border-cocoa/25 text-ink-soft`}>
                  cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {!words ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    const r = await revealRightsAction(it.id);
                    if (r.ok) setWords({ email: r.email, name: r.name, details: r.details });
                    else toast('couldn’t load it — refresh and try again');
                  }}
                  className={`${BTN} border-cocoa bg-honey-band text-cocoa`}
                >
                  <Icon icon={IconEye} size={16} /> read it
                </button>
              ) : null}
              {words?.email ? (
                <a href={`mailto:${words.email}?subject=${encodeURIComponent('Your data request')}`} className={`${BTN} border-cocoa/25 text-ink-soft hover:border-cocoa`}>
                  reply
                </a>
              ) : null}
              {open && it.status !== 'IN_PROGRESS' ? (
                <button type="button" disabled={busy} onClick={() => void move('IN_PROGRESS', null)} className={`${BTN} border-cocoa/25 text-ink-soft hover:border-cocoa`}>
                  in progress
                </button>
              ) : null}
              {open && it.status !== 'CLOCK_PAUSED' ? (
                <button type="button" disabled={busy} onClick={() => void move('CLOCK_PAUSED', null)} className={`${BTN} border-cocoa/25 text-ink-soft hover:border-cocoa`}>
                  waiting on them
                </button>
              ) : null}
              {open ? (
                <>
                  <button type="button" disabled={busy} onClick={() => setFinishing('COMPLETED')} className={`${BTN} border-cocoa/25 text-ink-soft hover:border-cocoa`}>
                    done
                  </button>
                  <button type="button" disabled={busy} onClick={() => setFinishing('DECLINED')} className={`${BTN} border-cocoa/25 text-ink-soft hover:border-cocoa`}>
                    decline
                  </button>
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
