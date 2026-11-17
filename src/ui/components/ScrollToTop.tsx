'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { scrollToTopNow } from '@/lib/scrollTop';

/**
 * Every new page opens at its top, on every device (founder, 17 Nov 2026). Next.js only scrolls when the
 * new page's first element is out of view; a page that opens with a hidden input or a fixed bar counts
 * as "in view", so a shopper could land part-way down (e.g. "create another" from the bottom of the range).
 *
 * Runs in the layout phase, before any page's own effects, so a page that means to land somewhere else
 * (the create page after a Studio save opens at its range) still gets the last word. Left alone: the
 * first load, back / forward (the browser puts you back where you were), and links to a #section.
 */
export function ScrollToTop() {
  const pathname = usePathname();
  const first = useRef(true);
  const popped = useRef(false);

  useEffect(() => {
    const onPop = () => {
      popped.current = true;
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (popped.current) {
      popped.current = false;
      return;
    }
    if (window.location.hash) return;
    scrollToTopNow();
  }, [pathname]);

  return null;
}
