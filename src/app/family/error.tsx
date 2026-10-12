'use client';

import { IconRefresh } from '@tabler/icons-react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';

/** Friendly fallback if loadFamily throws — never a raw 500. */
export default function FamilyError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-oat px-6 text-center">
      <span className="sticker pop-in flex h-16 w-16 -rotate-6 items-center justify-center rounded-full bg-honey text-cocoa" aria-hidden>
        <Icon icon={IconRefresh} size={28} />
      </span>
      <h1 className="mt-5 font-display text-[28px] leading-tight text-cocoa">your family circle didn’t load</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-soft">a momentary hiccup — give it another go.</p>
      <Button size="lg" className="mt-5" onClick={reset}>
        try again
      </Button>
    </div>
  );
}
