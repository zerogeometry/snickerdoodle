'use client';

import { IconCircleCheck, IconMailHeart } from '@tabler/icons-react';
import { useState, useTransition } from 'react';
import { confirmWaitlistAction } from '@/app/actions/waitlist';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { TrustLine } from '@/ui/primitives/TrustLine';

type State = 'ask' | 'done' | 'expired' | 'invalid' | 'error';

export function ConfirmWaitlist({ token }: { token: string }) {
  const [state, setState] = useState<State>(token ? 'ask' : 'invalid');
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      const res = await confirmWaitlistAction(token);
      setState(res.ok ? 'done' : res.reason);
    });

  const card = 'tape pop-in rounded-[22px] border-2 border-cocoa bg-paper p-6 shadow-[0_4px_0_var(--color-cocoa)] md:p-8';

  if (state === 'done') {
    return (
      <div role="status" className={card}>
        <div className="flex items-center gap-2.5">
          <Icon icon={IconCircleCheck} size={28} className="text-green-save" />
          <h1 className="font-display text-3xl text-cocoa">you&apos;re in — welcome!</h1>
        </div>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          You&apos;ll hear about new things first. We&apos;ll only be in touch when there&apos;s something worth sharing —
          a couple of emails a month, at most. Every one has a one-tap unsubscribe at the bottom.
        </p>
        <div className="mt-6">
          <Button href="/start-creating" size="lg" className="w-full sm:w-auto">
            start creating
          </Button>
        </div>
      </div>
    );
  }

  if (state === 'expired' || state === 'invalid' || state === 'error') {
    return (
      <div role="alert" className={card}>
        <h1 className="font-display text-3xl text-cocoa">
          {state === 'error' ? 'that didn’t go through' : 'this link has had its day'}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          {state === 'error'
            ? 'Something went wrong on our side — please tap the link in your email again in a moment.'
            : 'Confirmation links only last a week (and each new sign-up sends a fresh one). Pop your email in again on the home page and we’ll send a new one.'}
        </p>
        <div className="mt-6">
          <Button href="/#hear-first" variant="secondary" size="lg" className="w-full sm:w-auto">
            back to the home page
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={card}>
      <span className="sticker inline-flex -rotate-3 items-center gap-1.5 rounded-full bg-honey px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-wide text-cocoa">
        <Icon icon={IconMailHeart} size={16} />
        snickerdoodle news
      </span>
      <h1 className="mt-5 font-display text-3xl leading-tight text-cocoa md:text-4xl">one tap and you&apos;re in</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
        Tap below to say yes to snickerdoodle news by email — new keepsakes first, and the odd peek behind the scenes. A
        couple of emails a month, at most.
      </p>
      <div className="mt-6 flex flex-col gap-3">
        <Button type="button" size="lg" className="w-full sm:w-auto sm:self-start" onClick={confirm} disabled={pending}>
          {pending ? 'saving…' : 'yes, count me in'}
        </Button>
        <TrustLine>just your email — unsubscribe in one tap, any time</TrustLine>
      </div>
    </div>
  );
}
