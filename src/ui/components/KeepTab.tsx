'use client';

import { IconHeartPlus } from '@tabler/icons-react';
import { cn } from '../cn';
import { Icon } from '../primitives/Icon';
import { KeepPhotos } from './KeepPhotos';

/**
 * The tab bar's "keep" (founder, 17 Nov 2026): not a page — one tap opens the phone's own picker (camera or
 * photo library, many at once), then the keep window (KeepPhotos). Same look as the other tabs; it never holds
 * the sunshine pill, because you never "arrive" anywhere.
 */
export function KeepTab({ label }: { label: string }) {
  return (
    <KeepPhotos>
      {(pick, busy) => (
        <button
          type="button"
          onClick={pick}
          aria-busy={busy}
          aria-label="keep: add pictures to your keepsake box"
          data-testid="keep-tab"
          className={cn('press-soft relative flex min-h-11 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold lowercase text-oat/85')}
        >
          <span className="tab-icon inline-block">
            <Icon icon={IconHeartPlus} size={22} />
          </span>
          {label}
        </button>
      )}
    </KeepPhotos>
  );
}
