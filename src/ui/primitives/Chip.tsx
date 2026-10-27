import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../cn';

/** Filter / relationship / tab chip — a little sticker that jiggles when tapped. */
export function Chip({
  active = false,
  className,
  children,
  ...rest
}: { active?: boolean; className?: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'wiggle inline-flex min-h-9 flex-none items-center rounded-pill border-2 px-3.5 py-1.5 text-[13px] font-bold transition-colors',
        active
          ? 'border-cocoa bg-cocoa text-paper'
          : 'border-cocoa/25 bg-paper text-ink-soft hover:border-cocoa',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * The same ink-outlined pill as {@link Chip}, as a little STICKER LABEL — not a control (no button, no
 * pressed state): a honey fill, tipped a touch, for a saving on a basket line ("multi-buy −10%").
 */
export function StickerChip({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex flex-none rotate-[-2deg] items-center rounded-pill border-2 border-cocoa bg-honey px-2 text-[10px] font-extrabold leading-4 text-cocoa', className)}>
      {children}
    </span>
  );
}
