import type { ReactNode } from 'react';

/**
 * "A peek inside" on /draw (founder, 13 Nov 2026): one row of screenshots that scrolls sideways on phones AND
 * desktop. No scrollbar and no arrows (founder: subtle; people find it): the row starts in line with the
 * page's content and runs off the right edge, so it's plain there's more. Swipe, trackpad, shift + wheel and
 * the keyboard (the row takes focus; ← → scroll it) all work.
 */
export function PeekScroller({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="peek-row mt-8 overflow-x-auto pb-5 pt-3 focus-visible:outline-2">
      <ul className="flex w-max snap-x snap-mandatory items-center gap-5 md:items-start md:gap-7">{children}</ul>
    </div>
  );
}
