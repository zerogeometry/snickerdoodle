import type { Metadata } from 'next';
import { IconArrowBackUp } from '@tabler/icons-react';
import { FlowHeader } from '@/ui/components/FlowHeader';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';
import { DRAW_APP_ID } from '@/server/app/wellKnown';

export const metadata: Metadata = { title: 'back to snickerdoodle draw', robots: { index: false, follow: false }, referrer: 'no-referrer' };

/**
 * Where the website hands back to Snickerdoodle Draw on Android (https://snickerdoodle.co.uk/app/callback).
 * Normally the phone opens the app straight away and this page is never seen. If the browser stays
 * here instead (the app link isn't verified yet, or the sign-in link was opened in another browser),
 * one tap on the button takes the code back to the app. The code is single-use and useless without
 * the secret the app kept, so showing it in this address is safe.
 */
export default async function AppCallbackPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const k of ['code', 'state', 'error'] as const) {
    const v = sp[k];
    if (typeof v === 'string' && v.length <= 300) q.set(k, v);
  }
  const qs = q.toString();
  // Android: an intent link opens the app with the same https address (falls back to this page).
  const intent = `intent://snickerdoodle.co.uk/app/callback${qs ? `?${qs}` : ''}#Intent;scheme=https;package=${DRAW_APP_ID};end`;
  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <FlowHeader />
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-12">
        <section className="pop-in tape w-full max-w-sm rounded-[22px] border-2 border-cocoa bg-paper p-7 text-center shadow-[0_4px_0_var(--color-cocoa)]">
          <CaveatNote className="-rotate-2 text-xl">all done here</CaveatNote>
          <h1 className="mt-1 font-display text-[26px] leading-tight text-cocoa">back to snickerdoodle draw</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">tap below to finish linking in the app. if nothing happens, open snickerdoodle draw yourself and tap link again.</p>
          <a href={intent} className="press mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-cta px-8 py-3.5 text-base font-extrabold text-cta-text shadow-[0_4px_0_var(--color-cta-deep)]">
            <Icon icon={IconArrowBackUp} size={18} /> open snickerdoodle draw
          </a>
        </section>
      </main>
    </div>
  );
}
