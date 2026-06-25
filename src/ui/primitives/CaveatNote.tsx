import type { ReactNode } from 'react';
import { cn } from '../cn';

/** The artist's-hand accent (Caveat). One handwritten moment per view, max. */
export function CaveatNote({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('font-hand text-cinnamon', className)}>{children}</p>;
}
