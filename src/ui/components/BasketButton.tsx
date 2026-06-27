'use client';

import { IconShoppingBag } from '@tabler/icons-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/ui/primitives/Icon';
import { basketCount, useBasket } from '@/lib/store';

/**
 * The header basket — a bag with a live count bubble tallying the basket. The bubble
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
      className={`relative inline-flex items-center justify-center rounded-full p-1.5 text-[#7A6A58] transition-colors hover:text-cinnamon ${className}`}
    >
      <Icon icon={IconShoppingBag} size={20} />
      {show ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-cta px-1 text-[10px] font-bold leading-none text-cta-text">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}
