'use client';

import { IconAlertCircle, IconCircleCheck } from '@tabler/icons-react';
import { Icon } from '@/ui/primitives/Icon';

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'text';

/**
 * The Studio's quiet autosave line: "saving…" while changes are on their way, "saved" once the
 * server has them. A failed save says so plainly and offers a retry; words that can't be printed
 * are never saved, and it says why.
 */
export function SaveStatus({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === 'idle') return <span role="status" aria-live="polite" className="sr-only" />;
  if (state === 'error' || state === 'text') {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="flex min-h-11 items-center gap-1 rounded-pill bg-honey-band px-3 text-[11px] font-extrabold text-cocoa"
        role="status"
        aria-live="polite"
      >
        <Icon icon={IconAlertCircle} size={14} className="shrink-0 text-cinnamon" />
        {state === 'text' ? 'not saved — some words can’t be printed' : 'not saved yet · try again'}
      </button>
    );
  }
  return (
    <span role="status" aria-live="polite" className="flex min-h-11 items-center gap-1 px-1 text-[11px] font-bold text-ink-soft">
      {state === 'saved' ? (
        <>
          <Icon icon={IconCircleCheck} size={14} className="shrink-0 text-green-save" /> saved
        </>
      ) : (
        'saving…'
      )}
    </span>
  );
}
