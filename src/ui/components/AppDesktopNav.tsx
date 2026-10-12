'use client';

import { IconShoppingBag, IconUser } from '@tabler/icons-react';
import Link from 'next/link';
import { Icon } from '../primitives/Icon';
import { APP_NAV } from './appTabs';
import { basketCount, useBasket } from '@/lib/store';

/** The founder's badge logo (small sizes only until a hi-res original exists). */
function Badge({ size }: { size: number }) {
  return <img src="/brand/snickerdoodle-badge.png" alt="" width={size} height={size} className="rounded-full" />;
}

function BasketLink({ count, size }: { count: number; size: number }) {
  return (
    <Link
      href="/checkout"
      aria-label={`Basket, ${count} items`}
      className="press relative flex h-11 w-11 items-center justify-center rounded-[14px] border-2 border-cocoa bg-paper text-cocoa"
    >
      <Icon icon={IconShoppingBag} size={size} />
      {count > 0 ? (
        <span className="pop-in absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-cta px-1 text-[11px] font-extrabold text-cta-text">
          {count}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * The app-surface header. Phones get a compact native-style bar (logo · basket · account),
 * sticky under the status bar; desktop gets the full nav. The bottom tab bar carries
 * navigation on phones, so the mobile bar stays deliberately quiet.
 */
export function AppDesktopNav({ active }: { active: string }) {
  const count = basketCount(useBasket((s) => s.items));
  return (
    <>
      <header className="pt-safe kraft sticky top-0 z-30 flex items-center justify-between px-4 py-2 md:hidden">
        <Link href="/home" aria-label="snickerdoodle home" className="flex items-center gap-2">
          <Badge size={36} />
          <span className="font-display text-lg text-cocoa">snickerdoodle</span>
        </Link>
        <div className="flex items-center gap-2">
          <BasketLink count={count} size={20} />
          <Link
            href="/account"
            aria-label="Your account"
            className="press flex h-11 w-11 items-center justify-center rounded-full border-2 border-cocoa bg-honey text-cocoa"
          >
            <Icon icon={IconUser} size={18} />
          </Link>
        </div>
      </header>

      <header className="hidden items-center justify-between border-b-2 border-cocoa/10 px-6 py-3 md:flex">
        <Link href="/home" className="flex items-center gap-2.5">
          <Badge size={40} />
          <span className="font-display text-xl text-cocoa shadow-[inset_0_-7px_0_var(--color-honey)]">snickerdoodle</span>
        </Link>
        <nav className="flex items-center gap-1.5 text-sm">
          {APP_NAV.map((n) =>
            active === n.label ? (
              <span key={n.label} aria-current="page" className="rounded-pill bg-cocoa px-4 py-2 font-extrabold lowercase text-paper">
                {n.label}
              </span>
            ) : (
              <Link key={n.label} href={n.href} className="wiggle rounded-pill px-4 py-2 font-bold lowercase text-ink-soft hover:bg-paper">
                {n.label}
              </Link>
            ),
          )}
          <span className="ml-2">
            <BasketLink count={count} size={20} />
          </span>
          <Link
            href="/account"
            aria-label="Your account"
            className="press flex h-11 w-11 items-center justify-center rounded-full border-2 border-cocoa bg-honey text-cocoa"
          >
            <Icon icon={IconUser} size={18} />
          </Link>
        </nav>
      </header>
    </>
  );
}
