import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/ui/primitives/Button';
import { MarketingMobileMenu } from '@/ui/components/MarketingMobileMenu';
import { AccountNav } from '@/ui/components/AccountNav';
import { getCurrentAccount } from '@/server/session';

/** Marketing surface: nav + footer, goal is "start creating". A signed-in parent also gets a way
 * back to their keepsakes + account (never a dead-end "log in"). */
export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const signedIn = (await getCurrentAccount()) !== null;
  return (
    <div className="kraft relative flex min-h-dvh flex-col overflow-x-hidden">
      <header className="pt-safe relative z-10">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-2.5" aria-label="snickerdoodle home">
            <img src="/brand/snickerdoodle-badge.png" alt="" width={44} height={44} className="rounded-full" />
            <span className="font-display text-2xl text-cocoa shadow-[inset_0_-8px_0_var(--color-honey)] md:text-3xl">snickerdoodle</span>
          </Link>
          <div className="hidden items-center gap-7 text-sm text-ink-soft md:flex">
            <Link href="/how-it-works" className="hover:text-cinnamon">
              how it works
            </Link>
            <Link href="/gifts" className="hover:text-cinnamon">
              gifts
            </Link>
            <Link href="/our-story" className="hover:text-cinnamon">
              our story
            </Link>
            <AccountNav signedIn={signedIn} />
            <Button href="/start-creating" size="md" className="ml-3">
              start creating
            </Button>
          </div>
          <MarketingMobileMenu signedIn={signedIn} />
        </nav>
      </header>

      <main id="main" className="relative z-10 flex-1">
        {children}
      </main>

      <footer className="relative z-10 bg-paper-2 px-6 py-5 text-xs text-ink-soft">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
          <span>snickerdoodle · made with care in the UK</span>
          <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <Link href="/trust/family-promise" className="hover:text-cinnamon">
              our promise
            </Link>
            <Link href="/trust/privacy" className="hover:text-cinnamon">
              privacy
            </Link>
            <Link href="/trust/cookies" className="hover:text-cinnamon">
              cookies
            </Link>
            <Link href="/trust/data-complaint" className="hover:text-cinnamon">
              data complaint
            </Link>
          </nav>
          <Button href="/start-creating" size="sm" className="text-xs">
            start creating
          </Button>
        </div>
      </footer>
    </div>
  );
}
