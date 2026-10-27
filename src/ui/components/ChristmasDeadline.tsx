import { IconMailHeart, IconTruckDelivery } from '@tabler/icons-react';
import Link from 'next/link';
import { christmasDeadlines, formatShortDate, isChristmasSeason, seasonClock } from '@/lib/season';
import { Icon } from '../primitives/Icon';

/**
 * The honest deadline card on the evergreen /christmas pages (server-rendered, per request). Same
 * dates as the strip and /christmas/delivery-dates (src/lib/season.ts), but shown all year — families
 * plan before November. In season (1 Nov → 6 Jan) the strip under the header carries it instead.
 * Never a countdown; when it's too late it says so and offers the thank-you.
 */
export function ChristmasDeadline({ className = '' }: { className?: string }) {
  const now = seasonClock(new Date());
  // in season the layout's ChristmasStrip already says this, right under the header — never twice
  if (isChristmasSeason(now)) return null;
  const d = christmasDeadlines(now);
  if (d.state === 'upcoming') {
    return (
      <Link
        href="/christmas/delivery-dates"
        className={`press flex min-h-11 items-start gap-2.5 rounded-[16px] border-2 border-cocoa bg-leaf-pale px-4 py-3 text-[14px] leading-snug text-cocoa shadow-[0_3px_0_var(--color-cocoa)] ${className}`}
      >
        <Icon icon={IconTruckDelivery} size={20} className="mt-px shrink-0 text-green-save" />
        <span className="min-w-0 flex-1">
          order by <b className="font-extrabold">{formatShortDate(d.mostThings)}</b> for christmas
          {d.cardsMissed ? null : (
            <>
              {' '}
              · cards by <b className="font-extrabold">{formatShortDate(d.cards)}</b>
            </>
          )}
          <span className="block text-[12px] text-ink-soft">
            draw it this weekend{d.provisional ? ' · safe dates — we’ll only ever move them later' : ''}
          </span>
        </span>
        <span className="shrink-0 self-center font-extrabold text-cinnamon underline underline-offset-2">all dates</span>
      </Link>
    );
  }
  return (
    <div className={`flex min-h-11 items-start gap-2.5 rounded-[16px] border-2 border-cocoa bg-berry-pale px-4 py-3 text-[14px] leading-snug text-cocoa ${className}`}>
      <Icon icon={IconMailHeart} size={20} className="mt-px shrink-0 text-cinnamon" />
      <span>
        {d.state === 'missed' ? (
          <>
            too late for christmas {d.year} now — <b className="font-extrabold">draw a thank-you instead</b>, or a keepsake that’s lovely any time.
          </>
        ) : (
          <>
            our last order dates for christmas {d.year} go up in the autumn — <b className="font-extrabold">a keepsake is lovely any time</b>.
          </>
        )}
      </span>
    </div>
  );
}
