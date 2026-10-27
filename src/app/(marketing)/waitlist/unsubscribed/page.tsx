import type { Metadata } from 'next';
import { Button } from '@/ui/primitives/Button';

export const metadata: Metadata = {
  title: 'unsubscribed',
  robots: { index: false, follow: false },
};

/** Where the one-tap unsubscribe link lands. The same page whatever the token was (reveals nothing). */
export default function WaitlistUnsubscribedPage() {
  return (
    <div className="px-6 py-12 md:py-20">
      <div className="mx-auto max-w-xl">
        <div role="status" className="tape pop-in rounded-[22px] border-2 border-cocoa bg-paper p-6 shadow-[0_4px_0_var(--color-cocoa)] md:p-8">
          <h1 className="font-display text-3xl text-cocoa">done — you&apos;re off the list</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
            We won&apos;t send you any more snickerdoodle news. No hard feelings — and if you ever fancy hearing from us
            again, you can pop your email back in on the home page.
          </p>
          <div className="mt-6">
            <Button href="/" variant="secondary" size="lg" className="w-full sm:w-auto">
              back to the home page
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
