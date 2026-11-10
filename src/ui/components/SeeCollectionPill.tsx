'use client';

import { IconArrowDown } from '@tabler/icons-react';
import { useEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../primitives/Icon';

/**
 * Phones only (founder, 10 Nov 2026): once a drawing is up, the range sits below the drawing and its
 * buttons, out of sight. A small pill floats in the thumb zone, "see your collection" with a nudging
 * arrow, and scrolls down to it. It goes once the range has come into view (by the pill or by
 * scrolling), and comes back for the next drawing (`resetKey`).
 *
 * Rendered at the top of the page (a portal), never inside an animated ancestor, so it stays fixed.
 */
export function SeeCollectionPill({ targetRef, active, resetKey }: { targetRef: RefObject<HTMLElement | null>; active: boolean; resetKey: string | null }) {
  const [seen, setSeen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => setSeen(false), [resetKey]);

  useEffect(() => {
    const el = targetRef.current;
    if (!active || seen || !el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setSeen(true);
      },
      { rootMargin: '0px 0px -25% 0px' }, // counts once the heading is well onto the screen
    );
    io.observe(el);
    return () => io.disconnect();
  }, [targetRef, active, seen, resetKey]);

  if (!mounted || !active || seen) return null;

  const go = () => {
    const el = targetRef.current;
    if (el) {
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      // land the heading just under the sticky header, whatever its height (the christmas strip comes and goes)
      const header = document.querySelector('header')?.getBoundingClientRect().height ?? 0;
      const top = el.getBoundingClientRect().top + window.scrollY - header - 8;
      window.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
    }
    setSeen(true);
  };

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(16px,calc(env(safe-area-inset-bottom)+10px))] z-30 flex justify-center md:hidden">
      <button
        type="button"
        onClick={go}
        className="pop-in pointer-events-auto flex min-h-11 items-center gap-1.5 rounded-full border-2 border-cocoa bg-honey px-5 text-sm font-extrabold text-cocoa shadow-[0_3px_0_var(--color-cocoa),0_8px_18px_rgba(43,33,24,.18)] active:translate-y-px"
      >
        see your collection
        <Icon icon={IconArrowDown} size={18} stroke={2.5} className="nudge-down" />
      </button>
    </div>,
    document.body,
  );
}
