'use client';

import { IconCheck, IconCopy, IconGift, IconShare } from '@tabler/icons-react';
import { useState } from 'react';
import { Icon } from '@/ui/primitives/Icon';
import { gbp, toast } from '@/lib/store';

/** "Give £5, get £5" — the parent's own code, one tap to share, plus their credit. */
export function ReferralCard({ code, creditPence }: { code: string; creditPence: number }) {
  const [copied, setCopied] = useState(false);
  const message = `Turn your little one's drawings into keepsakes on snickerdoodle — use my code ${code} for £5 off your first order (over £30) ✦`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast('code copied');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast('press and hold to copy');
    }
  };
  const share = async () => {
    if (navigator.share) await navigator.share({ text: message }).catch(() => {});
    else void copy();
  };
  return (
    <section className="pop-in tape mt-4 rounded-2xl border-2 border-cocoa bg-honey-band p-4" style={{ ['--tape' as string]: 'rgb(143 181 214 / .85)' }}>
      <p className="flex items-center gap-2 font-display text-lg text-cocoa">
        <Icon icon={IconGift} size={18} className="text-cinnamon" /> give £5, get £5
      </p>
      <p className="mt-1 text-[13px] leading-snug text-ink-soft">
        Share your code: a friend gets £5 off their first order (over £30), and you get £5 to spend once they&apos;ve paid.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <span className="sticker flex min-h-11 flex-1 items-center justify-center rounded-xl bg-paper px-3 font-display text-lg tracking-wide text-cocoa">
          {code}
        </span>
        <button type="button" onClick={copy} aria-label="copy your code" className="press flex h-11 w-11 items-center justify-center rounded-xl border-2 border-cocoa bg-paper text-cocoa">
          <Icon icon={copied ? IconCheck : IconCopy} size={18} />
        </button>
        <button type="button" onClick={share} aria-label="share your code" className="press flex h-11 w-11 items-center justify-center rounded-xl bg-cta text-cta-text shadow-[0_3px_0_var(--color-cta-deep)]">
          <Icon icon={IconShare} size={18} />
        </button>
      </div>
      <p className="mt-3 text-[13px] text-cocoa">
        your credit: <b>{gbp(creditPence)}</b>
        {creditPence > 0 ? <span className="text-ink-soft"> — it comes off your next order automatically</span> : null}
      </p>
    </section>
  );
}
