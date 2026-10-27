'use client';

import { IconCircleCheck } from '@tabler/icons-react';
import { useId, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';

export interface ReportFields {
  reason: string;
  note: string;
  email: string;
  /** honeypot — always empty for a person */
  website: string;
}
export type ReportSendResult = { ok: boolean; reason?: 'invalid' | 'too-many' };

/**
 * The one "something's wrong" sheet (D8) — used on a gift link and in the Keepsake Home. Pick a
 * reason, optionally add a note and an email for a reply. What sending does (and says) is the
 * caller's: `footnote` before, `sentBody` after.
 */
export function ReportModal({
  open,
  onClose,
  title,
  subtitle,
  reasons,
  footnote,
  sentBody,
  send,
}: {
  open: boolean;
  /** `sent` — whether a report went through, so the caller can show the page as it now is */
  onClose: (sent: boolean) => void;
  title: string;
  subtitle: string;
  reasons: readonly { id: string; label: string }[];
  footnote: string;
  sentBody: (leftEmail: boolean) => string;
  send: (fields: ReportFields) => Promise<ReportSendResult>;
}) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [state, setState] = useState<{ status: 'idle' | 'sending' | 'sent' | 'error'; error?: string }>({ status: 'idle' });
  const ids = { note: useId(), email: useId() };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return setState({ status: 'error', error: 'pick the reason that fits best' });
    setState({ status: 'sending' });
    const res = await send({ reason, note, email, website });
    if (res.ok) return setState({ status: 'sent' });
    setState({
      status: 'error',
      error: res.reason === 'too-many' ? 'that’s a lot of reports in a row — give it a little while and try again' : res.reason === 'invalid' ? 'please check the email address' : 'that didn’t send — please try again in a moment',
    });
  };

  const close = () => onClose(state.status === 'sent');

  return (
    <Modal open={open} onClose={close} title={title} subtitle={subtitle}>
      {state.status === 'sent' ? (
        <div role="status" className="py-2 text-center">
          <Icon icon={IconCircleCheck} size={28} className="mx-auto text-green-save" />
          <p className="mt-2 font-display text-xl text-cocoa">Thank you for telling us</p>
          <p className="mt-1 text-[15px] text-ink-soft">{sentBody(!!email.trim())}</p>
          <Button type="button" size="lg" className="mt-5 w-full" onClick={close}>
            done
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <fieldset>
            <legend className="text-[13px] font-extrabold uppercase tracking-wide text-ink-soft">What’s wrong?</legend>
            <div className="mt-2 flex flex-col gap-2">
              {reasons.map((r) => (
                <label key={r.id} className={`press flex min-h-12 cursor-pointer items-center gap-3 rounded-[14px] border-2 px-3 py-2 ${reason === r.id ? 'border-cocoa bg-honey-band' : 'border-cocoa/20 bg-paper hover:border-cocoa/50'}`}>
                  <input type="radio" name="reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} className="h-5 w-5 shrink-0 accent-[var(--color-cta)]" />
                  <span className="text-[15px] font-bold leading-snug text-cocoa">{r.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor={ids.note} className="text-[13px] font-extrabold text-cocoa">
              Anything to add? <span className="font-normal text-ink-faint">(optional)</span>
            </label>
            <textarea id={ids.note} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-[14px] border-2 border-cocoa/25 bg-paper px-3.5 py-2.5 text-[16px] text-cocoa focus:border-cocoa focus:outline-none" />
          </div>
          <div>
            <label htmlFor={ids.email} className="text-[13px] font-extrabold text-cocoa">
              Your email <span className="font-normal text-ink-faint">(optional — if you’d like a reply)</span>
            </label>
            <input id={ids.email} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-12 w-full rounded-[14px] border-2 border-cocoa/25 bg-paper px-3.5 text-[16px] text-cocoa focus:border-cocoa focus:outline-none" />
          </div>
          <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label>
              website
              <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </label>
          </div>
          <p className="text-[12px] text-ink-faint">{footnote}</p>
          {state.status === 'error' ? (
            <p role="alert" className="text-[14px] font-semibold text-cinnamon">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" size="lg" className="w-full" disabled={state.status === 'sending'}>
            {state.status === 'sending' ? 'sending…' : 'send report'}
          </Button>
        </form>
      )}
    </Modal>
  );
}
