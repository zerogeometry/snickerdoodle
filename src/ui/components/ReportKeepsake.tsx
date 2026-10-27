'use client';

import { IconCircleCheck, IconFlag } from '@tabler/icons-react';
import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { reportKeepsakeAction } from '@/app/actions/report';
import { KEEPSAKE_REPORT_REASONS } from '@/lib/reports';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';

/**
 * "Report this keepsake" — for someone in the family, under a keepsake they can see but didn't share
 * (D8; gap audit, 27 Oct). Sending it holds the keepsake straight away — hidden from the family and
 * never printed — while our team takes a look. Same look as the gift link's report.
 */
export function ReportKeepsake({ assetId }: { assetId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [state, setState] = useState<{ status: 'idle' | 'sending' | 'sent' | 'error'; error?: string }>({ status: 'idle' });
  const noteId = useId();

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return setState({ status: 'error', error: 'pick the reason that fits best' });
    setState({ status: 'sending' });
    const res = await reportKeepsakeAction({ assetId, reason, note });
    if (res.ok) return setState({ status: 'sent' });
    setState({ status: 'error', error: res.reason === 'too-many' ? 'that’s a lot of reports in a row — give it a little while and try again' : 'that didn’t send — please try again in a moment' });
  };

  const close = () => {
    setOpen(false);
    // after a report the keepsake is held — show the home as it now is
    if (state.status === 'sent') router.refresh();
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mt-1 inline-flex min-h-11 items-center gap-1 px-1 text-[12px] font-bold text-ink-soft underline underline-offset-2 hover:text-cinnamon">
        <Icon icon={IconFlag} size={13} /> report
      </button>
      <Modal open={open} onClose={close} title="Report this keepsake" subtitle="Tell us what’s wrong — our team will take a look.">
        {state.status === 'sent' ? (
          <div role="status" className="py-2 text-center">
            <Icon icon={IconCircleCheck} size={28} className="mx-auto text-green-save" />
            <p className="mt-2 font-display text-xl text-cocoa">Thank you for telling us</p>
            <p className="mt-1 text-[15px] text-ink-soft">We’ve put it away while our team looks into it — it won’t be shown or printed meanwhile.</p>
            <Button type="button" size="lg" className="mt-5 w-full" onClick={close}>
              done
            </Button>
          </div>
        ) : (
          <form onSubmit={send} noValidate className="flex flex-col gap-4">
            <fieldset>
              <legend className="text-[13px] font-extrabold uppercase tracking-wide text-ink-soft">What’s wrong?</legend>
              <div className="mt-2 flex flex-col gap-2">
                {KEEPSAKE_REPORT_REASONS.map((r) => (
                  <label key={r.id} className={`press flex min-h-12 cursor-pointer items-center gap-3 rounded-[14px] border-2 px-3 py-2 ${reason === r.id ? 'border-cocoa bg-honey-band' : 'border-cocoa/20 bg-paper hover:border-cocoa/50'}`}>
                    <input type="radio" name="reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} className="h-5 w-5 shrink-0 accent-[var(--color-cta)]" />
                    <span className="text-[15px] font-bold leading-snug text-cocoa">{r.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor={noteId} className="text-[13px] font-extrabold text-cocoa">
                Anything to add? <span className="font-normal text-ink-faint">(optional)</span>
              </label>
              <textarea id={noteId} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-[14px] border-2 border-cocoa/25 bg-paper px-3.5 py-2.5 text-[16px] text-cocoa focus:border-cocoa focus:outline-none" />
            </div>
            <p className="text-[12px] text-ink-faint">Sending this puts the keepsake away straight away — only the parent who shared it can see it while we check.</p>
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
    </>
  );
}
