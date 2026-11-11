'use client';

import { IconX } from '@tabler/icons-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { DRAW_BUBBLE_HIDDEN_KEY, showsDrawBubble } from '@/lib/drawApp';
import { Icon } from '../primitives/Icon';

/** Gap between the bubble and whatever is pinned to the bottom of the screen (or the screen's edge). */
const GAP = 12;

/**
 * How far up the bubble must sit to clear the bar pinned to the bottom of a phone screen: the homepage's
 * "start creating" bar, a page's thumb-zone button, the app tab bar, the cookie choice. Each of those is a
 * full-width `fixed bottom-0` strip (hidden on desktop, so they measure 0 there). Returns 0 when none is up.
 */
function pinnedBarHeight(self: HTMLElement | null): number {
  const vh = window.innerHeight;
  let top = vh;
  document.querySelectorAll<HTMLElement>('.fixed.bottom-0, [data-bottom-bar]').forEach((el) => {
    if (self && (el === self || el.contains(self) || self.contains(el))) return;
    const r = el.getBoundingClientRect();
    if (r.height === 0 || r.width < window.innerWidth * 0.6 || r.bottom < vh - 2) return;
    top = Math.min(top, r.top);
  });
  return Math.max(0, vh - top);
}

/**
 * The floating "get the app" bubble (Snickerdoodle Draw): its app icon in a round sticker with a small ink
 * "LEARN TO DRAW" pill (founder, 11 Nov; was "GET THE APP") over the top-left, bottom-right of the screen, linking to /draw. Mounted ONCE (root
 * layout) and shown only on the browsing pages and the Keepsake Home (showsDrawBubble), never on a task
 * screen. On phones it floats just above whatever is pinned to the bottom, so it never covers a primary
 * action; on desktop it sits in the corner. A small × hides it for good in this browser (localStorage,
 * nothing sent anywhere). Renders nothing until mounted (no SSR/storage mismatch).
 *
 * The fixed wrapper never animates; the pop-in and squash live on its children (CLAUDE.md motion rule).
 */
export function DrawAppBubble({ iconSrc }: { iconSrc: string }) {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(true);
  const [lift, setLift] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const show = showsDrawBubble(pathname) && !hidden;

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(DRAW_BUBBLE_HIDDEN_KEY) === '1');
    } catch {
      setHidden(false); // storage blocked: show it (the × still hides it for this visit)
    }
  }, []);

  // keep clear of the bottom bars as they come and go (route changes, the cookie choice, rotating the phone)
  useEffect(() => {
    if (!show) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setLift(pinnedBarHeight(ref.current)));
    };
    measure();
    const mo = new MutationObserver(measure);
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      mo.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [show, pathname]);

  if (!show) return null;

  const close = () => {
    try {
      localStorage.setItem(DRAW_BUBBLE_HIDDEN_KEY, '1');
    } catch {
      /* storage blocked: hidden for this visit only */
    }
    setHidden(true);
  };

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed right-4 z-30 print:hidden md:right-6"
      style={{
        bottom: lift > 0 ? lift + GAP : `max(${GAP + 4}px, calc(env(safe-area-inset-bottom) + ${GAP}px))`,
      }}
    >
      <div className="pop-in pointer-events-auto relative" style={{ ['--i' as string]: 4 }}>
        <Link
          href="/draw"
          aria-label="learn to draw with the Snickerdoodle Draw app"
          className="press sticker relative block size-[60px] rounded-full bg-sunshine focus-visible:outline-2 focus-visible:outline-offset-4 md:size-[68px]"
        >
          <img src={iconSrc} alt="" width={68} height={68} decoding="async" className="block size-full rounded-full" />
          <span
            aria-hidden
            className="absolute -left-8 -top-2.5 -rotate-6 whitespace-nowrap rounded-pill bg-cocoa px-2 py-[3px] text-[9.5px] font-extrabold uppercase leading-none tracking-[0.06em] text-paper shadow-[0_2px_0_color-mix(in_srgb,var(--color-cocoa)_35%,transparent)]"
          >
            learn to draw
          </span>
        </Link>
        {/* the ×: a 44px tap area around a small visible dot, tucked on the top-right edge */}
        <button
          type="button"
          onClick={close}
          aria-label="hide the app bubble"
          className="absolute -right-5 -top-4 flex size-11 items-center justify-center rounded-full focus-visible:outline-2"
        >
          <span className="flex size-[22px] items-center justify-center rounded-full border-2 border-cocoa bg-paper text-cocoa">
            <Icon icon={IconX} size={12} stroke={3} />
          </span>
        </button>
      </div>
    </div>
  );
}
