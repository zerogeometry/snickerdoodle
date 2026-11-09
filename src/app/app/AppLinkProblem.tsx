import { IconMoodSad } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { FlowHeader } from '@/ui/components/FlowHeader';
import { Icon } from '@/ui/primitives/Icon';

/** A friendly dead end for the Snickerdoodle Draw pages (a link that's gone or doesn't check out). */
export function AppLinkProblem({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <FlowHeader back={{ href: '/', label: 'Back to home' }} />
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-12">
        <section role="status" className="pop-in tape w-full max-w-sm rounded-[22px] border-2 border-cocoa bg-paper p-7 text-center shadow-[0_4px_0_var(--color-cocoa)]">
          <div className="sticker mx-auto flex h-16 w-16 -rotate-6 items-center justify-center rounded-full bg-honey-band">
            <Icon icon={IconMoodSad} size={30} className="text-cinnamon" />
          </div>
          <h1 className="mt-4 font-display text-[26px] leading-tight text-cocoa">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">{body}</p>
          {children}
        </section>
      </main>
    </div>
  );
}
