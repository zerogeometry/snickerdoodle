'use client';

import { IconShoppingBag } from '@tabler/icons-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/ui/primitives/Icon';
import { basketCount, useBasket } from '@/lib/store';

/**
 * The header basket — a sticker-square bag (matches the app shell's) with a live count bubble tallying the basket. The bubble
 * is mounted client-side only (the basket persists in sessionStorage, absent on the
 * server) to avoid a hydration mismatch. Tapping it opens the basket (checkout).
 */
export function BasketButton({ className = '' }: { className?: string }) {
  const count = useBasket((s) => basketCount(s.items));
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const show = mounted && count > 0;

  return (
    <Link
      href="/checkout"
      aria-label={show ? `basket — ${count} item${count === 1 ? '' : 's'}` : 'basket'}
      className={`press relative inline-flex h-11 w-11 items-center justify-center rounded-[14px] border-2 border-cocoa bg-paper text-cocoa shadow-[0_2px_0_var(--color-cocoa)] ${className}`}
    >
      <Icon icon={IconShoppingBag} size={20} />
      {show ? (
        <span className="pop-in absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-cta px-1 text-[11px] font-extrabold leading-none text-cta-text">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}
