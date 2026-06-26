import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/ui/primitives/Button';
import { MarketingMobileMenu } from '@/ui/components/MarketingMobileMenu';

/** Marketing surface (logged-out): nav + footer, goal is "start creating". */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-hidden bg-oat">
      <header className="relative z-10 bg-oat/80 backdrop-blur-sm">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/" className="font-display text-3xl font-semibold text-cocoa">
            snickerdoodle
          </Link>
          <div className="hidden items-center gap-7 text-sm text-[#5F564C] md:flex">
            <Link href="/how-it-works" className="hover:text-cinnamon">
              how it works
            </Link>
            <Link href="/gifts" className="hover:text-cinnamon">
              gifts
            </Link>
            <Link href="/our-story" className="hover:text-cinnamon">
              our story
            </Link>
            <Link href="/login" className="hover:text-cinnamon">
              log in
            </Link>
            <Button href="/start-creating" size="md" className="ml-3">
              start creating
            </Button>
          </div>
          <MarketingMobileMenu />
        </nav>
      </header>

      <main id="main" className="relative z-10 flex-1">
        {children}
      </main>

      <footer className="relative z-10 bg-[#F1E7D4] px-6 py-5 text-xs text-[#6F6358]">
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
