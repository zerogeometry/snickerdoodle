import type { Metadata } from 'next';
import Link from 'next/link';
import { COMPANY } from '@/lib/company';
import { Prose } from '@/ui/components/Prose';

export const metadata: Metadata = {
  title: 'close your account',
  description: 'How to close your Snickerdoodle account, from the website or the Snickerdoodle Draw app, and exactly what happens.',
};

/**
 * The public "how to close your account" page (founder, 10 Nov 2026). Both app stores need a web link for deleting an
 * account that can be made from Snickerdoodle Draw, and the app's grown-ups' corner opens this page. It explains; the
 * closing itself happens on the account page (signed in), which shows exactly what will go before anything does.
 */
export default function DeleteAccountPage() {
  return (
    <div className="px-6 py-12 md:py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="pop-in font-display text-[40px] leading-[1.02] text-cocoa md:text-6xl">Close your account</h1>
      </div>

      <Prose className="mt-8">
        <p>
          You can close your Snickerdoodle account whenever you like, including one you made from the Snickerdoodle Draw
          app. It takes two taps, and we show you exactly what will go before anything does.
        </p>

        <h2>How</h2>
        <ol>
          <li>
            <Link href="/account?close=1">Sign in and open your account page</Link> (we&apos;ll email you a one-tap sign-in
            link if you&apos;re not signed in).
          </li>
          <li>
            At the bottom, tap <strong>Close your account</strong>. You&apos;ll see what happens to each family, and you
            can hand a family to someone else first if you like.
          </li>
          <li>Confirm, and it&apos;s done.</li>
        </ol>
        <p>
          Can&apos;t sign in? Email <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> from the address on the account
          and we&apos;ll close it for you.
        </p>

        <h2>What happens</h2>
        <ul>
          <li>
            Your keepsake box and its keepsakes are deleted, with every invite and gift list, unless you hand the family to
            someone else, in which case the little ones&apos; keepsakes carry on with them.
          </li>
          <li>
            Anything Snickerdoodle Draw sent goes too, and any phone linked to the account stops syncing at once.
          </li>
          <li>Your saved designs, credit, birthday nudges and email preferences are deleted.</li>
          <li>
            We keep the money side of past orders (what was bought and paid, for our accounts) with your name, email and
            address removed.
          </li>
          <li>You&apos;re signed out everywhere, and the account can&apos;t be used again. This can&apos;t be undone.</li>
        </ul>

        <h2>The drawings on your phone</h2>
        <p>
          Snickerdoodle Draw keeps its drawings on the phone, not with us. They stay there after you close your account. To
          remove them, delete them in the app or delete the app.
        </p>

        <p>
          More about what we keep and for how long is in our <Link href="/trust/privacy">privacy notice</Link>.
        </p>
      </Prose>
    </div>
  );
}
