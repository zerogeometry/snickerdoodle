import type { Metadata } from 'next';
import { ConfirmWaitlist } from './ConfirmWaitlist';

export const metadata: Metadata = {
  title: 'join the founding families',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/** The double-opt-in landing from the confirmation email. The token stays in the page until the
 * person taps "yes" — loading the link alone (or a mail scanner fetching it) never consents. */
export default async function WaitlistConfirmPage({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
  const { t } = await searchParams;
  return (
    <div className="px-6 py-12 md:py-20">
      <div className="mx-auto max-w-xl">
        <ConfirmWaitlist token={typeof t === 'string' ? t : ''} />
      </div>
    </div>
  );
}
