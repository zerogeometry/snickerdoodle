'use client';

import { IconChristmasTree } from '@tabler/icons-react';
import Link from 'next/link';
import { basketPromise, deliveryPromise, formatShortDate } from '@/lib/season';
import { Icon } from '../primitives/Icon';
import { useNow } from '../useNow';

/**
 * "arrives by christmas" for ONE product (the customize page) — or, with `lineKeys`, for a whole
 * basket (the range footer, checkout). Honest both ways: when it's too late it says so plainly.
 * Nothing at all outside the season (src/lib/season.ts).
 */
export function ChristmasPromise({
  productKey,
  attrs,
  lineKeys,
  labelFor,
}: {
  productKey?: string;
  attrs?: { size?: string | null; colour?: string | null };
  lineKeys?: readonly string[];
  /** basket mode: a line key → its shown name, to say WHICH items are too late */
  labelFor?: (lineKey: string) => string;
}) {
  const now = useNow();
  if (!now) return null;
  const p = lineKeys ? basketPromise(lineKeys, now) : productKey ? deliveryPromise(productKey, now, attrs) : ({ state: 'off' } as const);
  if (p.state === 'off') return null;

  if (p.state === 'in-time') {
    return (
      <p className="inline-flex max-w-full items-start gap-1.5 rounded-[12px] bg-leaf-pale px-2.5 py-1 text-xs font-bold leading-snug text-green-save">
        <Icon icon={IconChristmasTree} size={15} className="mt-px shrink-0" />
        <span className="min-w-0">
          {lineKeys ? 'it all arrives by christmas' : 'arrives by christmas'} if you order by {formatShortDate(p.lastOrderDate)}
        </span>
      </p>
    );
  }

  const lateKeys = (p as { lateLineKeys?: string[] }).lateLineKeys ?? [];
  const late = labelFor ? [...new Set(lateKeys.map(labelFor))] : [];
  return (
    <p className="inline-flex max-w-full items-start gap-1.5 rounded-[12px] bg-berry-pale px-2.5 py-1 text-xs font-bold leading-snug text-cinnamon">
      <Icon icon={IconChristmasTree} size={15} className="mt-px shrink-0" />
      <span className="min-w-0">
        {late.length > 0 ? `${late.join(', ')} won’t make it for christmas now` : 'too late for christmas now — but lovely any time'}{' '}
        <Link href="/christmas/delivery-dates" className="underline underline-offset-2">
          dates
        </Link>
      </span>
    </p>
  );
}
