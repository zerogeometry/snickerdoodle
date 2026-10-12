import { redirect } from 'next/navigation';
import { loadHome } from '@/server/home';
import { HomeView } from './HomeView';

// The real, auth-gated keepsake home: the signed-in account's family, members,
// and kept keepsakes (DB-backed, private signed-URL images). Guests → /login.
export default async function HomePage({ searchParams }: { searchParams: Promise<{ family?: string }> }) {
  const { family } = await searchParams;
  const data = await loadHome(typeof family === 'string' ? family : null); // membership re-checked server-side
  if (!data) redirect('/login');
  return <HomeView data={data} />;
}
