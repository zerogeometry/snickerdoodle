'use client';

import { IconMail, IconUsersPlus } from '@tabler/icons-react';
import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';

/** Identity step: the invitee proves they control the invited email by signing in
 * to it. After the magic link, they return here authenticated and the invite is
 * accepted. */
export function JoinLogin({ email, familyName, token, next }: { email: string; familyName: string | null; token: string; next?: string | null }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const go = async () => {
    setBusy(true);
    try {
      await signIn('email', { email, redirect: false, callbackUrl: `/join/${token}${next ? `?next=${encodeURIComponent(next)}` : ''}` });
      setSent(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pop-in tape w-full max-w-sm rounded-[22px] border-2 border-cocoa bg-paper p-7 text-center shadow-[0_4px_0_var(--color-cocoa)]">
      <span className="sticker mx-auto flex h-14 w-14 -rotate-6 items-center justify-center rounded-[16px] bg-honey text-cocoa">
        <Icon icon={IconUsersPlus} size={26} />
      </span>
      <CaveatNote className="mt-3 -rotate-2 text-xl">you&apos;re invited</CaveatNote>
      <h1 className="mt-1 font-display text-[28px] leading-tight text-cocoa">{familyName ? `Join ${familyName}` : 'Join the family'}</h1>

      {sent ? (
        <p role="status" className="mt-3 flex items-center justify-center gap-1.5 rounded-[14px] border-2 border-leaf bg-leaf-pale px-3 py-2.5 text-[13px] font-semibold text-green-save">
          <Icon icon={IconMail} size={15} /> Check {email} for a link to confirm it&apos;s you.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-ink-soft">
            To keep everyone&apos;s keepsakes safe, confirm it&apos;s you. We&apos;ll send a one-tap link to{' '}
            <b className="text-cocoa">{email}</b>.
          </p>
          <Button size="lg" className="mt-5 w-full" onClick={go} disabled={busy}>
            <Icon icon={IconMail} size={16} /> {busy ? 'sending…' : `email ${email}`}
          </Button>
          <p className="mt-3 text-[11px] text-ink-soft">Only the person who controls that inbox can join.</p>
        </>
      )}
    </div>
  );
}
