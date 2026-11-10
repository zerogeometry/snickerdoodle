'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * The few moments of Snickerdoodle Draw's motion that need a nudge from the page (globals.css "Motion
 * system" has the looks). Mounted once in the root layout; one listener for the whole site, no timers:
 *  - squishy buttons: letting go of a `.press` adds `.is-boing` (the spring back past full size);
 *  - comes alive: tapping a `[data-alive]` drawing plays `.is-alive` on its `.alive-art` (every tap
 *    replays it; the tap itself is never delayed or stopped, so links work exactly as before);
 *  - pop in on scroll: each `.pop-in-view` gets `.is-seen` the first time it scrolls into view.
 * Without this script nothing is hidden or broken: buttons keep their squash, cards just show.
 */
export function MotionTaps() {
  const pathname = usePathname();

  useEffect(() => {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    /** Replay a class's animation (taking it off and on again restarts it). */
    const replay = (el: Element, cls: string) => {
      el.classList.remove(cls);
      void (el as HTMLElement).offsetWidth;
      el.classList.add(cls);
    };
    const pressable = (t: EventTarget | null) => {
      const el = t instanceof Element ? t.closest('.press') : null;
      return el && !el.matches(':disabled, [aria-disabled="true"], [aria-busy="true"]') ? el : null;
    };

    const onDown = (e: PointerEvent) => pressable(e.target)?.classList.remove('is-boing');
    const onUp = (e: PointerEvent) => {
      const el = pressable(e.target);
      if (el && !still.matches) replay(el, 'is-boing');
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = pressable(e.target);
      if (el && !still.matches) replay(el, 'is-boing');
    };
    const onClick = (e: MouseEvent) => {
      const root = e.target instanceof Element ? e.target.closest('[data-alive]') : null;
      // the card that moves: the tapped root itself, the card around it (a keepsake tile's picture), or one inside
      const art = root ? (root.closest('.alive-art') ?? root.querySelector('.alive-art')) : null;
      if (art && !still.matches) replay(art, 'is-alive');
    };
    const onEnd = (e: AnimationEvent) => {
      const el = e.target as Element;
      if (e.animationName === 'boing') el.classList.remove('is-boing');
      else if (e.animationName === 'alive') el.classList.remove('is-alive');
    };

    document.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('pointerup', onUp, { passive: true });
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('click', onClick);
    document.addEventListener('animationend', onEnd);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('click', onClick);
      document.removeEventListener('animationend', onEnd);
    };
  }, []);

  // Pop in on scroll: watched afresh on every page (once per visit). Already-seen cards are left alone.
  useEffect(() => {
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('is-seen');
          io.unobserve(e.target);
        }
      },
      { threshold: 0.15 },
    );
    document.querySelectorAll('.pop-in-view:not(.is-seen)').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pathname]);

  return null;
}
