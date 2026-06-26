'use client';

import { IconShoppingBag } from '@tabler/icons-react';
import Link from 'next/link';
import { Icon } from '../primitives/Icon';
import { APP_NAV } from './appTabs';
import { basketCount, useBasket } from '@/lib/store';

/** The desktop app-surface header: wordmark, canonical nav, basket, account. */
export function AppDesktopNav({ active }: { active: string }) {
  const count = basketCount(useBasket((s) => s.items));
  return (
    <header className="hidden items-center justify-between border-b border-[#EDE2CD] bg-oat px-6 py-3.5 md:flex">
      <Link href="/home" className="font-display text-xl font-semibold text-cocoa">
        snickerdoodle
      </Link>
      <nav className="flex items-center gap-5 text-sm text-[#7A6A58]">
        {APP_NAV.map((n) =>
          active === n.label ? (
            <span key={n.label} className="font-bold text-cinnamon">
              {n.label}
            </span>
          ) : (
            <Link key={n.label} href={n.href} className="hover:text-cinnamon">
              {n.label}
            </Link>
          ),
        )}
        <Link
          href="/checkout"
          aria-label={`Basket, ${count} items`}
          className="relative text-[#7A6A58] hover:text-cinnamon"
        >
          <Icon icon={IconShoppingBag} size={20} />
          {count > 0 ? (
            <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-cinnamon px-1 text-[10px] font-bold text-cta-text">
              {count}
            </span>
          ) : null}
        </Link>
        <Link
          href="/account"
          aria-label="Your account"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-cinnamon font-display text-xs font-bold text-cta-text"
        >
          S
        </Link>
      </nav>
    </header>
  );
}
