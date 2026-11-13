'use client';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../primitives/Icon';

/**
 * "A peek inside" on /draw (founder, 13 Nov 2026): one row of screenshots that scrolls sideways on phones AND
 * desktop. The row starts in line with the page's content and runs off the right edge, so it's plain there's
 * more. Swipe, trackpad, scrollbar or keyboard (the row takes focus; ← → scroll it) all work; for a mouse
 * without a sideways wheel there are two sticker arrows, which grey out at each end.
 */
export function PeekScroller({ label, children }: { label: string; children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const update = () => {
      setAtStart(el.scrollLeft <= 4);
      setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const go = (dir: -1 | 1) => {
    const el = row.current;
    if (!el) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.75, behavior: still ? 'auto' : 'smooth' });
  };

  const arrow = 'press sticker flex size-11 items-center justify-center rounded-full bg-paper text-cocoa disabled:pointer-events-none disabled:opacity-35';
  return (
    <div className="relative">
      <div className="mx-auto hidden max-w-6xl justify-end gap-3 px-6 md:-mt-14 md:mb-3 md:flex">
        <button type="button" className={arrow} onClick={() => go(-1)} disabled={atStart} aria-label="earlier screenshots">
          <Icon icon={IconChevronLeft} size={22} stroke={2.5} />
        </button>
        <button type="button" className={arrow} onClick={() => go(1)} disabled={atEnd} aria-label="more screenshots">
          <Icon icon={IconChevronRight} size={22} stroke={2.5} />
        </button>
      </div>
      <div
        ref={row}
        role="region"
        aria-label={label}
        tabIndex={0}
        className="peek-row brand-scroll mt-8 overflow-x-auto pb-5 pt-3 focus-visible:outline-2 md:mt-0"
      >
        <ul className="flex w-max snap-x snap-mandatory items-center gap-5 md:items-start md:gap-7">{children}</ul>
      </div>
    </div>
  );
}
