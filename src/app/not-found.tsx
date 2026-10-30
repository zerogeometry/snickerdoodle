import type { Metadata } from 'next';
import { Button } from '@/ui/primitives/Button';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { FlowHeader } from '@/ui/components/FlowHeader';

export const metadata: Metadata = { title: 'page not found', robots: { index: false, follow: false } };

/**
 * Any address we don't have (09-B5): the brand's own "not found" card — logo, a main landmark for the
 * skip link, and two ways back — instead of the framework's bare 404.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <FlowHeader />
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-14">
        <div className="pop-in tape w-full max-w-sm rounded-[22px] border-2 border-cocoa bg-paper p-7 text-center shadow-[0_4px_0_var(--color-cocoa)]">
          <CaveatNote className="-rotate-2 text-2xl">oops — wonky bit</CaveatNote>
          <h1 className="mt-1 font-display text-2xl font-extrabold leading-tight text-cocoa">We can&apos;t find that page</h1>
          <p className="mt-2 text-sm text-ink-soft">The link may be old, or a letter got lost on the way. Nothing you&apos;ve made has gone anywhere.</p>
          <Button href="/start-creating" size="lg" className="mt-5 w-full">
            start creating
          </Button>
          <Button href="/" variant="secondary" size="lg" className="mt-2.5 w-full">
            back to the home page
          </Button>
        </div>
      </main>
    </div>
  );
}
