import type { Metadata } from 'next';
import { IconBrandAndroid, IconBrandApple, IconPencil } from '@tabler/icons-react';
import { FlowHeader } from '@/ui/components/FlowHeader';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';

export const metadata: Metadata = { title: 'link snickerdoodle draw', robots: { index: false, follow: false } };

const STEPS = ['open snickerdoodle draw on your child’s phone or tablet', 'go into the grown-ups’ corner (it asks for your phone’s unlock)', 'tap “link to snickerdoodle” and sign in with this email'];

/**
 * "link it" from the website (the account page). On a phone with Snickerdoodle Draw installed, the
 * phone opens the app's link screen instead of this page (Universal Link / App Link). Anyone who
 * lands here (on a computer, or before installing) gets the three steps. Linking always STARTS in
 * the app, so the secret it needs never leaves the phone.
 */
export default function AppLinkPage() {
  const apple = process.env.DRAW_APP_STORE_URL;
  const google = process.env.DRAW_PLAY_STORE_URL;
  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <FlowHeader back={{ href: '/account', label: 'Back to your account' }} />
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-10">
        <section aria-labelledby="link-title" className="pop-in tape w-full max-w-md rounded-[22px] border-2 border-cocoa bg-paper p-7 shadow-[0_4px_0_var(--color-cocoa)]">
          <CaveatNote className="-rotate-2 text-xl">doodles, kept</CaveatNote>
          <h1 id="link-title" className="mt-1 flex items-center gap-2 font-display text-[28px] leading-tight text-cocoa">
            <Icon icon={IconPencil} size={24} className="text-cinnamon" /> link snickerdoodle draw
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            our little drawing app for 3–12s. it works on its own, no account needed. link it and the drawings you pick land straight in your keepsake box.
          </p>
          <ol className="mt-5 flex flex-col gap-3">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-start gap-3 text-sm text-cocoa">
                <span className="sticker flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-honey-band font-display text-base">{i + 1}</span>
                <span className="pt-1">{s}</span>
              </li>
            ))}
          </ol>
          {apple || google ? (
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              {apple ? (
                <a href={apple} rel="noopener" className="press inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[16px] border-2 border-cocoa bg-paper px-4 text-sm font-extrabold text-cocoa shadow-[0_3px_0_var(--color-cocoa)]">
                  <Icon icon={IconBrandApple} size={18} /> get it for iphone &amp; ipad
                </a>
              ) : null}
              {google ? (
                <a href={google} rel="noopener" className="press inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[16px] border-2 border-cocoa bg-paper px-4 text-sm font-extrabold text-cocoa shadow-[0_3px_0_var(--color-cocoa)]">
                  <Icon icon={IconBrandAndroid} size={18} /> get it for android
                </a>
              ) : null}
            </div>
          ) : (
            <p className="mt-6 rounded-[14px] bg-honey-band px-3 py-2 text-center text-xs font-semibold text-cocoa">snickerdoodle draw is coming to the app store and google play very soon.</p>
          )}
        </section>
      </main>
    </div>
  );
}
