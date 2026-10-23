import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/ui/primitives/Button';
import { MarketingMobileMenu } from '@/ui/components/MarketingMobileMenu';
import { AccountNav } from '@/ui/components/AccountNav';
import { getCurrentAccount } from '@/server/session';
import { Logo } from '@/ui/components/Logo';
import { COMPANY } from '@/lib/company';

/** Marketing surface: nav + footer, goal is "start creating". A signed-in parent also gets a way
 * back to their keepsakes + account (never a dead-end "log in"). */
export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const signedIn = (await getCurrentAccount()) !== null;
  return (
    <div className="kraft relative flex min-h-dvh flex-col overflow-x-hidden">
      <header className="pt-safe relative z-10">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-2.5" aria-label="snickerdoodle home">
            <Logo height={46} className="md:!h-[56px]" />
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
          <nav aria-label="footer" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <Link href="/faq" className="hover:text-cinnamon">
              FAQs
            </Link>
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
        {/* who we are — the company behind the shop (the same details as the invoices + schema) */}
        <address className="mx-auto mt-4 max-w-6xl border-t border-cocoa/10 pt-4 text-center text-[11px] not-italic leading-relaxed text-ink-faint sm:text-left">
          <span className="block font-bold text-ink-soft">
            {COMPANY.legalName} (t/a {COMPANY.tradingAs})
          </span>
          <span className="block">
            {COMPANY.street}, {COMPANY.city} {COMPANY.postcode} ·{' '}
            <a href={`mailto:${COMPANY.email}`} className="underline underline-offset-2 hover:text-cinnamon">
              {COMPANY.email}
            </a>
          </span>
          <span className="block">
            Registered in {COMPANY.registeredIn} · Company No: {COMPANY.companyNumber} · VAT No: {COMPANY.vatNumber}
          </span>
        </address>
      </footer>
    </div>
  );
}
