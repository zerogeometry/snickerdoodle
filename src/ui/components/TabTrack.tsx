'use client';

import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { cn } from '../cn';

/** The tab the bar showed last, so the next page's bar can slide from it. Module state lives across
 * client-side page changes; a full page load starts fresh (the pill just sits in place). */
let lastTab: number | null = null;

/**
 * The tab bar's track and its sunshine pill (BottomTabBar). When the chosen tab changes, the pill slides
 * over from the last one, stretched across 60% of the way it travels and a little flattened, then lands
 * (Draw's pill); `data-moving` makes the new tab's icon hop. All CSS (globals.css .tab-pill / .hop).
 */
export function TabTrack({ at, count, children }: { at: number; count: number; children: ReactNode }) {
  const from = lastTab;
  const moving = from !== null && from !== at;
  useEffect(() => {
    lastTab = at;
  }, [at]);
  const pill = {
    width: `${100 / count}%`,
    '--pill-to': at,
    '--pill-from': moving ? Math.min(from, at) : at,
    '--pill-k': moving ? 1 + 0.6 * Math.abs(at - from) : 1,
  } as unknown as CSSProperties;
  return (
    <div
      className="tab-track relative grid h-16 rounded-[22px] bg-cocoa shadow-[0_10px_24px_rgba(43,33,24,.3)]"
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
      data-moving={moving || undefined}
    >
      <span aria-hidden className={cn('tab-pill pointer-events-none absolute inset-y-0 left-0 p-[5px]', moving && 'is-moving')} style={pill}>
        <span className="block h-full w-full rounded-[17px] bg-honey" />
      </span>
      {children}
    </div>
  );
}
