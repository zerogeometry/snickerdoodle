import { redirect } from 'next/navigation';
import { loadHome } from '@/server/home';
import { HomeView } from './HomeView';

// The real, auth-gated keepsake home: the signed-in account's family, members,
// and kept keepsakes (DB-backed, private signed-URL images). Guests → /login.
export default async function HomePage() {
  const data = await loadHome();
  if (!data) redirect('/login');
  return <HomeView data={data} />;
}
