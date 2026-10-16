import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isTestSite } from '@/lib/siteMode';
import { Logo } from '@/ui/components/Logo';
import { Button } from '@/ui/primitives/Button';

export const metadata: Metadata = { title: 'test site', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/** The test site's front door: one shared password. A plain form — works with no JS. */
export default async function TestGatePage({ searchParams }: { searchParams: Promise<{ next?: string; wrong?: string }> }) {
  if (!isTestSite()) notFound();
  const { next = '/', wrong } = await searchParams;
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="rounded-[22px] border-2 border-cocoa bg-paper p-6 shadow-[0_4px_0_var(--color-cocoa)]">
        <Logo height={44} />
        <h1 className="mt-4 font-display text-2xl font-extrabold text-cocoa">this is our test kitchen</h1>
        <p className="mt-2 text-sm text-ink-soft">
          snickerdoodle isn&apos;t open yet. If you&apos;re helping us test, pop in the password we gave you. Please use test drawings only, not a
          real child&apos;s. Nothing is charged and nothing is printed.
        </p>
        <form method="post" action="/api/test-gate" className="mt-5 space-y-3">
          <input type="hidden" name="next" value={next} />
          <label className="block text-xs font-extrabold uppercase tracking-wide text-ink-faint">
            password
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 block min-h-12 w-full rounded-[14px] border-2 border-cocoa/25 bg-paper px-3 text-base text-cocoa focus:border-cocoa"
            />
          </label>
          {wrong ? (
            <p role="alert" className="text-sm font-bold text-cinnamon">
              that&apos;s not it — try again?
            </p>
          ) : null}
          <Button type="submit" size="lg" className="w-full">
            let me in
          </Button>
        </form>
      </div>
    </main>
  );
}
