import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../cn';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

// ≥44px tap target (min-h-11). The gentle hover tilt is the "CTA wobble";
// the global prefers-reduced-motion rule neutralises it.
const base =
  'inline-flex items-center justify-center gap-2 rounded-pill font-extrabold leading-none transition-transform duration-200 hover:-rotate-[1.2deg] focus-visible:outline-2 disabled:pointer-events-none disabled:opacity-60';

const sizes: Record<Size, string> = {
  sm: 'min-h-11 px-4 text-sm',
  md: 'min-h-11 px-6 py-3 text-[15px]',
  lg: 'min-h-12 px-8 py-3.5 text-base',
};

const variants: Record<Variant, string> = {
  primary: 'bg-cta text-cta-text shadow-sm hover:bg-cinnamon',
  secondary: 'border-[1.5px] border-[#E0C7A8] bg-transparent text-cinnamon hover:bg-honey-band',
  ghost: 'bg-transparent text-cinnamon hover:bg-honey-band',
};

type BaseProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
};

export function Button({
  href,
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: BaseProps & { href?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = cn(base, sizes[size], variants[variant], className);
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
