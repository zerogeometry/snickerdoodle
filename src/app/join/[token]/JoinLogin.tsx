'use client';

import { IconMail, IconUsersPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { sendJoinLinkAction } from '@/app/actions/invite';
import { Button } from '@/ui/primitives/Button';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';

/** Identity step: the invitee proves they control the invited email by signing in
 * to it. After the magic link, they return here authenticated and the invite is
 * accepted. Anyone holding a forwarded gift link can open this page, so it only ever
 * gets the MASKED address (gr•••@example.com) and the server sends the link (06-B1).
 * On a phone the button sits in the thumb zone (NN6; 04-B7) — a fixed bar OUTSIDE the
 * animated card (a transform on an ancestor would break position:fixed). */
export function JoinLogin({ maskedEmail, familyName, token, next }: { maskedEmail: string; familyName: string | null; token: string; next?: string | null }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);

  const go = async () => {
    setBusy(true);
    setError(false);
    try {
      const res = await sendJoinLinkAction(token, next ?? null);
      if (res.ok) setSent(true);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const button = (
    <Button size="lg" className="w-full" onClick={go} disabled={busy}>
      <Icon icon={IconMail} size={16} /> {busy ? 'sending…' : 'email me the link'}
    </Button>
  );

  return (
    <div className="flex w-full flex-col items-center">
      <div className="pop-in tape w-full max-w-sm rounded-[22px] border-2 border-cocoa bg-paper p-7 text-center shadow-[0_4px_0_var(--color-cocoa)]">
        <span className="sticker mx-auto flex h-14 w-14 -rotate-6 items-center justify-center rounded-[16px] bg-honey text-cocoa">
          <Icon icon={IconUsersPlus} size={26} />
        </span>
        <CaveatNote className="mt-3 -rotate-2 text-xl">you&apos;re invited</CaveatNote>
        <h1 className="mt-1 font-display text-[28px] leading-tight text-cocoa">{familyName ? `Join ${familyName}` : 'Join the family'}</h1>

        {sent ? (
          <p role="status" className="mt-3 flex items-center justify-center gap-1.5 rounded-[14px] border-2 border-leaf bg-leaf-pale px-3 py-2.5 text-[13px] font-semibold text-green-save">
            <Icon icon={IconMail} size={15} /> Check {maskedEmail} for a link to confirm it&apos;s you.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-ink-soft">
              To keep everyone&apos;s keepsakes safe, confirm it&apos;s you. We&apos;ll send a one-tap link to the address
              this invite was sent to: <b className="break-words text-cocoa">{maskedEmail}</b>.
            </p>
            {/* desktop: in the card; phone: the thumb-zone bar below */}
            <div className="mt-5 hidden md:block">{button}</div>
            {error ? (
              <p role="alert" className="mt-2 text-xs font-semibold text-cinnamon">we couldn’t send a link just now — give it a few minutes and try again.</p>
            ) : null}
            <p className="mt-3 text-[11px] text-ink-soft">Only the person who controls that inbox can join. Not you? Ask the family to send you your own invite.</p>
          </>
        )}
      </div>

      {sent ? null : (
        <>
          <div className="pb-safe kraft fixed inset-x-0 bottom-0 z-40 rounded-t-[22px] border-t-2 border-cocoa/10 px-4 pt-3 shadow-[0_-6px_18px_color-mix(in_srgb,var(--color-cocoa)_12%,transparent)] md:hidden">
            {button}
            <div className="h-2" />
          </div>
          <div className="h-28 md:hidden" aria-hidden />
        </>
      )}
    </div>
  );
}
