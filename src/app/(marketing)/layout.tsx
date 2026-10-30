import { CookieSettingsButton } from '@/ui/components/CookieSettingsButton';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/ui/primitives/Button';
import { MarketingMobileMenu } from '@/ui/components/MarketingMobileMenu';
import { AccountNav } from '@/ui/components/AccountNav';
import { getCurrentAccount } from '@/server/session';
import { Logo } from '@/ui/components/Logo';
import { COMPANY } from '@/lib/company';
import { ChristmasStrip } from '@/ui/components/ChristmasStrip';

/** Marketing surface: nav + footer, goal is "start creating". A signed-in parent also gets a way
 * back to their keepsakes + account (never a dead-end "log in"). */
export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const signedIn = (await getCurrentAccount()) !== null;
  return (
    <div className="kraft relative flex min-h-dvh flex-col overflow-x-hidden">
      <header className="pt-safe relative z-10">
        <nav aria-label="main" className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-2.5" aria-label="snickerdoodle home">
            <Logo height={46} className="md:!h-[56px]" />
          </Link>
          <div className="hidden items-center gap-7 text-sm text-ink-soft md:flex">
            <Link href="/how-it-works" className="inline-flex min-h-11 items-center hover:text-cinnamon">
              how it works
            </Link>
            <Link href="/gifts" className="inline-flex min-h-11 items-center hover:text-cinnamon">
              gifts
            </Link>
            <Link href="/our-story" className="inline-flex min-h-11 items-center hover:text-cinnamon">
              our story
            </Link>
            <AccountNav signedIn={signedIn} />
            <Button href="/start-creating" size="md" className="ml-3">
              start creating
            </Button>
          </div>
          <MarketingMobileMenu signedIn={signedIn} />
        </nav>
        {/* Christmas (D24): the honest last-order line, 1 Nov → 6 Jan only. */}
        <ChristmasStrip serverNowIso={new Date().toISOString()} />
      </header>

      <main id="main" className="relative z-10 flex-1">
        {children}
      </main>

      <footer className="relative z-10 bg-paper-2 px-6 py-5 text-xs text-ink-soft">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
          <span>snickerdoodle · made with care in the UK</span>
          <nav aria-label="footer" className="flex flex-wrap items-center justify-center gap-x-4">
            <Link href="/faq" className="inline-flex min-h-11 min-w-11 items-center justify-center hover:text-cinnamon">
              FAQs
            </Link>
            <Link href="/help" className="inline-flex min-h-11 items-center hover:text-cinnamon">
              help &amp; contact
            </Link>
            <Link href="/trust/family-promise" className="inline-flex min-h-11 items-center hover:text-cinnamon">
              our promise
            </Link>
            <Link href="/trust/privacy" className="inline-flex min-h-11 min-w-11 items-center justify-center hover:text-cinnamon">
              privacy
            </Link>
            <Link href="/trust/cookies" className="inline-flex min-h-11 items-center hover:text-cinnamon">
              cookies
            </Link>
            <CookieSettingsButton className="inline-flex min-h-11 items-center hover:text-cinnamon" />
            <Link href="/trust/data-complaint" className="inline-flex min-h-11 items-center hover:text-cinnamon">
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
            <a href={`mailto:${COMPANY.email}`} className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-cinnamon">
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
