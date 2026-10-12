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
