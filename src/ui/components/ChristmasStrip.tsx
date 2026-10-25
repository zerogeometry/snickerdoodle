'use client';

import { IconMailHeart, IconPencil, IconTruckDelivery } from '@tabler/icons-react';
import Link from 'next/link';
import { christmasYear, formatShortDate, headlinePromise, isChristmasSeason } from '@/lib/season';
import { Icon } from '../primitives/Icon';
import { useNow } from '../useNow';

/**
 * The Christmas deadline strip (D24; mockups/christmas, screens 1 + 5). One honest line, computed
 * from src/lib/season.ts — never a countdown timer, never urgency theatre:
 *   in time    → "order by mon 14 dec for christmas"
 *   too late   → "missed the post? draw a thank-you instead"
 *   after 25th → "christmas done? draw a thank-you"
 * Renders nothing outside the season. `serverNowIso` lets a server layout render it on first paint
 * (no layout shift); without it the strip appears once the page is live in the browser.
 */
export function ChristmasStrip({ serverNowIso, compact = false }: { serverNowIso?: string; compact?: boolean }) {
  const now = useNow(serverNowIso);
  if (!now || !isChristmasSeason(now)) return null;
  const p = headlinePromise(now);
  if (p.state === 'off') return null;

  const afterChristmas = now.getTime() >= Date.UTC(christmasYear(now), 11, 25);
  const tone =
    p.state === 'in-time' ? 'bg-leaf-pale' : afterChristmas ? 'bg-sky-pale' : 'bg-berry-pale';
  const body =
    p.state === 'in-time' ? (
      <>
        <Icon icon={IconTruckDelivery} size={18} className="shrink-0 text-green-save" />
        <span>
          order by <b className="font-extrabold">{formatShortDate(p.lastOrderDate)}</b> for christmas
          {compact ? null : <span className="hidden sm:inline"> · draw it this weekend</span>}
        </span>
        <span className="ml-auto whitespace-nowrap font-extrabold text-cinnamon">dates</span>
      </>
    ) : afterChristmas ? (
      <>
        <Icon icon={IconPencil} size={18} className="shrink-0 text-cobalt" />
        <span>
          christmas done? <b className="font-extrabold">draw a thank-you</b> — card packs from £12
        </span>
      </>
    ) : (
      <>
        <Icon icon={IconMailHeart} size={18} className="shrink-0 text-cinnamon" />
        <span>
          missed the post? <b className="font-extrabold">draw a thank-you</b> instead — or a keepsake for next year
        </span>
      </>
    );

  return (
    <div className={compact ? 'px-3 pb-2' : 'mx-auto w-full max-w-6xl px-4 md:px-6'}>
      <Link
        href={p.state === 'in-time' ? '/christmas/delivery-dates' : '/start-creating'}
        className={`flex min-h-11 items-center gap-2 rounded-[14px] border-2 border-cocoa px-3 py-1.5 text-[13px] font-semibold text-cocoa ${tone}`}
      >
        {body}
      </Link>
    </div>
  );
}
