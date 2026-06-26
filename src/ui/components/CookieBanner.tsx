'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/ui/primitives/Button';

const KEY = 'snickerdoodle.cookie-choice';

/**
 * Accessible cookie consent — privacy-first (essential only unless the user opts
 * in). Renders nothing until mounted (no SSR/localStorage mismatch) and remembers
 * the choice. Links to the full /trust/cookies policy.
 */
export function CookieBanner() {
  const [show, setShow] = useState(false);

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
      role="dialog"
      aria-label="Cookie choices"
      className="fixed inset-x-0 bottom-0 z-[55] border-t border-[#EAD9BE] bg-oat/95 px-4 py-4 backdrop-blur-sm motion-safe:animate-[slideup_.25s_ease] md:inset-x-auto md:bottom-4 md:left-4 md:max-w-sm md:rounded-2xl md:border md:shadow-xl"
    >
      <p className="text-[13px] leading-relaxed text-[#5F564C]">
        <b className="text-cocoa">A quick word on cookies.</b> We only use what we need to make the site work. Anything
        extra is up to you. <Link href="/trust/cookies" className="font-bold text-cinnamon underline">read more</Link>
      </p>
      <div className="mt-3 flex gap-2">
        <Button size="md" className="flex-1" onClick={() => choose('all')}>
          accept all
        </Button>
        <Button variant="secondary" size="md" className="flex-1" onClick={() => choose('essential')}>
          essential only
        </Button>
      </div>
    </div>
  );
}
