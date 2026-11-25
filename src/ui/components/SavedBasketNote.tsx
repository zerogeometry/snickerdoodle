'use client';

import { IconCircleCheck } from '@tabler/icons-react';
import Link from 'next/link';
import { useState } from 'react';
import { setBasketRemindersAction } from '@/app/actions/basket';
import { toast } from '@/lib/store';
import { Icon } from '../primitives/Icon';
import { useBasketAccount } from './BasketSync';

/**
 * Under "Your basket", signed in: it's saved on your account, and the one reminder email — said here, where
 * the basket is, with its own "no thanks" (founder, 25 Nov 2026; the soft opt-in tells them at the point of
 * sale and offers the opt-out there). Nothing for a guest: nothing of theirs is stored.
 */
export function SavedBasketNote() {
  const { status, remindersOff, setRemindersOff } = useBasketAccount();
  const [busy, setBusy] = useState(false);
  if (status !== 'signed-in') return null;
  const flip = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await setBasketRemindersAction(remindersOff);
      if (r.ok) {
        setRemindersOff(!remindersOff);
        toast(remindersOff ? 'we’ll send a reminder if you leave it ✦' : 'no reminder emails — got it');
      } else toast('that didn’t work — try again');
    } finally {
      setBusy(false);
    }
  };
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[13px] leading-snug text-ink-faint">
      <Icon icon={IconCircleCheck} size={14} className="text-green-save" />
      <span>saved to your account{remindersOff ? ' · no reminder emails' : ' · if you leave it for a day, we’ll send one friendly reminder'}</span>
      <button type="button" onClick={() => void flip()} disabled={busy} className="inline-flex min-h-11 items-center font-bold text-cinnamon underline underline-offset-2">
        {remindersOff ? 'remind me after all' : 'no reminders, thanks'}
      </button>
    </p>
  );
}

/** The empty basket: still looking for a saved one, or (signed out) where to find one. */
export function SavedBasketEmptyHint() {
  const status = useBasketAccount((s) => s.status);
  if (status === 'loading') return <p className="mt-3 text-sm text-ink-faint" role="status">checking for a saved basket…</p>;
  if (status !== 'guest') return null;
  return (
    <p className="mt-3 text-sm text-ink-soft">
      left something in your basket before?{' '}
      <Link href="/login?next=%2Fcheckout" className="inline-flex min-h-11 items-center font-bold text-cinnamon underline underline-offset-2">
        log in to see it
      </Link>
    </p>
  );
}
