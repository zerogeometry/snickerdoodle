'use client';

import { IconEye, IconEyeOff, IconShieldCheck, IconShieldLock, IconTrash } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { confirmMfaEnrolment, decideReviewAction, startMfaEnrolment, verifyMfa } from '@/app/actions/admin';
import { toast } from '@/lib/store';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';

/** Two-step login: set up an authenticator app once, then a 6-digit code each session. */
export function MfaGate({ enrolled }: { enrolled: boolean }) {
  const router = useRouter();
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const begin = async () => {
    const r = await startMfaEnrolment();
    if (r.ok) setSetup({ secret: r.secret, uri: r.uri });
    else toast('couldn’t start set-up — refresh and try again');
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const r = enrolled ? await verifyMfa(code) : await confirmMfaEnrolment(code);
      if (r.ok) router.refresh();
      else toast('that code didn’t match — try the newest one');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 max-w-md rounded-[20px] border-2 border-cocoa bg-paper p-5 shadow-[0_3px_0_var(--color-cocoa)]">
      <p className="flex items-center gap-2 font-display text-lg text-cocoa">
        <Icon icon={IconShieldLock} size={20} /> {enrolled ? 'your code, please' : 'set up two-step login'}
      </p>
      {!enrolled && !setup ? (
        <>
          <p className="mt-2 text-sm text-ink-soft">The review queue needs a code from an authenticator app (Google Authenticator, 1Password, Authy…) every session.</p>
          <Button className="mt-4" onClick={() => void begin()}>
            start set-up
          </Button>
        </>
      ) : null}
      {!enrolled && setup ? (
        <div className="mt-3 space-y-2 text-sm text-ink-soft">
          <p>
            In your authenticator app, add an account and type this key (or{' '}
            <a href={setup.uri} className="font-bold text-cinnamon underline">
              open this link
            </a>{' '}
            on the phone with the app):
          </p>
          <p className="select-all break-all rounded-xl border border-line bg-paper-2 px-3 py-2 font-mono text-[15px] tracking-wider text-cocoa">{setup.secret.match(/.{1,4}/g)!.join(' ')}</p>
          <p>Then enter the 6-digit code it shows.</p>
        </div>
      ) : null}
      {enrolled || setup ? (
        <form onSubmit={submit} className="mt-4 flex items-end gap-2">
          <label className="flex-1 text-xs font-extrabold uppercase tracking-wide text-ink-faint">
            6-digit code
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="mt-1 block min-h-12 w-full rounded-[14px] border-2 border-cocoa/25 bg-paper px-3 text-center font-mono text-xl tracking-[0.4em] text-cocoa focus:border-cocoa"
              aria-label="six-digit code from your authenticator app"
            />
          </label>
          <Button type="submit" size="lg" disabled={code.length !== 6 || busy}>
            {busy ? 'checking…' : 'continue'}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

export interface ClientItem {
  kind: 'keepsake' | 'profile';
  id: string;
  labels: string[];
  source: string;
  flaggedAt: string | null;
}

/** The queue: each item hidden until the reviewer chooses to look; clear or remove. */
export function ReviewList({ items }: { items: ClientItem[] }) {
  const router = useRouter();
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<ClientItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const decide = async (item: ClientItem, decision: 'clear' | 'remove') => {
    setBusy(item.id);
    try {
      const r = await decideReviewAction(item.kind, item.id, decision);
      toast(r.ok ? (decision === 'clear' ? 'cleared — it can be printed again' : 'removed for good') : 'that didn’t work — refresh and try again');
      setConfirm(null);
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  if (items.length === 0) {
    return (
      <div className="mt-6 rounded-[20px] border-2 border-dashed border-cocoa/25 bg-paper p-8 text-center text-sm text-ink-soft">
        <Icon icon={IconShieldCheck} size={28} className="mx-auto text-green-save" />
        <p className="mt-2 font-bold text-cocoa">nothing waiting</p>
        <p>Everything the checks held back has been looked at.</p>
      </div>
    );
  }

  return (
    <>
      <ul className="mt-6 space-y-4" aria-label="held back for review">
        {items.map((it) => {
          const open = shown.has(it.id);
          return (
            <li key={it.id} className="rounded-[20px] border-2 border-cocoa/15 bg-paper p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-extrabold text-cocoa">{it.source}</span>
                <span className="text-xs text-ink-faint">{it.flaggedAt ? new Date(it.flaggedAt).toLocaleString('en-GB') : ''}</span>
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                held back for: <b className="text-cocoa">{it.labels.length ? it.labels.join(', ') : 'unspecified'}</b>
              </p>
              <div className="mt-3 flex aspect-[4/3] max-h-80 w-full items-center justify-center overflow-hidden rounded-xl border border-line bg-paper-2">
                {open ? (
                  <img src={`/api/admin/review/${it.kind}/${it.id}`} alt="the flagged picture" className="max-h-full max-w-full object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <p className="px-6 text-center text-xs text-ink-soft">hidden — looking is recorded in the audit log</p>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => setShown((s) => { const n = new Set(s); if (n.has(it.id)) n.delete(it.id); else n.add(it.id); return n; })}>
                  <Icon icon={open ? IconEyeOff : IconEye} size={15} /> {open ? 'hide' : 'look'}
                </Button>
                <Button size="sm" onClick={() => void decide(it, 'clear')} disabled={busy === it.id}>
                  <Icon icon={IconShieldCheck} size={15} /> it’s fine
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirm(it)} disabled={busy === it.id}>
                  <Icon icon={IconTrash} size={15} /> remove
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="remove this for good?" subtitle="it's erased everywhere — this can't be undone">
        <div className="flex flex-col gap-2 pb-2">
          <Button size="lg" className="w-full" onClick={() => confirm && void decide(confirm, 'remove')} disabled={!!busy}>
            yes, remove it
          </Button>
          <Button variant="ghost" size="md" className="w-full" onClick={() => setConfirm(null)}>
            keep it held
          </Button>
        </div>
      </Modal>
    </>
  );
}
