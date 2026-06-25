import { IconMenu2 } from '@tabler/icons-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/ui/primitives/Icon';
import { Button } from '@/ui/primitives/Button';

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
          <button type="button" aria-label="Open menu" className="md:hidden">
            <Icon icon={IconMenu2} size={26} className="text-[#7A6A58]" />
          </button>
        </nav>
      </header>

      <main id="main" className="relative z-10 flex-1">
        {children}
      </main>

      <footer className="relative z-10 flex items-center justify-between gap-4 bg-[#F1E7D4] px-6 py-5 text-xs text-[#6F6358]">
        <span>snickerdoodle · made with care in the UK</span>
        <Button href="/start-creating" size="sm" className="text-xs">
          start creating
        </Button>
      </footer>
    </div>
  );
}
