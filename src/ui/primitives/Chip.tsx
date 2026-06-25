import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../cn';

/** Filter / relationship / tab chip. Matches the mockups' pill chips. */
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
        'inline-flex flex-none items-center rounded-pill border-[1.5px] px-3.5 py-1.5 text-xs font-bold transition-colors',
        active
          ? 'border-cinnamon bg-cinnamon text-cta-text'
          : 'border-[#E0C7A8] bg-transparent text-[#7A6A58] hover:bg-honey-band',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
