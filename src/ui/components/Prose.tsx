import type { ReactNode } from 'react';
import { cn } from '../cn';

/** Readable, brand-styled prose for the trust/legal pages. */
export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'mx-auto max-w-2xl',
        '[&>h2]:mt-9 [&>h2]:font-display [&>h2]:text-xl [&>h2]:font-semibold [&>h2]:text-cocoa',
        '[&>h3]:mt-7 [&>h3]:font-display [&>h3]:text-base [&>h3]:font-semibold [&>h3]:text-cocoa',
        '[&>p]:mt-3 [&>p]:text-[15px] [&>p]:leading-relaxed [&>p]:text-[#5F564C]',
        '[&>ul]:mt-3 [&>ul]:list-disc [&>ul]:space-y-1.5 [&>ul]:pl-5 [&>ul]:text-[15px] [&>ul]:leading-relaxed [&>ul]:text-[#5F564C]',
        '[&_strong]:font-semibold [&_strong]:text-cocoa [&_a]:text-cinnamon [&_a]:underline',
        className,
      )}
    >
      {children}
    </div>
  );
}
