'use client';

import { IconShieldCheck } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';

/** Mirrors REPORT_REASONS in src/server/reports.ts (the server re-validates). */
const REASONS = [
  { key: 'worrying', title: 'something worrying', desc: 'not ok for a children’s keepsake' },
  { key: 'someone-elses', title: 'it’s someone else’s picture', desc: 'or a character or logo that isn’t theirs' },
  { key: 'not-for-me', title: 'i shouldn’t be seeing this', desc: 'it reached the wrong person' },
  { key: 'other', title: 'something else', desc: 'it just doesn’t look right' },
] as const;
type Reason = (typeof REASONS)[number]['key'];

/**
 * One-tap report (D8). Pick a reason, send — the keepsake is paused (no printing, no gift link)
 * while a person checks it. No free text on purpose: nothing extra to store or screen.
 */
export function ReportKeepsakeModal({
  open,
  image,
  onClose,
  onSend,
}: {
  open: boolean;
  image?: string | null;
  onClose: () => void;
  /** Resolves true when the report went through. */
  onSend: (reason: Reason) => Promise<boolean>;
}) {
  const [reason, setReason] = useState<Reason | null>(null);
  const [state, setState] = useState<'choose' | 'sending' | 'sent' | 'failed'>('choose');

  useEffect(() => {
    if (open) {
      setReason(null);
      setState('choose');
    }
  }, [open]);

  const send = async () => {
    if (!reason) return;
    setState('sending');
    setState((await onSend(reason)) ? 'sent' : 'failed');
  };

  const thumb = image ? <img src={image} alt="" className="h-[46px] w-[46px] rounded-lg border border-line object-cover" /> : undefined;

  if (state === 'sent') {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="thank you for telling us"
        headerLeading={thumb}
        footer={
          <Button size="lg" className="w-full" onClick={onClose}>
            done
          </Button>
        }
      >
        <p className="text-[13px] leading-relaxed text-ink-soft">
          we&apos;ve paused it — it can&apos;t be printed or shared while a person on our team takes a look. if it needs to
          go, it&apos;s removed for good.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="report this keepsake"
      subtitle="we’ll pause it while we take a look"
      headerLeading={thumb}
      footer={
        <Button size="lg" className="w-full" disabled={!reason || state === 'sending'} onClick={send}>
          {state === 'sending' ? 'sending…' : 'send report'}
        </Button>
      }
    >
      <fieldset>
        <legend className="mb-2.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">What’s wrong?</legend>
        <div role="radiogroup" aria-label="what’s wrong?" className="space-y-2.5">
          {REASONS.map((r) => {
            const on = reason === r.key;
            return (
              <button
                key={r.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setReason(r.key)}
                className={cn('flex min-h-11 w-full items-center gap-3 rounded-xl border-[1.5px] p-3 text-left', on ? 'border-cinnamon bg-paper-2' : 'border-line')}
              >
                <span className={cn('flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2', on ? 'border-cinnamon' : 'border-line')}>
                  {on ? <span className="h-2.5 w-2.5 rounded-full bg-cinnamon" /> : null}
                </span>
                <span className="flex-1">
                  <span className="block text-[13px] font-bold text-cocoa">{r.title}</span>
                  <span className="block text-[11px] text-ink-faint">{r.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>
      {state === 'failed' ? (
        <p role="alert" className="mt-3 text-[12px] font-bold text-cinnamon">
          that didn&apos;t send — please try again in a moment.
        </p>
      ) : null}
      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-faint">
        <Icon icon={IconShieldCheck} size={14} className="mt-0.5 shrink-0 text-green-save" />
        <span>reports are private — the family isn&apos;t told who sent one.</span>
      </p>
    </Modal>
  );
}
