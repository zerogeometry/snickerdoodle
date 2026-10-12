import type { ReactNode } from 'react';
import { cn } from '../cn';

/** Readable, brand-styled prose for the trust/legal pages. */
export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        // Scrapbook (D12): the text sits on a paper sheet laid on the kraft page, so long legal
        // copy stays calm and readable (cocoa / ink-soft on paper, both AA).
        'mx-auto max-w-2xl rounded-[22px] border-2 border-cocoa/10 bg-paper px-5 py-6 shadow-[0_6px_14px_color-mix(in_srgb,var(--color-cocoa)_8%,transparent)] md:px-9 md:py-8',
        '[&>:first-child]:mt-0',
        '[&>h2]:mt-9 [&>h2]:font-display [&>h2]:font-extrabold [&>h2]:tracking-tight [&>h2]:text-2xl [&>h2]:leading-tight [&>h2]:text-cocoa',
        '[&>h3]:mt-7 [&>h3]:font-display [&>h3]:font-extrabold [&>h3]:tracking-tight [&>h3]:text-lg [&>h3]:leading-snug [&>h3]:text-cocoa',
        '[&>p]:mt-3 [&>p]:text-[15px] [&>p]:leading-relaxed [&>p]:text-ink-soft',
        '[&>ul]:mt-3 [&>ul]:list-disc [&>ul]:space-y-1.5 [&>ul]:pl-5 [&>ul]:text-[15px] [&>ul]:leading-relaxed [&>ul]:text-ink-soft',
        '[&_strong]:font-semibold [&_strong]:text-cocoa [&_a]:text-cinnamon [&_a]:underline',
        className,
      )}
    >
      {children}
    </div>
  );
}
