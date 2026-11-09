import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { consumeAppCheckoutGrant } from '@/server/app/api';
import { getCurrentAccount } from '@/server/session';
import { AppLinkProblem } from '../../AppLinkProblem';
import { OpenInMaker } from './OpenInMaker';

export const metadata: Metadata = { title: 'make it real', robots: { index: false, follow: false }, referrer: 'no-referrer' };

/**
 * "make it real" from Snickerdoodle Draw lands here in the phone's browser. The pass only works for
 * the grown-up who linked the app, signed in here as themselves (it is never a sign-in on its own),
 * once, within 15 minutes. Then the keepsake opens on the product the child imagined and the usual
 * website flow takes over: the price is worked out here, card entry is Stripe's.
 */
export default async function AppCheckoutPage({ params }: { params: Promise<{ pass: string }> }) {
  const { pass } = await params;
  const account = await getCurrentAccount();
  if (!account) redirect(`/login?next=${encodeURIComponent(`/app/checkout/${pass}`)}`);

  const res = await consumeAppCheckoutGrant(getDb(), pass, account.id);
  if (!res.ok) {
    return res.reason === 'other-account' ? (
      <AppLinkProblem title="this one’s for another grown-up" body="it was made for the grown-up who linked snickerdoodle draw. sign in with their email, or tap “make it real” again in the app." />
    ) : (
      <AppLinkProblem title="that link has had its moment" body="make-it-real links work once, for 15 minutes. pop back to snickerdoodle draw and tap “make it real” again." />
    );
  }
  return <OpenInMaker assetId={res.assetId} productKey={res.productKey} />;
}
