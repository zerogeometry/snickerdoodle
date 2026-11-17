import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { offerPasskeyAfterSignIn } from '@/server/freshSignIn';
import { loadHome } from '@/server/home';
import { getCurrentAccount } from '@/server/session';
import { HomeView } from './HomeView';

// The real, auth-gated keepsake home: the signed-in account's family, members,
// and kept keepsakes (DB-backed, private signed-URL images). Guests → /login.
export default async function HomePage({ searchParams }: { searchParams: Promise<{ family?: string; joined?: string }> }) {
  const { family, joined } = await searchParams;
  const data = await loadHome(typeof family === 'string' ? family : null); // membership re-checked server-side
  if (!data) redirect('/login');
  const account = await getCurrentAccount();
  const offerPasskey = account ? await offerPasskeyAfterSignIn(getDb(), account.id).catch(() => false) : false;
  return <HomeView data={data} joined={joined === '1'} offerPasskey={offerPasskey} />;
}
