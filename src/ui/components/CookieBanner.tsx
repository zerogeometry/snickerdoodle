'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/ui/primitives/Button';

const KEY = 'snickerdoodle.cookie-choice';
/** Fired by "cookie settings" (CookieSettingsButton) to bring the banner back, so a choice can be changed. */
export const COOKIE_SETTINGS_EVENT = 'sd:cookie-settings';

/**
 * Accessible cookie consent — privacy-first (essential only unless the user opts
 * in). Renders nothing until mounted (no SSR/localStorage mismatch) and remembers
 * the choice. Links to the full /trust/cookies policy. Both choices are equal on the first layer (same
 * button, same size — ICO cookie guidance, Children's Code std 13: no nudge toward the less private
 * option), and "cookie settings" in the footer reopens it (09-B10).
 */
export function CookieBanner() {
  const [show, setShow] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reopen = () => {
      try {
        setCurrent(localStorage.getItem(KEY));
      } catch {
        setCurrent(null);
      }
      setShow(true);
      requestAnimationFrame(() => ref.current?.focus());
    };
    window.addEventListener(COOKIE_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, reopen);
  }, []);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {
      /* storage blocked — show the banner anyway */
      setShow(true);
    }
  }, []);

  const choose = (choice: 'all' | 'essential') => {
    try {
      localStorage.setItem(KEY, choice);
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-label="Cookie choices"
      className="fixed inset-x-0 bottom-0 z-[55] border-t border-line bg-oat/95 px-4 py-4 backdrop-blur-sm motion-safe:animate-[slideup_.25s_ease] md:inset-x-auto md:bottom-4 md:left-4 md:max-w-sm md:rounded-2xl md:border md:shadow-xl"
    >
      <p className="text-[13px] leading-relaxed text-ink-soft">
        <b className="text-cocoa">A quick word on cookies.</b> We only use what we need to make the site work. Anything
        extra is up to you. <Link href="/trust/cookies" className="font-bold text-cinnamon underline">read more</Link>
      </p>
      {current ? (
        <p className="mt-1.5 text-[12px] text-ink-soft">
          right now: <b className="text-cocoa">{current === 'all' ? 'all cookies' : 'essential only'}</b>
        </p>
      ) : null}
      {/* the two choices look and weigh exactly the same — no nudge either way */}
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" size="md" className="flex-1" onClick={() => choose('all')}>
          accept all
        </Button>
        <Button variant="secondary" size="md" className="flex-1" onClick={() => choose('essential')}>
          essential only
        </Button>
      </div>
    </div>
  );
}
