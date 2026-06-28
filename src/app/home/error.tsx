'use client';

import { Button } from '@/ui/primitives/Button';

/** Friendly fallback if loadHome throws (network / DB blip) — never a raw 500. */
export default function HomeError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-oat px-6 text-center">
      <h1 className="font-display text-2xl font-semibold text-cocoa">your keepsake home didn’t load</h1>
      <p className="mt-2 max-w-sm text-sm text-[#6F6358]">something hiccupped on our end — your keepsakes are safe. give it another go.</p>
      <Button size="lg" className="mt-5" onClick={reset}>
        try again
      </Button>
    </div>
  );
}
