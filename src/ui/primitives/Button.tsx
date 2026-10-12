import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'design' | 'designOutline';
type Size = 'sm' | 'md' | 'lg';

// ≥44px tap target (min-h-11). Scrapbook buttons are chunky, rounded "stickers" that sit on a
// solid offset shadow and squash down onto it when pressed (.press). The global
// prefers-reduced-motion rule neutralises all of it.
const base =
  'press inline-flex items-center justify-center gap-2 rounded-[16px] font-extrabold leading-none focus-visible:outline-2 disabled:pointer-events-none disabled:opacity-60';

const sizes: Record<Size, string> = {
  sm: 'min-h-11 px-4 text-sm',
  md: 'min-h-11 px-6 py-3 text-[15px]',
  lg: 'min-h-12 px-8 py-3.5 text-base',
};

const variants: Record<Variant, string> = {
  primary: 'bg-cta text-cta-text shadow-[0_4px_0_var(--color-cta-deep)] active:shadow-[0_1px_0_var(--color-cta-deep)]',
  secondary:
    'border-2 border-cocoa bg-paper text-cocoa shadow-[0_3px_0_var(--color-cocoa)] hover:bg-honey-band active:shadow-[0_0_0_var(--color-cocoa)]',
  ghost: 'bg-transparent text-cinnamon hover:bg-honey-band',
  // Design / creative tools (cobalt) — visually distinct from the tomato TRANSACTION
  // CTAs so "magic edits" never read as a buy action.
  design: 'bg-cobalt text-white shadow-[0_4px_0_var(--color-cobalt-deep)] active:shadow-[0_1px_0_var(--color-cobalt-deep)]',
  designOutline: 'border-2 border-cobalt bg-paper text-cobalt hover:bg-sky-pale',
};

type BaseProps = {
  variant?: Variant;
  size?: Size;
  /** Adds the periodic ~3s attention wobble (reduced-motion-safe). */
  attention?: boolean;
  className?: string;
  children: ReactNode;
};

export function Button({
  href,
  variant = 'primary',
  size = 'md',
  attention = false,
  className,
  children,
  ...rest
}: BaseProps & { href?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = cn(base, sizes[size], variants[variant], attention && 'cta-attention', className);
  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
