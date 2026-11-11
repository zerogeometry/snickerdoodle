import { IconHeartHandshake } from '@tabler/icons-react';
import type { JoinCard } from '@/lib/joinConsent';
import { Button } from '@/ui/primitives/Button';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';

/**
 * The joiner's own "yes" (D27, founder 10 Nov 2026): once they've proved it's them, joining no longer happens
 * silently. One card says what they'll see, who looks after the family's keepsakes and details, and that what they
 * add stays theirs to share — then a single button. "not now" leaves without joining (the link keeps working until
 * it expires). On a phone the button sits in the thumb zone, OUTSIDE the animated card (NN6; a transform on an
 * ancestor would break position:fixed).
 */
export function JoinConsent({ card, version, action, notNowHref }: { card: JoinCard; version: string; action: (formData: FormData) => Promise<void>; notNowHref: string }) {
  const yes = (
    <Button type="submit" size="lg" className="w-full">
      {card.button}
    </Button>
  );
  return (
    <form action={action} className="flex w-full flex-col items-center">
      {/* which words they said yes to (stored on the membership) */}
      <input type="hidden" name="consent" value={version} />
      <div className="pop-in tape w-full max-w-sm rounded-[22px] border-2 border-cocoa bg-paper p-7 text-center shadow-[0_4px_0_var(--color-cocoa)]">
        <span className="sticker mx-auto flex h-14 w-14 -rotate-6 items-center justify-center rounded-[16px] bg-honey text-cocoa">
          <Icon icon={IconHeartHandshake} size={26} />
        </span>
        <CaveatNote className="mt-3 -rotate-2 text-xl">it&apos;s you ✓</CaveatNote>
        <h1 className="mt-1 font-display text-[28px] leading-tight text-cocoa">{card.heading}</h1>
        <p className="mt-2 text-sm text-ink-soft">{card.sees}</p>
        <p className="mt-3 rounded-[14px] border-2 border-dashed border-cocoa/25 bg-paper-2 px-3.5 py-3 text-left text-[13px] leading-snug text-cocoa">
          {card.consent}
        </p>
        <div className="mt-5 hidden md:block">{yes}</div>
        <a href={notNowHref} className="mt-3 inline-flex min-h-11 items-center justify-center px-3 text-sm font-bold text-ink-soft underline underline-offset-2">
          not now
        </a>
      </div>
      <div className="pb-safe kraft fixed inset-x-0 bottom-0 z-40 rounded-t-[22px] border-t-2 border-cocoa/10 px-4 pt-3 shadow-[0_-6px_18px_color-mix(in_srgb,var(--color-cocoa)_12%,transparent)] md:hidden">
        {yes}
        <div className="h-2" />
      </div>
      <div className="h-28 md:hidden" aria-hidden />
    </form>
  );
}
